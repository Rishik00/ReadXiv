import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import LatexText from '../components/LatexText'

function isArxivInput(val) {
  if (!val?.trim()) return false
  return val.includes('arxiv.org') || /^\d{4}\.\d+/.test(val.trim())
}

function formatTodoistPriority(p) {
  if (typeof p !== 'number') return '—'
  const map = { 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }
  return map[p] ?? `(${p})`
}

function formatTodoistDue(due) {
  if (!due) return null
  if (typeof due === 'string') return due
  if (due.string) return due.string
  if (due.date) return due.date
  return null
}

/** One-line summary for /search list rows */
function searchPaperTodoistSubtitle(paper, map, todoistLoading) {
  if (!paper.todoist_task_id) return 'NOT IN TODOIST'
  if (todoistLoading && map[paper.id] == null) return 'Todoist…'
  const row = map[paper.id]
  if (!row || row.stale || !row.todoist) {
    if (row?.stale) return 'Todoist (stale link)'
    return 'Todoist…'
  }
  const t = row.todoist
  const status = t.checked ? 'Done' : 'Open'
  const due = formatTodoistDue(t.due)
  const pr = formatTodoistPriority(t.priority)
  const parts = [status, pr]
  if (due) parts.push(due)
  return parts.join(' · ')
}

const todoistDetailLabel = {
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted)',
  marginBottom: '0.2rem',
}

