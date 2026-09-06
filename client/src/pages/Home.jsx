import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import LatexText from '../components/LatexText'
import EditorialLanding from '../components/EditorialLanding'
import { Button } from '../components/ui/button'
import { Modal, ModalContent, ModalFooter, ModalHeader } from '../components/ui/modal'
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
  collectionContext,
  onClearCollectionContext,
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
      if (collectionContext?.id && response.data?.id) await axios.put(`/api/collections/${collectionContext.id}/papers/${encodeURIComponent(response.data.id)}`)
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
      if (collectionContext?.id) addToast?.(`Added to ${collectionContext.name}`, 'success')
      else openPaper?.(response.data)
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
      if (collectionContext?.id && response.data?.id) await axios.put(`/api/collections/${collectionContext.id}/papers/${encodeURIComponent(response.data.id)}`)
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
      if (collectionContext?.id) addToast?.(`Added to ${collectionContext.name}`, 'success')
      else openPaper?.(response.data)
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
        if (collectionContext?.id && paper?.id) await axios.put(`/api/collections/${collectionContext.id}/papers/${encodeURIComponent(paper.id)}`)
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
    <div className="home-container relative flex h-[100dvh] flex-col overflow-hidden bg-background p-8 [box-sizing:border-box]">
      <div className="home-gradient-layer" />
      <div className="home-grain" />
      {deskView === 'stats' ? (
        <div className="flex-1" aria-hidden="true" />
      ) : (
        <div
          className={`greeting home-greeting-animated relative z-[2] flex flex-1 items-center justify-center transition-[opacity,transform] duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isFocused ? 'fade' : ''}`}
          style={{
            opacity: isFocused ? 0 : 1,
            transform: isFocused ? 'scale(0.95)' : 'scale(1)',
            pointerEvents: isFocused ? 'none' : 'auto',
          }}
        >
          <h1 className="home-greeting-title m-0 w-[min(24ch,100%)] text-center font-ui font-normal text-text">
            {greeting}
          </h1>
        </div>
      )}

      <EditorialLanding
        summary={homeSummary}
        fallbackContinue={continuePaper}
        recentPapers={importantPapers}
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

      <div className="flex-[0.12]" aria-hidden="true" />

      <div
        className={`command-area home-bar-animated relative z-[4] h-14 w-[min(720px,100%)] self-center transition-[transform,margin-bottom] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isFocused ? 'focused' : ''}`}
        style={{
          transform: isFocused ? 'translateY(-6px)' : 'translateY(0)',
          marginBottom: isFocused ? '0.75rem' : '2rem'
        }}
      >
        {collectionContext && (
          <div className="mb-3 flex items-center justify-between rounded-md border bg-[color-mix(in_srgb,var(--surface-1)_90%,transparent)] px-3 py-2 text-small" style={{ borderColor: collectionContext.color || 'var(--secondary)' }}>
            <span>Adding papers to <strong>{collectionContext.name}</strong></span>
            <Button variant="ghost" size="link" onClick={onClearCollectionContext}>Clear</Button>
          </div>
        )}
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
        <form onSubmit={handleSubmit} className="relative h-full">
          <div className="flex h-full items-center gap-3 rounded-lg border border-divider bg-[color-mix(in_srgb,var(--surface-1)_80%,transparent)] px-5 backdrop-blur-xl" style={{
            transform: isFocused ? 'translateY(-1px)' : 'translateY(0)',
            boxShadow: isFocused
              ? '0 0 0 1px color-mix(in srgb, var(--secondary) 72%, transparent), 0 22px 54px rgba(0, 0, 0, 0.24)'
              : '0 14px 36px rgba(0, 0, 0, 0.14)',
            transition: 'transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.45s cubic-bezier(0.16, 1, 0.3, 1), background 0.45s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {modeTag && (
              <span className="rounded bg-accent px-2 py-1 font-code text-very-small font-semibold tracking-[0.02em] text-on-accent">
                {modeTag}
              </span>
            )}
            <input
              ref={inputRef}
              className="readxiv-focus-delegated min-w-0 flex-1 border-0 bg-transparent p-0 font-code text-medium text-text"
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
            />
          </div>
        </form>

        {showSlashMenu && (
          <div
            ref={slashMenuRef}
            className="commands-panel slash-command-menu absolute bottom-full left-0 z-30 mb-2 max-h-[min(280px,45vh)] w-full max-w-[280px] overflow-y-auto rounded-lg border border-divider bg-[color-mix(in_srgb,var(--surface-1)_96%,transparent)] p-1 shadow-elevation-2 backdrop-blur-xl"
            role="listbox"
            aria-label="Commands"
          >
            {filteredSlashCommands.length === 0 ? (
              <div className="px-3 py-2.5 text-small text-muted">No matching commands</div>
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
                  className="w-full rounded px-2.5 py-1.5 text-left transition-colors animate-stagger-fade"
                  style={{
                    animationDelay: `${Math.min(i, 7) * 30}ms`,
                    ...(i === slashSelectedIndex
                      ? { background: 'var(--surface-2)', color: 'var(--foreground)', boxShadow: 'inset 2px 0 0 var(--accent)' }
                      : {}),
                  }}
                >
                  <div className="text-small font-medium leading-tight">{cmd.label}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {currentMode === 'preview' && previewData && isFocused && (
        <div
          className="preview-modal fixed left-1/2 top-1/2 z-20 max-h-[75vh] w-3/4 max-w-[720px] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-divider bg-[color-mix(in_srgb,var(--surface-1)_78%,transparent)] px-12 py-11 shadow-elevation-3 backdrop-blur-xl"
          style={{
            animation: 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div className="mb-6 border-b-2 border-divider pb-5 font-ui text-extra-large font-semibold tracking-[-0.02em] text-text">
            <LatexText text={previewData.title} />
          </div>
          <div className="preview-abstract font-ui text-medium leading-[1.8] text-text opacity-90">
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
      />

      {batchImport && (
        <section aria-live="polite" className="fixed bottom-5 right-5 z-[1000] max-h-[min(28rem,calc(100vh-2.5rem))] w-[min(31rem,calc(100vw-2.5rem))] overflow-auto rounded-[10px] border border-divider bg-surface-1 p-4 shadow-elevation-3">
          <div className="mb-3 flex items-center justify-between gap-4">
            <strong className="text-small">Importing papers</strong>
            <Button variant="ghost" size="link" onClick={() => setBatchImport(null)}>Dismiss</Button>
          </div>
          <div className="mb-3 font-code text-very-small text-text-muted">
            {batchImport.completed} / {batchImport.total} processed
          </div>
          <div className="grid gap-1.5">
            {batchImport.entries.map((entry, index) => {
              const label = entry.title || entry.query
              const detail = entry.status === 'success' ? 'Added'
                : entry.status === 'duplicate' ? 'Already in library'
                  : entry.status === 'failed' ? entry.error
                    : entry.status === 'importing' ? 'Importing…' : 'Waiting'
              const color = entry.status === 'failed' ? '#f87171'
                : entry.status === 'success' || entry.status === 'duplicate' ? '#4ade80' : 'var(--muted)'
              return (
                <div key={`${entry.query}-${index}`} className="rounded-md border border-divider px-2.5 py-2">
                  <div className="truncate text-small">{label}</div>
                  <div className="mt-0.5 truncate font-code text-very-small" style={{ color }}>{detail}</div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {error && (
        <div className="fixed left-1/2 top-8 z-[1000] -translate-x-1/2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_20%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-6 py-3 text-small text-danger">
          {error}
        </div>
      )}

      <Modal open={showHowtoModal} onClose={() => setShowHowtoModal(false)} className="max-h-[80vh] max-w-[680px] overflow-y-auto backdrop-blur-xl" aria-labelledby="supported-inputs-title">
          <ModalHeader>
            <h2 id="supported-inputs-title" className="m-0 text-very-large font-semibold">Supported inputs</h2>
          </ModalHeader>
          <ModalContent className="grid gap-3 text-medium leading-relaxed">
              <div><code>/library [query]</code> - open the Library</div>
              <div><code>/search [query]</code> - alias for Library</div>
              <div><code>/add [IDs or links]</code> - paste one or more arXiv IDs, URLs, or PDF links</div>
              <div><code>/upload</code> - upload a local PDF</div>
              <div><code>/help</code> - open keyboard shortcuts</div>
              <div><code>plain text</code> - search your library</div>
              <div><code>arXiv URL, ID, or HTTPS PDF link</code> - add directly from the command bar</div>
          </ModalContent>
          <ModalFooter>
            <Button onClick={() => setShowHowtoModal(false)}>Close</Button>
          </ModalFooter>
      </Modal>
    </div>
  )
}
