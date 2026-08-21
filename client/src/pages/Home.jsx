import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import LatexText from '../components/LatexText'
import EditorialLanding from '../components/EditorialLanding'
import { captureAction, captureAppError, captureTiming, elapsedSince, startTimer } from '../lib/instrumentation'

function isArxivInput(val) {
  if (!val?.trim()) return false
  const trimmed = val.trim()
  return /arxiv\.org\/(?:abs|pdf)\/\d{4}\.\d{4,5}(?:v\d+)?/i.test(trimmed) || /^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(trimmed)
}

function isHttpsUrl(val) {
  try {
    return new URL(val?.trim()).protocol === 'https:'
  } catch {
    return false
  }
}

function splitImportInputs(value) {
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function getArxivPreviewKey(val) {
  const trimmed = val?.trim() || ''
  const urlMatch = trimmed.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/i)
  if (urlMatch) return urlMatch[1]
  const idMatch = trimmed.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/i)
  return idMatch?.[1] || null
}

const SLASH_COMMANDS = [
  { id: 'search', slug: 'library', label: 'Library', prefix: '/library ' },
  { id: 'add', slug: 'add', label: 'Add paper', prefix: '/add ' },
  { id: 'upload', slug: 'upload', label: 'Upload', prefix: null },
  { id: 'backup', slug: 'backup', label: 'Backup library', desc: 'Save a local copy of the database', prefix: null },
  { id: 'help', slug: 'help', label: 'Help', prefix: null },
  { id: 'collections', slug: 'collections', label: 'Collections', prefix: null },
]

let greetingIndexForPageLoad = null

function pickGreetingIndex(count) {
  if (greetingIndexForPageLoad !== null) return greetingIndexForPageLoad

  const storageKey = 'readxiv-last-greeting-index'
  let previousIndex = -1
  try {
    previousIndex = Number.parseInt(sessionStorage.getItem(storageKey) || '-1', 10)
  } catch {}

  const randomIndex = Math.floor(Math.random() * count)
  greetingIndexForPageLoad = count > 1 && randomIndex === previousIndex
    ? (randomIndex + 1) % count
    : randomIndex

  try {
    sessionStorage.setItem(storageKey, String(greetingIndexForPageLoad))
  } catch {}
  return greetingIndexForPageLoad
}