export default function Home({ setPage, setSelectedPaper, focusNonce, openSearchNonce, onSearchQuery, addToast, settings }) {
  const goToHelp = () => setPage('help')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const pollingRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)
  
  // Command mode state machine
  const [currentMode, setCurrentMode] = useState('normal') // 'normal' | 'search' | 'add' | 'preview'
  const [searchResults, setSearchResults] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [previewQuery, setPreviewQuery] = useState('')
  const [previewData, setPreviewData] = useState(null) // { title, abstract } for /preview
  const [searchTodoistMap, setSearchTodoistMap] = useState({})
  const [searchTodoistLoading, setSearchTodoistLoading] = useState(false)

  const homeLayout = settings?.homeLayout || 'list'
  const listRef = useRef(null)
  const slashMenuRef = useRef(null)
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
  }, [])

  useEffect(() => {
    if (!focusNonce) return
    inputRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    if (!openSearchNonce) return
    setInput('/search ')
    setCurrentMode('search')
    setSearchQuery('')
    inputRef.current?.focus()
  }, [openSearchNonce])

  // Parse command mode from input (/search, /add, /preview)
  useEffect(() => {
    const val = input.trim()
    if (val.startsWith('/search ')) {
      setCurrentMode('search')
      setSearchQuery(val.substring(8).trim())
    } else if (val.startsWith('/add ')) {
      setCurrentMode('add')
      setAddQuery(val.substring(5).trim())
    } else if (val.startsWith('/preview ')) {
      setCurrentMode('preview')
      setPreviewQuery(val.substring(9).trim())
    } else if (val === '/search' || val === '/add' || val === '/preview') {
      if (val === '/search') {
        setCurrentMode('search')
        setSearchQuery('')
      } else if (val === '/add') {
        setCurrentMode('add')
        setAddQuery('')
      } else {
        setCurrentMode('preview')
        setPreviewQuery('')
      }
    } else {
      if (currentMode !== 'normal') {
        setCurrentMode('normal')
        setSearchResults([])
        setSearchQuery('')
        setAddQuery('')
        setPreviewQuery('')
        setPreviewData(null)
        setSearchTodoistMap({})
        setSearchTodoistLoading(false)
      }
    }
  }, [input])

  // Fetch search results
  useEffect(() => {
    if (currentMode !== 'search') {
      setSearchResults([])
      return
    }
    
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        if (searchQuery) {
          const { data } = await axios.get('/api/search', { params: { q: searchQuery } })
          if (!cancelled) {
            setSearchResults(data || [])
            setSelectedIndex(0)
          }
        } else {
          const { data } = await axios.get('/api/papers')
          if (!cancelled) {
            setSearchResults(data || [])
            setSelectedIndex(0)
          }
        }
      } catch (err) {
        console.error('Search error:', err)
        if (!cancelled) setSearchResults([])
      }
    }, 200)
    
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [currentMode, searchQuery])

  // /search: fetch Todoist task snippets for papers that have a linked task
  useEffect(() => {
    if (currentMode !== 'search') {
      setSearchTodoistMap({})
      setSearchTodoistLoading(false)
      return
    }
    const ids = [...new Set(searchResults.filter((p) => p.todoist_task_id).map((p) => p.id))]
    if (ids.length === 0) {
      setSearchTodoistMap({})
      setSearchTodoistLoading(false)
      return
    }
    let cancelled = false
    setSearchTodoistLoading(true)
    axios
      .post('/api/todoist/resolve-papers', { paperIds: ids })
      .then(({ data }) => {
        if (!cancelled) setSearchTodoistMap(data && typeof data === 'object' ? data : {})
      })
      .catch(() => {
        if (!cancelled)
          setSearchTodoistMap(Object.fromEntries(ids.map((id) => [id, { stale: true, todoist: null }])))
      })
      .finally(() => {
        if (!cancelled) setSearchTodoistLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [currentMode, searchResults])

  // ArXiv preview for !add mode (title animation when prefetch loads)
  useEffect(() => {
    if (currentMode !== 'add') {
      setPreview(null)
      return
    }
    if (!isArxivInput(addQuery)) {
      setPreview(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/arxiv/preview', { params: { input: addQuery } })
        if (!cancelled) setPreview({ title: data.title, authors: data.authors })
      } catch {
        if (!cancelled) setPreview(null)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [addQuery, currentMode])

  // !preview mode: fetch and show title + abstract
  useEffect(() => {
    if (currentMode !== 'preview') {
      setPreviewData(null)
      return
    }
    if (!isArxivInput(previewQuery)) {
      setPreviewData(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/arxiv/preview', { params: { input: previewQuery } })
        if (!cancelled) setPreviewData({ title: data.title, abstract: data.abstract || '' })
      } catch {
        if (!cancelled) setPreviewData(null)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [previewQuery, currentMode])

  const GREETINGS = [
    <>What <em>papers</em> are we conquering today?</>,
    <>Ready to fall down a <em>citation rabbit hole</em>?</>,
    <>Your brain is a <em>sponge</em>. Feed it papers.</>,
    <>What <em>knowledge</em> shall we acquire today?</>,
    <>Paste, search, or upload—<em>let's go</em>.</>,
    <>Another day, another paper to add to the <em>pile</em>.</>,
    <>Scientific curiosity: <em>activate</em>.</>,
    <>What's on the <em>arXiv menu</em> today?</>,
    <>Papers: long tweets with <em>footnotes</em>.</>,
    <>Your future self will thank you for <em>reading this</em>.</>,
  ]

  const [greeting, setGreeting] = useState(() => {
    const d = new Date()
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5)
    const seed = dayOfYear * 24 + d.getHours()
    return GREETINGS[seed % GREETINGS.length]
  })

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

    // Handle search mode - open selected paper
    if (currentMode === 'search' && searchResults.length > 0) {
      const paper = searchResults[selectedIndex]
      if (paper) {
        setSelectedPaper(paper)
        setPage('reader')
        setInput('')
        setCurrentMode('normal')
      }
      return
    }
    if (currentMode === 'search') return // no results, do nothing

    // Handle add mode - add arxiv paper
    if (currentMode === 'add') {
      if (!addQuery.trim()) return
      
      setLoading(true)
      setError(null)
      
      try {
        const response = await axios.post('/api/arxiv/add', {
          input: addQuery.trim()
        })

        setSelectedPaper(response.data)
        addToast?.('Paper added', 'success')
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
            } catch { /* ignore */ }
          }, 2500)
          pollingRef.current = pollInterval
        }
        
        setInput('')
        setAddQuery('')
        setCurrentMode('normal')
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to add paper')
        console.error('Error adding paper:', err)
      } finally {
        setLoading(false)
      }
      return
    }

    // Normal mode: arXiv / URL add, else shelf search
    // If it's an arxiv URL or ID, fetch and add paper
    if (isArxivInput(input)) {
      setLoading(true)
      setError(null)
      
      try {
        const response = await axios.post('/api/arxiv/add', {
          input: input.trim()
        })

        setSelectedPaper(response.data)
        addToast?.('Paper added', 'success')
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
            } catch { /* ignore */ }
          }, 2500)
          pollingRef.current = pollInterval
        }
        setInput('')
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to add paper')
        console.error('Error adding paper:', err)
      } finally {
        setLoading(false)
      }
    } else {
      // Search query - redirect to shelf
      onSearchQuery(input.trim())
    }
  }

  const handlePdfUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('pdf', file)
      const response = await axios.post('/api/papers/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setSelectedPaper(response.data)
      if (response.data?.alreadyExists) {
        addToast?.('Paper already found, moving to the reader', 'success')
      } else {
        addToast?.('PDF uploaded, moving to the reader', 'success')
      }
      setPage('reader')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload PDF')
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const [showHowtoModal, setShowHowtoModal] = useState(false)

  const openHowto = () => {
    setShowHowtoModal(true)
    setInput('')
  }

  useEffect(() => {
    if (!showHowtoModal) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowHowtoModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showHowtoModal])

  // Scroll selected item into view
  useEffect(() => {
    if (currentMode !== 'search' || searchResults.length === 0) return
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [selectedIndex, currentMode, searchResults.length])

  // Keyboard navigation for results
  useEffect(() => {
    if (currentMode !== 'search' || searchResults.length === 0) return
    const len = searchResults.length
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, len - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setInput('')
        setCurrentMode('normal')
        setSearchResults([])
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentMode, searchResults.length])

  const handleFocus = () => {
    setIsFocused(true)
  }

  const handleBlur = () => {
    if (input === '' && currentMode === 'normal') {
      setIsFocused(false)
    }
  }

  const getModeTag = () => {
    if (currentMode === 'search') return '/search'
    if (currentMode === 'add') return '/add'
    if (currentMode === 'preview') return '/preview'
    return null
  }

  const modeTag = getModeTag()

  // In command modes, input shows only the query; box shows the command
  const inputValue =
    currentMode === 'search' ? searchQuery :
    currentMode === 'add' ? addQuery :
    currentMode === 'preview' ? previewQuery : input
  const inputOnChange = (e) => {
    const v = e.target.value
    if (currentMode === 'search') setSearchQuery(v)
    else if (currentMode === 'add') setAddQuery(v)
    else if (currentMode === 'preview') setPreviewQuery(v)
    else setInput(v)
  }
  const inputPlaceholder =
    currentMode === 'search' ? 'Your library...' :
    currentMode === 'add' ? 'arXiv URL or ID...' :
    currentMode === 'preview' ? 'arXiv URL or ID...' :
    'Type / for commands…'

  const SLASH_COMMANDS = [
    { id: 'search', slug: 'search', label: 'Search library', desc: 'Fuzzy search your papers; Todoist status when linked', prefix: '/search ' },
    { id: 'add', slug: 'add', label: 'Add from arXiv', desc: 'Fetch paper by URL or ID', prefix: '/add ' },
    { id: 'preview', slug: 'preview', label: 'Preview paper', desc: 'Title & abstract without adding', prefix: '/preview ' },
    { id: 'upload', slug: 'upload', label: 'Upload PDF', desc: 'Add a local PDF file', prefix: null },
    { id: 'help', slug: 'help', label: 'Help', desc: 'Keyboard shortcuts & bindings', prefix: null },
    { id: 'howto', slug: 'howto', label: 'Supported inputs', desc: 'Full command reference', prefix: null },
  ]

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
        c.label.toLowerCase().includes(slashFilter) ||
        c.desc.toLowerCase().includes(slashFilter)
    )
  }, [showSlashMenu, slashFilter])

  useEffect(() => {
    if (!showSlashMenu) return
    setSlashSelectedIndex(0)
  }, [showSlashMenu, slashFilter])

  useEffect(() => {
    if (!showSlashMenu || filteredSlashCommands.length === 0) return
    const el = slashMenuRef.current?.querySelector(`[data-slash-index="${slashSelectedIndex}"]`)
    el?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [slashSelectedIndex, showSlashMenu, filteredSlashCommands.length])

  const applySlashCommand = (cmd) => {
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
    if (cmd.id === 'howto') {
      setShowHowtoModal(true)
      setInput('')
      return
    }
    setInput(cmd.prefix)
  }

  return (
    <div className="home-container" style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      padding: '2rem'
    }}>
      {/* Greeting */}
      <div 
        className={`greeting ${isFocused ? 'fade' : ''}`}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          opacity: isFocused ? 0.1 : 1,
          transform: isFocused ? 'scale(0.95)' : 'scale(1)',
          pointerEvents: isFocused ? 'none' : 'auto'
        }}
      >
        <h1 style={{
          fontSize: '4.5rem',
          fontWeight: 400,
          fontFamily: 'var(--font-sans)',
          fontStyle: 'normal',
          textAlign: 'center',
          margin: 0,
          color: 'var(--foreground)'
        }}>
          {greeting}
        </h1>
      </div>

      {/* Command Area */}
      <div 
        className={`command-area ${isFocused ? 'focused' : ''}`}
        style={{
          position: 'relative',
          transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          height: isFocused ? '80px' : '64px',
          marginBottom: isFocused ? '0' : '2rem'
        }}
      >
        <form onSubmit={handleSubmit} style={{ position: 'relative', height: '100%' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            height: '100%',
            backgroundColor: 'var(--surface)',
            border: `${isFocused ? '2px' : '1px'} solid ${isFocused ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: '8px',
            padding: '0 1.5rem',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
          }}>
            {modeTag && (
              <span style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--bg)',
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
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={(e) => {
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
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setInput('')
                    return
                  }
                }
                if (e.key === 'Escape') {
                  inputRef.current?.blur()
                  setInput('')
                  setSearchQuery('')
                  setAddQuery('')
                  setPreviewQuery('')
                  setCurrentMode('normal')
                  setPreviewData(null)
                  e.preventDefault()
                } else if (e.key === 'Backspace' && (inputValue === '' || (currentMode === 'normal' && input === '/'))) {
                  e.preventDefault()
                  setInput('')
                  setSearchQuery('')
                  setAddQuery('')
                  setPreviewQuery('')
                  setCurrentMode('normal')
                  setSearchResults([])
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
                fontSize: '1.125rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text)',
                padding: 0
              }}
            />
          </div>
        </form>
        {/* Slash command menu (Notion-style) */}
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
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '10px',
              padding: '0.35rem',
              boxShadow: '0 12px 48px -8px rgba(0,0,0,0.55)',
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
                  className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${
                    i === slashSelectedIndex ? 'bg-secondary/15 text-foreground' : 'hover:bg-foreground/5 text-foreground'
                  }`}
                >
                  <div className="text-sm font-medium leading-tight">{cmd.label}</div>
                  <div className="text-xs text-muted mt-0.5 leading-snug">{cmd.desc}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add mode: prefetch title animation */}
      {currentMode === 'add' && preview?.title && (
        <div
          className="animate-preview-fade-in"
          style={{
            position: 'absolute',
            bottom: '100px',
            left: '2rem',
            right: '2rem',
            padding: '0.75rem 1.25rem',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--foreground)',
            lineHeight: 1.4,
            zIndex: 15,
            maxWidth: '75%',
            margin: '0 auto'
          }}
        >
          {preview.title}
        </div>
      )}

      {/* !preview mode: 75% box with Title, divider, Abstract */}
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
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '2.75rem 3rem',
            overflowY: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
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

      {/* Results Panel - List Layout (title + abstract only) */}
      {currentMode === 'search' && searchResults.length > 0 && homeLayout === 'list' && isFocused && (
        <div
          ref={listRef}
          className="results-panel"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '75%',
            maxWidth: '900px',
            maxHeight: '75vh',
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            overflowY: 'auto',
            overflowX: 'hidden',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent',
            zIndex: 20
          }}
        >
          {searchResults.map((paper, idx) => (
            <div
              key={paper.id}
              data-index={idx}
              onClick={() => {
                setSelectedPaper(paper)
                setPage('reader')
                setInput('')
                setCurrentMode('normal')
              }}
              style={{
                padding: '1rem 1.5rem',
                borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                backgroundColor: idx === selectedIndex ? 'var(--secondary)' : 'transparent',
                color: idx === selectedIndex ? 'var(--background)' : 'var(--text)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
            >
              <div style={{
                fontSize: '1.125rem',
                fontWeight: 500,
                marginBottom: '0.35rem',
                fontFamily: 'var(--font-sans)'
              }}>
                {paper.title}
              </div>
              <div style={{
                fontSize: '0.8125rem',
                marginBottom: paper.abstract ? '0.35rem' : 0,
                fontFamily: 'var(--font-mono)',
                opacity: idx === selectedIndex ? 0.95 : 0.8,
                lineHeight: 1.4,
              }}>
                {searchPaperTodoistSubtitle(paper, searchTodoistMap, searchTodoistLoading)}
              </div>
              {paper.abstract && (
                <div style={{
                  fontSize: '0.875rem',
                  opacity: idx === selectedIndex ? 0.95 : 0.75,
                  lineHeight: 1.5,
                  fontFamily: 'var(--font-sans)',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {paper.abstract}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Results Panel - Split Layout (title + abstract only, 75% centered) */}
      {currentMode === 'search' && searchResults.length > 0 && homeLayout === 'split' && isFocused && (
        <div
          className="results-panel"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '75%',
            maxWidth: '1000px',
            height: '75vh',
            display: 'flex',
            gap: '1rem',
            transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            zIndex: 20
          }}
        >
          {/* List Pane */}
          <div
            ref={listRef}
            style={{
              flex: '0 0 40%',
              minWidth: 0,
              minHeight: 0,
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              overflowY: 'auto',
              overflowX: 'hidden',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--border) transparent'
            }}
          >
            {searchResults.map((paper, idx) => (
              <div
                key={paper.id}
                data-index={idx}
                onClick={() => {
                  setSelectedPaper(paper)
                  setPage('reader')
                  setInput('')
                  setCurrentMode('normal')
                }}
                style={{
                  padding: '1rem 1.5rem',
                  borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                  backgroundColor: idx === selectedIndex ? 'var(--secondary)' : 'transparent',
                  color: idx === selectedIndex ? 'var(--background)' : 'var(--text)',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 500,
                  marginBottom: '0.35rem',
                  fontFamily: 'var(--font-sans)'
                }}>
                  {paper.title}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  marginBottom: paper.abstract ? '0.35rem' : 0,
                  fontFamily: 'var(--font-mono)',
                  opacity: idx === selectedIndex ? 0.95 : 0.8,
                  lineHeight: 1.4,
                }}>
                  {searchPaperTodoistSubtitle(paper, searchTodoistMap, searchTodoistLoading)}
                </div>
                {paper.abstract && (
                  <div style={{
                    fontSize: '0.8rem',
                    opacity: idx === selectedIndex ? 0.95 : 0.75,
                    lineHeight: 1.45,
                    fontFamily: 'var(--font-sans)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {paper.abstract}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Preview Pane - title + abstract only */}
          <div style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            backgroundColor: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '2rem',
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border) transparent'
          }}>
            {searchResults[selectedIndex] && (
              <>
                <h2 style={{
                  fontSize: '2rem',
                  fontWeight: 400,
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--text)',
                  marginBottom: '1rem',
                  lineHeight: 1.3
                }}>
                  {searchResults[selectedIndex].title}
                </h2>
                {searchResults[selectedIndex].year && (
                  <div style={{
                    display: 'inline-block',
                    backgroundColor: 'var(--secondary)',
                    color: 'var(--background)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    marginBottom: '1rem'
                  }}>
                    {searchResults[selectedIndex].year}
                  </div>
                )}
                {(() => {
                  const p = searchResults[selectedIndex]
                  const entry = searchTodoistMap[p.id]
                  if (!p.todoist_task_id) {
                    return (
                      <p style={{
                        fontSize: '0.9rem',
                        color: 'var(--muted)',
                        marginBottom: '1.25rem',
                        marginTop: 0,
                        letterSpacing: '0.02em',
                      }}
                      >
                        NOT IN TODOIST
                      </p>
                    )
                  }
                  if (searchTodoistLoading && entry == null) {
                    return (
                      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.25rem', marginTop: 0 }}>
                        Loading Todoist…
                      </p>
                    )
                  }
                  if (!entry || entry.stale || !entry.todoist) {
                    return (
                      <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: '1.25rem', marginTop: 0 }}>
                        Todoist (stale link)
                      </p>
                    )
                  }
                  const t = entry.todoist
                  const cell = { flex: '1 1 0', minWidth: '4.5rem', maxWidth: '100%' }
                  return (
                    <dl style={{
                      margin: '0 0 1.25rem 0',
                      padding: 0,
                      display: 'flex',
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: '0.75rem 1.25rem',
                      alignItems: 'flex-start',
                      fontSize: '0.95rem',
                    }}
                    >
                      <div style={cell}>
                        <dt style={todoistDetailLabel}>Status</dt>
                        <dd style={{ margin: 0, lineHeight: 1.35, wordBreak: 'break-word' }}>{t.checked ? 'Done' : 'Open'}{t.completedAt ? ` · ${t.completedAt}` : ''}</dd>
                      </div>
                      <div style={cell}>
                        <dt style={todoistDetailLabel}>Priority</dt>
                        <dd style={{ margin: 0, lineHeight: 1.35 }}>{formatTodoistPriority(t.priority)}</dd>
                      </div>
                      <div style={cell}>
                        <dt style={todoistDetailLabel}>Due</dt>
                        <dd style={{ margin: 0, lineHeight: 1.35, wordBreak: 'break-word' }}>{formatTodoistDue(t.due) || '—'}</dd>
                      </div>
                    </dl>
                  )
                })()}
                {searchResults[selectedIndex].abstract && (
                  <p style={{
                    fontSize: '0.95rem',
                    lineHeight: 1.7,
                    color: 'var(--text)',
                    fontFamily: 'var(--font-sans)',
                    opacity: 0.9
                  }}>
                    {searchResults[selectedIndex].abstract}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handlePdfUpload}
        style={{ display: 'none' }}
      />

      {/* Error message */}
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

      {/* Howto Modal */}
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
            padding: '1rem'
          }}
          onClick={() => setShowHowtoModal(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface)',
              border: '2px solid var(--border)',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '1.5rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'start',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  color: 'var(--secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  margin: 0
                }}>
                  Supported Inputs
                </p>
                <button
                  type="button"
                  onClick={() => setShowHowtoModal(false)}
                  style={{
                    color: 'var(--muted)',
                    fontSize: '1.5rem',
                    lineHeight: 1,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              </div>
              {[
                ['/search [query]', 'Search your library; linked papers show Todoist status in the results'],
                ['/add <arxiv-url-or-id>', 'Add paper from arXiv'],
                ['/preview <arxiv-url-or-id>', 'Preview title & abstract without adding'],
                ['/upload', 'Upload a PDF file'],
                ['/help', 'Open Help (all keybindings)'],
                ['https://arxiv.org/abs/...', 'Full arxiv URL (direct add)'],
                ['2401.12345', 'Bare arxiv ID (direct add)'],
                ['/howto', 'Show this help panel'],
                ['/bindings', 'Same as /help (keybindings)'],
                ['any text', 'Fuzzy search your shelf'],
              ].map(([cmd, desc], i, arr) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.5rem 0',
                  borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                }}>
                  <code style={{
                    fontSize: '0.875rem',
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--background)',
                    padding: '0.25rem 0.5rem',
                    border: '1px solid var(--border)',
                    minWidth: '200px',
                    flexShrink: 0
                  }}>
                    {cmd}
                  </code>
                  <span style={{
                    fontSize: '0.875rem',
                    color: 'var(--muted)'
                  }}>
                    {desc}
                  </span>
                </div>
              ))}
              <p style={{
                marginTop: '1rem',
                fontSize: '0.875rem',
                color: 'var(--muted)',
                margin: '1rem 0 0 0'
              }}>
                Use arrow keys to navigate results, Enter to open.
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes previewFadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-preview-fade-in {
          animation: previewFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .preview-modal .katex,
        .preview-modal .katex * {
          color: inherit !important;
          font-size: 1em !important;
        }
        .preview-abstract .katex {
          display: inline;
        }
        .preview-abstract .katex-display {
          margin: 0.75em 0;
          overflow-x: auto;
        }
        @keyframes commandsSlideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .commands-panel {
          animation: commandsSlideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  )
}