export default function Home({
  setPage,
  openPaper,
  focusNonce,
  initialArxivInput,
  onInitialArxivInputConsumed,
  onSearchQuery,
  addToast,
}) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [batchImport, setBatchImport] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [showHowtoModal, setShowHowtoModal] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [currentMode, setCurrentMode] = useState('normal')
  const [searchQuery, setSearchQuery] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [previewQuery, setPreviewQuery] = useState('')
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [memoryPapers, setMemoryPapers] = useState([])
  const [importantPapers, setImportantPapers] = useState([])
  const [memorySelectedIndex, setMemorySelectedIndex] = useState(0)
  const [liveResults, setLiveResults] = useState([])
  const [liveSelectedIndex, setLiveSelectedIndex] = useState(0)
  const [homeSummary, setHomeSummary] = useState(null)
  const [deskView, setDeskView] = useState('now')
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const slashMenuRef = useRef(null)
  const pollingRef = useRef(null)
  const previewCacheRef = useRef(new Map())
  const handledInitialArxivInputRef = useRef(null)

  const GREETINGS = [
    <>Your brain is a <em>sponge</em>. Feed it papers.</>,
    <>Another day, another paper to the <em>pile</em>.</>,
    <>Another one.</>,
    <>Really, you&apos;re back here again? What&apos;s wrong with you?</>,
    <>Your unread pile called. It&apos;s <em>thriving</em>.</>,
    <>Let&apos;s pretend this one won&apos;t become technical debt.</>,
    <>One more PDF. As a <em>treat</em>.</>,
    <>Today&apos;s plan: skim boldly, understand eventually.</>,
    <>Drop the paper. We&apos;ll judge it together.</>,
    <>Another abstract to overestimate and under-read.</>,
    <>Sure, add it. Future you can handle the consequences.</>,
    <>Let&apos;s add the paper and call it progress.</>,

    <>Your reading list <em>{'>>>>>>'}</em> your friends list.</>,
    <>New paper? Did you finish the last one?</>,
    <>Another paper enters. Your weekend leaves.</>,
    <>Add it now, panic about the <em>related work</em> later.</>,
    <>Hoarding PDFs is basically a personality now?</>,
    <>Seriously? Can we stop and go touch some grass?</>,

    <>Ah yes, more papers. That reading list won&apos;t <em>not</em> finish itself.</>,
    <>Bold of you to add another one when your last paper is still at page 2.</>,
    <>At this point you&apos;re just <em>collecting</em> PDFs like Pokémon.</>,
    <>You&apos;re not going to read this one either, but sure.</>,
    <>Citation count: impressive. Papers actually read: <em>we both know</em>.</>,

  ]

  const [greeting] = useState(() => GREETINGS[pickGreetingIndex(GREETINGS.length)])

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
  }, [])

  const refreshHomeData = useCallback(() => {
    let cancelled = false
    Promise.allSettled([
      axios.get('/api/papers/recents', { params: { limit: 10 } }),
      axios.get('/api/papers/important'),
      axios.get('/api/dashboard/summary', { params: { days: 182 } }),
    ])
      .then(([recentsResult, importantResult, summaryResult]) => {
        if (cancelled) return
        if (recentsResult.status === 'fulfilled') {
          setMemoryPapers(Array.isArray(recentsResult.value.data) ? recentsResult.value.data : [])
        }
        if (importantResult.status === 'fulfilled') {
          setImportantPapers(Array.isArray(importantResult.value.data) ? importantResult.value.data : [])
        }
        if (summaryResult.status === 'fulfilled') {
          setHomeSummary(summaryResult.value.data)
        }
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => refreshHomeData(), [refreshHomeData])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshHomeData()
    }
    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('readxiv:paper-accessed', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('readxiv:paper-accessed', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshHomeData])

  const continuePaper = useMemo(
    () => memoryPapers.find((paper) => Number(paper.current_page) > 1 || paper.status === 'reading') || memoryPapers[0] || null,
    [memoryPapers]
  )
  const memoryItems = useMemo(
    () => {
      const editorialContinue = homeSummary?.continuePaper || continuePaper
      const papers = [editorialContinue, ...importantPapers].filter(Boolean)
      return [...new Map(papers.map((paper) => [paper.id, paper])).values()]
    },
    [continuePaper, homeSummary, importantPapers]
  )
  const liveQuery = currentMode === 'normal' && !isArxivInput(input) && !input.trim().startsWith('/')
    ? input.trim()
    : ''

  useEffect(() => {
    if (liveQuery.length < 2) {
      setLiveResults([])
      setLiveSelectedIndex(0)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      axios.get('/api/search', { params: { q: liveQuery } })
        .then(({ data }) => {
          if (!cancelled) {
            setLiveResults((Array.isArray(data) ? data : []).slice(0, 6))
            setLiveSelectedIndex(0)
          }
        })
        .catch(() => { if (!cancelled) setLiveResults([]) })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [liveQuery])

  useEffect(() => {
    if (isFocused || memoryItems.length === 0) return undefined
    const onMemoryKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setMemorySelectedIndex((index) => Math.min(index + 1, memoryItems.length - 1))
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setMemorySelectedIndex((index) => Math.max(index - 1, 0))
      } else if (event.key === 'Enter') {
        event.preventDefault()
        openPaper?.(memoryItems[memorySelectedIndex])
      }
    }
    window.addEventListener('keydown', onMemoryKeyDown)
    return () => window.removeEventListener('keydown', onMemoryKeyDown)
  }, [isFocused, memoryItems, memorySelectedIndex, openPaper])

  useEffect(() => {
    if (!focusNonce) return
    inputRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    const onSlashKeyDown = (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return
      event.preventDefault()
      setInput('/')
      setCurrentMode('normal')
      setIsFocused(true)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    window.addEventListener('keydown', onSlashKeyDown)
    return () => window.removeEventListener('keydown', onSlashKeyDown)
  }, [])

  // `t` toggles the desk between Reading and Stats (ignored while typing/focused)
  useEffect(() => {
    if (isFocused) return undefined
    const onDeskToggle = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault()
        setDeskView((current) => (current === 'now' ? 'stats' : 'now'))
      }
    }
    window.addEventListener('keydown', onDeskToggle)
    return () => window.removeEventListener('keydown', onDeskToggle)
  }, [isFocused])

  useEffect(() => {
    if (!initialArxivInput) return
    if (handledInitialArxivInputRef.current === initialArxivInput) return
    handledInitialArxivInputRef.current = initialArxivInput
    setInput(initialArxivInput)
    inputRef.current?.focus()
    handleArxivAdd(initialArxivInput).finally(() => {
      onInitialArxivInputConsumed?.()
    })
  }, [initialArxivInput])

  useEffect(() => {
    const val = input.trim()
    if (val.startsWith('/library ')) {
      setCurrentMode('search')
      setSearchQuery(val.substring(9).trim())
    } else if (val === '/library') {
      setCurrentMode('search')
      setSearchQuery('')
    } else if (val.startsWith('/search ')) {
      setCurrentMode('search')
      setSearchQuery(val.substring(8).trim())
    } else if (val === '/search') {
      setCurrentMode('search')
      setSearchQuery('')
    } else if (val.startsWith('/add ')) {
      setCurrentMode('add')
      setAddQuery(val.substring(5).trim())
    } else if (val === '/add') {
      setCurrentMode('add')
      setAddQuery('')
    } else if (val.startsWith('/preview ')) {
      setCurrentMode('preview')
      setPreviewQuery(val.substring(9).trim())
    } else if (val === '/preview') {
      setCurrentMode('preview')
      setPreviewQuery('')
    } else {
      setCurrentMode('normal')
      setSearchQuery('')
      setAddQuery('')
      setPreviewQuery('')
      setPreviewData(null)
    }
  }, [input])

  useEffect(() => {
    const previewKey = getArxivPreviewKey(previewQuery)
    if (currentMode !== 'preview' || !previewKey) {
      setPreviewData(null)
      return
    }
    const cached = previewCacheRef.current.get(previewKey)
    if (cached) {
      setPreviewData(cached)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/arxiv/preview', { params: { input: previewQuery } })
        if (!cancelled) {
          const nextPreview = { title: data.title, abstract: data.abstract || '' }
          previewCacheRef.current.set(previewKey, nextPreview)
          setPreviewData(nextPreview)
        }
      } catch {
        if (!cancelled) setPreviewData(null)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewQuery, currentMode])

  const showSlashMenu =
    currentMode === 'normal' &&
    input.length > 0 &&
    input.startsWith('/') &&
    !/\s/.test(input.slice(1))

  const slashFilter = showSlashMenu ? input.slice(1).toLowerCase() : ''

  const filteredSlashCommands = useMemo(() => {
    if (!showSlashMenu) return []
    if (!slashFilter) return SLASH_COMMANDS
    return SLASH_COMMANDS.filter(
      (c) =>
        c.slug.startsWith(slashFilter) ||
        c.label.toLowerCase().includes(slashFilter)
    )
  }, [showSlashMenu, slashFilter])

  useEffect(() => {
    if (!showSlashMenu) return
    setSlashSelectedIndex(0)
  }, [showSlashMenu, slashFilter])

  useEffect(() => {
    if (!showSlashMenu || filteredSlashCommands.length === 0) return
    const el = slashMenuRef.current?.querySelector(`[data-slash-index="${slashSelectedIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
  }, [slashSelectedIndex, showSlashMenu, filteredSlashCommands.length])

  useEffect(() => {
    if (!showHowtoModal) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowHowtoModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showHowtoModal])

  const applySlashCommand = async (cmd) => {
    captureAction('home_slash_command', { route: 'home', command: cmd.id })
    if (cmd.id === 'upload') {
      fileInputRef.current?.click()
      setInput('')
      return
    }
    if (cmd.id === 'help') {
      setPage('help')
      setInput('')
      return
    }
    if (cmd.id === 'collections') {
      setPage('collections')
      setInput('')
      return
    }
    if (cmd.id === 'backup') {
      setInput('')
      setLoading(true)
      try {
        await axios.post('/api/backup')
        addToast?.('Backup saved to ~/.papyrus/backups/', 'success')
      } catch (err) {
        addToast?.(err.response?.data?.error || 'Backup failed', 'error')
      } finally {
        setLoading(false)
      }
      return
    }
    if (cmd.id === 'howto') {
      setShowHowtoModal(true)
      setInput('')
      return
    }
    setInput(cmd.prefix)
  }

  const handleSearchLaunch = (query) => {
    captureAction('home_search_launch', {
      route: 'home',
      queryLength: query.trim().length,
    })
    onSearchQuery(query.trim())
    setInput('')
    setSearchQuery('')
    setCurrentMode('normal')
    setIsFocused(false)
  }

  const handleArxivAdd = async (query) => {
    const startedAt = startTimer()
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post('/api/arxiv/add', { input: query.trim() })
      captureTiming('paper_load', elapsedSince(startedAt), {
        route: 'home',
        source: 'arxiv_add',
        paperId: response.data?.id,
        paperTitle: response.data?.title,
        loadingInBackground: Boolean(response.data?.loadingInBackground),
      })
      captureAction('add_paper', {
        route: 'home',
        source: 'arxiv',
        paperId: response.data?.id,
        paperTitle: response.data?.title,
      })
      window.electron?.showNotification?.('ReadXiv', 'Paper added')

      if (response.data?.loadingInBackground && response.data?.id) {
        const paperId = response.data.id
        let attempts = 0
        const maxAttempts = 120
        const pollInterval = setInterval(async () => {
          attempts++
          if (attempts > maxAttempts) {
            clearInterval(pollInterval)
            pollingRef.current = null
            return
          }
          try {
            const res = await axios.get(`/api/papers/${paperId}`)
            if (res.data?.status === 'queued') {
              window.electron?.showNotification?.('ReadXiv', 'PDF ready')
              clearInterval(pollInterval)
              pollingRef.current = null
            } else if (res.data?.status === 'error') {
              clearInterval(pollInterval)
              pollingRef.current = null
            }
          } catch {}
        }, 2500)
        pollingRef.current = pollInterval
      }

      setInput('')
      openPaper?.(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add paper')
      captureAppError(err, {
        route: 'home',
        source: 'arxiv_add',
        inputKind: isArxivInput(query) ? 'arxiv' : 'unknown',
      })
      console.error('Error adding paper:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExternalPdfImport = async (query) => {
    const startedAt = startTimer()
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post('/api/papers/import-url', { url: query.trim() })
      captureTiming('paper_load', elapsedSince(startedAt), {
        route: 'home',
        source: 'external_pdf_import',
        paperId: response.data?.id,
        paperTitle: response.data?.title,
      })
      captureAction('add_paper', {
        route: 'home',
        source: response.data?.source || 'external',
        paperId: response.data?.id,
        paperTitle: response.data?.title,
      })
      window.electron?.showNotification?.('ReadXiv', response.data?.alreadyExists ? 'Paper already in library' : 'Paper added')
      setInput('')
      if (response.data?.readerSupported === false) {
        addToast?.('OpenReview papers are not supported in Reader yet. Find it in Library and press B to open it in your browser.', 'info')
        return
      }
      openPaper?.(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import PDF')
      captureAppError(err, {
        route: 'home',
        source: 'external_pdf_import',
        inputKind: isHttpsUrl(query) ? 'https_url' : 'unknown',
      })
      console.error('Error importing PDF:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleBulkUrlImport = async (queries) => {
    const entries = queries.map((query) => ({ query, status: 'waiting' }))
    setLoading(true)
    setError(null)
    setBatchImport({ total: entries.length, completed: 0, entries })

    for (let index = 0; index < queries.length; index += 1) {
      const query = queries[index]
      entries[index] = { query, status: 'importing' }
      setBatchImport({ total: entries.length, completed: index, entries: [...entries] })
      try {
        let response
        if (isArxivInput(query)) {
          response = await axios.post('/api/arxiv/add', { input: query })
        } else if (isHttpsUrl(query)) {
          response = await axios.post('/api/papers/import-url', { url: query })
        } else {
          throw new Error('Enter an arXiv ID or URL, or an HTTPS PDF link.')
        }
        const paper = response.data
        entries[index] = {
          query,
          status: paper?.alreadyExists ? 'duplicate' : 'success',
          title: paper?.title || query,
          readerSupported: paper?.readerSupported !== false,
        }
        captureAction('add_paper', {
          route: 'home',
          source: paper?.source || (isArxivInput(query) ? 'arxiv' : 'external'),
          paperId: paper?.id,
          batch: true,
        })
      } catch (err) {
        entries[index] = {
          query,
          status: 'failed',
          error: err.response?.data?.error || err.message || 'Import failed',
        }
        captureAppError(err, { route: 'home', source: 'bulk_import', input: query })
      }
      setBatchImport({ total: entries.length, completed: index + 1, entries: [...entries] })
    }

    const added = entries.filter((entry) => entry.status === 'success').length
    const duplicates = entries.filter((entry) => entry.status === 'duplicate').length
    const failures = entries.filter((entry) => entry.status === 'failed').length
    const summary = [
      `${added} added`,
      duplicates ? `${duplicates} already in library` : null,
      failures ? `${failures} failed` : null,
    ].filter(Boolean).join(', ')
    addToast?.(
      summary,
      failures ? 'info' : 'success'
    )
    setInput('')
    setLoading(false)
  }

  const handleBulkPdfUpload = async (files) => {
    const entries = files.map((file) => ({ query: file.name, status: 'waiting' }))
    setLoading(true)
    setError(null)
    setBatchImport({ total: entries.length, completed: 0, entries })
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      entries[index] = { query: file.name, status: 'importing' }
      setBatchImport({ total: entries.length, completed: index, entries: [...entries] })
      try {
        const formData = new FormData()
        formData.append('pdf', file)
        const response = await axios.post('/api/papers/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        entries[index] = {
          query: file.name,
          status: response.data?.alreadyExists ? 'duplicate' : 'success',
          title: response.data?.title || file.name,
        }
        captureAction('upload_pdf_complete', { route: 'home', paperId: response.data?.id, batch: true })
      } catch (err) {
        entries[index] = {
          query: file.name,
          status: 'failed',
          error: err.response?.data?.error || 'Upload failed',
        }
        captureAppError(err, { route: 'home', source: 'bulk_pdf_upload', fileName: file.name })
      }
      setBatchImport({ total: entries.length, completed: index + 1, entries: [...entries] })
    }

    const uploaded = entries.filter((entry) => entry.status === 'success').length
    const duplicates = entries.filter((entry) => entry.status === 'duplicate').length
    const failures = entries.filter((entry) => entry.status === 'failed').length
    const summary = [
      `${uploaded} uploaded`,
      duplicates ? `${duplicates} already in library` : null,
      failures ? `${failures} failed` : null,
    ].filter(Boolean).join(', ')
    addToast?.(summary, failures ? 'info' : 'success')
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const trimmedSubmit = input.trim()
    const normalizedCmd = trimmedSubmit.toLowerCase()

    if (trimmedSubmit === '/upload' || trimmedSubmit.startsWith('/upload ')) {
      fileInputRef.current?.click()
      setInput('')
      setCurrentMode('normal')
      return
    }

    if (normalizedCmd === '/howto') {
      setShowHowtoModal(true)
      setInput('')
      setCurrentMode('normal')
      return
    }

    if (normalizedCmd === '/bindings' || normalizedCmd === '/help') {
      setPage('help')
      setInput('')
      setCurrentMode('normal')
      return
    }

    if (currentMode === 'search') {
      handleSearchLaunch(searchQuery)
      return
    }

    if (currentMode === 'add') {
      if (!addQuery.trim()) return
      const imports = splitImportInputs(addQuery)
      if (imports.length > 1) {
        await handleBulkUrlImport(imports)
      } else if (isArxivInput(addQuery)) {
        await handleArxivAdd(addQuery)
      } else if (isHttpsUrl(addQuery)) {
        await handleExternalPdfImport(addQuery)
      } else {
        setError('Enter an arXiv ID or URL, or an HTTPS PDF link.')
      }
      setAddQuery('')
      setCurrentMode('normal')
      return
    }

    if (currentMode === 'preview') {
      return
    }

    const imports = splitImportInputs(input)
    if (imports.length > 1 && imports.every((item) => isArxivInput(item) || isHttpsUrl(item))) {
      await handleBulkUrlImport(imports)
      return
    }

    if (isArxivInput(input)) {
      await handleArxivAdd(input)
      return
    }

    if (isHttpsUrl(input)) {
      await handleExternalPdfImport(input)
      return
    }

    handleSearchLaunch(input)
  }

  const handlePdfUpload = async (event) => {
    const files = Array.from(event.target.files || [])
    const file = files[0]
    if (!file) return
    if (files.length > 1) {
      await handleBulkPdfUpload(files)
      return
    }
    const startedAt = startTimer()
    captureAction('upload_pdf_start', {
      route: 'home',
      fileSize: file.size,
    })
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const response = await axios.post('/api/papers/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      captureTiming('paper_load', elapsedSince(startedAt), {
        route: 'home',
        source: 'pdf_upload',
        paperId: response.data?.id,
        paperTitle: response.data?.title,
        fileSize: file.size,
      })
      captureAction('upload_pdf_complete', {
        route: 'home',
        paperId: response.data?.id,
        alreadyExists: Boolean(response.data?.alreadyExists),
      })
      if (response.data?.alreadyExists) {
        addToast?.('Paper already found, moving to the reader', 'success')
      } else {
        addToast?.('PDF uploaded, moving to the reader', 'success')
      }
      openPaper?.(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload PDF')
      captureAppError(err, {
        route: 'home',
        source: 'pdf_upload',
        fileSize: file.size,
      })
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const inputValue =
    currentMode === 'search' ? searchQuery :
    currentMode === 'add' ? addQuery :
    currentMode === 'preview' ? previewQuery :
    input

  const modeTag =
    currentMode === 'search' ? '/library' :
    currentMode === 'add' ? '/add' :
    currentMode === 'preview' ? '/preview' :
    null

  const inputPlaceholder =
    currentMode === 'search' ? 'Search your library...' :
    currentMode === 'add' ? 'arXiv URL, ID, or PDF link...' :
    currentMode === 'preview' ? 'arXiv URL or ID...' :
    'Type / for commands...'

  const inputOnChange = (e) => {
    const v = e.target.value
    if (currentMode === 'search') setSearchQuery(v)
    else if (currentMode === 'add') setAddQuery(v)
    else if (currentMode === 'preview') setPreviewQuery(v)
    else setInput(v)
  }

  return (
    <div className="home-container" style={{
      height: '100dvh',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      padding: '2rem',
      background: 'var(--background)'
    }}>
      <div className="home-gradient-layer" />
      <div className="home-grain" />
      {deskView === 'stats' ? (
        <div style={{ flex: 1 }} aria-hidden="true" />
      ) : (
        <div
          className={`greeting home-greeting-animated ${isFocused ? 'fade' : ''}`}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: isFocused ? 0 : 1,
            transform: isFocused ? 'scale(0.95)' : 'scale(1)',
            pointerEvents: isFocused ? 'none' : 'auto',
            position: 'relative',
            zIndex: 2
          }}
        >
          <h1 style={{
            fontSize: '4.5rem',
            fontWeight: 400,
            fontFamily: 'var(--font-sans)',
            textAlign: 'center',
            width: 'min(24ch, 100%)',
            lineHeight: 1.05,
            margin: 0,
            color: 'var(--foreground)'
          }}>
            {greeting}
          </h1>
        </div>
      )}

      <EditorialLanding
        summary={homeSummary}
        fallbackContinue={continuePaper}
        recentPapers={memoryPapers}
        openPaper={openPaper}
        dimmed={isFocused}
        view={deskView}
        onViewChange={setDeskView}
        selectedPaperId={memoryItems[memorySelectedIndex]?.id}
        onPaperHover={(paperId) => {
          const index = memoryItems.findIndex((paper) => paper.id === paperId)
          if (index >= 0) setMemorySelectedIndex(index)
        }}
      />

      {isFocused && <div className="home-command-backdrop" aria-hidden="true" />}

      <div style={{ flex: 0.12 }} aria-hidden="true" />

      <div
        className={`command-area home-bar-animated ${isFocused ? 'focused' : ''}`}
        style={{
          position: 'relative',
          zIndex: 4,
          width: 'min(760px, 100%)',
          alignSelf: 'center',
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isFocused ? 'translateY(-6px)' : 'translateY(0)',
          height: '66px',
          marginBottom: isFocused ? '0.75rem' : '2rem'
        }}
      >
        {liveQuery && (
          <div className="home-editorial-search-results" role="listbox" aria-label="Library results">
            <span className="home-memory-label">Library results</span>
            {liveResults.length > 0 ? liveResults.map((paper, index) => (
              <button
                key={paper.id}
                type="button"
                role="option"
                aria-selected={liveSelectedIndex === index}
                className={liveSelectedIndex === index ? 'is-selected' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setLiveSelectedIndex(index)}
                onClick={() => openPaper?.(paper)}
              >
                <span>{paper.title || paper.id}</span>
                <small>{[paper.year, paper.authors].filter(Boolean).join(' · ') || paper.id}</small>
              </button>
            )) : <span className="home-editorial-no-results">No matching papers</span>}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ position: 'relative', height: '100%' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            height: '100%',
            background: 'color-mix(in srgb, var(--surface) 82%, transparent)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '0 1.5rem',
            backdropFilter: 'blur(20px)',
            transform: isFocused ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: isFocused
              ? '0 0 0 1px color-mix(in srgb, var(--secondary) 72%, transparent), 0 22px 54px rgba(0, 0, 0, 0.24)'
              : '0 14px 36px rgba(0, 0, 0, 0.14)',
            transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s cubic-bezier(0.16, 1, 0.3, 1), background 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {modeTag && (
              <span style={{
                backgroundColor: 'var(--secondary)',
                color: 'var(--button-on-secondary)',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                letterSpacing: '0.02em'
              }}>
                {modeTag}
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={inputOnChange}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                if (input === '' && currentMode === 'normal') {
                  setIsFocused(false)
                }
              }}
              onKeyDown={(e) => {
                if (liveQuery && liveResults.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setLiveSelectedIndex((index) => Math.min(index + 1, liveResults.length - 1))
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setLiveSelectedIndex((index) => Math.max(index - 1, 0))
                    return
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    openPaper?.(liveResults[liveSelectedIndex])
                    return
                  }
                }
                if (currentMode === 'normal' && showSlashMenu && filteredSlashCommands.length > 0) {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSlashSelectedIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1))
                    return
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSlashSelectedIndex((i) => Math.max(i - 1, 0))
                    return
                  }
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const cmd = filteredSlashCommands[slashSelectedIndex]
                    if (cmd) applySlashCommand(cmd)
                    return
                  }
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setInput('')
                  setSearchQuery('')
                  setAddQuery('')
                  setPreviewQuery('')
                  setCurrentMode('normal')
                  setPreviewData(null)
                  inputRef.current?.blur()
                } else if (e.key === 'Backspace' && (inputValue === '' || (currentMode === 'normal' && input === '/'))) {
                  e.preventDefault()
                  setInput('')
                  setSearchQuery('')
                  setAddQuery('')
                  setPreviewQuery('')
                  setCurrentMode('normal')
                  setPreviewData(null)
                }
              }}
              placeholder={inputPlaceholder}
              disabled={loading}
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '1.06rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--foreground)',
                padding: 0
              }}
            />
          </div>
        </form>

        {showSlashMenu && (
          <div
            ref={slashMenuRef}
            className="commands-panel slash-command-menu"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: '0.5rem',
              width: '100%',
              maxWidth: '320px',
              background: 'color-mix(in srgb, var(--surface) 72%, transparent)',
              border: '1px solid color-mix(in srgb, var(--secondary) 18%, var(--border))',
              borderRadius: '10px',
              padding: '0.35rem',
              boxShadow: '0 18px 52px -16px rgba(0,0,0,0.58)',
              backdropFilter: 'blur(20px)',
              zIndex: 30,
              maxHeight: 'min(320px, 50vh)',
              overflowY: 'auto',
            }}
            role="listbox"
            aria-label="Commands"
          >
            {filteredSlashCommands.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-muted">No matching commands</div>
            ) : (
              filteredSlashCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  type="button"
                  data-slash-index={i}
                  role="option"
                  aria-selected={i === slashSelectedIndex}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySlashCommand(cmd)}
                  onMouseEnter={() => setSlashSelectedIndex(i)}
                  className="w-full text-left rounded-md px-2.5 py-2 transition-colors animate-stagger-fade"
                  style={{
                    animationDelay: `${Math.min(i, 7) * 30}ms`,
                    ...(i === slashSelectedIndex
                      ? { background: 'var(--secondary)', color: 'var(--button-on-secondary)' }
                      : {}),
                  }}
                >
                  <div className="text-sm font-medium leading-tight">{cmd.label}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {currentMode === 'preview' && previewData && isFocused && (
        <div
          className="preview-modal"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '75%',
            maxWidth: '720px',
            maxHeight: '75vh',
            background: 'color-mix(in srgb, var(--surface) 78%, transparent)',
            border: '1px solid color-mix(in srgb, var(--secondary) 16%, var(--border))',
            borderRadius: '16px',
            padding: '2.75rem 3rem',
            overflowY: 'auto',
            backdropFilter: 'blur(22px)',
            boxShadow: '0 30px 70px -18px rgba(0, 0, 0, 0.56)',
            animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 20
          }}
        >
          <div style={{
            fontSize: '1.875rem',
            fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            color: 'var(--foreground)',
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
            marginBottom: '1.5rem',
            paddingBottom: '1.25rem',
            borderBottom: '2px solid var(--border)'
          }}>
            <LatexText text={previewData.title} />
          </div>
          <div
            className="preview-abstract"
            style={{
              fontSize: '1rem',
              lineHeight: 1.8,
              color: 'var(--foreground)',
              fontFamily: 'var(--font-sans)',
              opacity: 0.92
            }}
          >
            <LatexText
              text={previewData.abstract || 'No abstract available.'}
              style={{ fontFamily: 'inherit', fontSize: 'inherit', lineHeight: 'inherit' }}
            />
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={handlePdfUpload}
        style={{ display: 'none' }}
      />

      {batchImport && (
        <section
          aria-live="polite"
          style={{
            position: 'fixed',
            right: '1.25rem',
            bottom: '1.25rem',
            zIndex: 1000,
            width: 'min(31rem, calc(100vw - 2.5rem))',
            maxHeight: 'min(28rem, calc(100vh - 2.5rem))',
            overflow: 'auto',
            padding: '1rem',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            background: 'var(--surface)',
            boxShadow: '0 18px 54px rgba(0, 0, 0, .4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '.7rem' }}>
            <strong style={{ fontSize: '.85rem' }}>Importing papers</strong>
            <button type="button" onClick={() => setBatchImport(null)} style={{ color: 'var(--muted)', fontSize: '.75rem' }}>Dismiss</button>
          </div>
          <div style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: '.72rem', marginBottom: '.7rem' }}>
            {batchImport.completed} / {batchImport.total} processed
          </div>
          <div style={{ display: 'grid', gap: '.38rem' }}>
            {batchImport.entries.map((entry, index) => {
              const label = entry.title || entry.query
              const detail = entry.status === 'success' ? 'Added'
                : entry.status === 'duplicate' ? 'Already in library'
                  : entry.status === 'failed' ? entry.error
                    : entry.status === 'importing' ? 'Importing…' : 'Waiting'
              const color = entry.status === 'failed' ? '#f87171'
                : entry.status === 'success' || entry.status === 'duplicate' ? '#4ade80' : 'var(--muted)'
              return (
                <div key={`${entry.query}-${index}`} style={{ padding: '.55rem .65rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.78rem' }}>{label}</div>
                  <div style={{ color, fontFamily: 'var(--font-mono)', fontSize: '.67rem', marginTop: '.18rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {error && (
        <div style={{
          position: 'fixed',
          top: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          padding: '0.75rem 1.5rem',
          color: '#ef4444',
          fontSize: '0.875rem',
          zIndex: 1000
        }}>
          {error}
        </div>
      )}

      {showHowtoModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(10px)',
            padding: '1rem'
          }}
          onClick={() => setShowHowtoModal(false)}
        >
          <div
            style={{
              background: 'color-mix(in srgb, var(--surface) 80%, transparent)',
              border: '1px solid color-mix(in srgb, var(--secondary) 16%, var(--border))',
              borderRadius: '12px',
              width: 'min(680px, 100%)',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '2rem',
              backdropFilter: 'blur(22px)',
              boxShadow: '0 28px 70px -20px rgba(0, 0, 0, 0.58)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Supported inputs</h2>
            <div style={{ display: 'grid', gap: '0.75rem', fontSize: '0.95rem', lineHeight: 1.7 }}>
              <div><code>/library [query]</code> - open the Library</div>
              <div><code>/search [query]</code> - alias for Library</div>
              <div><code>/add [IDs or links]</code> - paste one or more arXiv IDs, URLs, or PDF links</div>
              <div><code>/upload</code> - upload a local PDF</div>
              <div><code>/help</code> - open keyboard shortcuts</div>
              <div><code>plain text</code> - search your library</div>
              <div><code>arXiv URL, ID, or HTTPS PDF link</code> - add directly from the command bar</div>
            </div>
            <button
              type="button"
              onClick={() => setShowHowtoModal(false)}
              className="mt-6 px-4 py-2 rounded-lg bg-secondary text-[var(--button-on-secondary)]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
