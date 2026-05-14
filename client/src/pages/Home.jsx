import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import LatexText from '../components/LatexText'

function isArxivInput(val) {
  if (!val?.trim()) return false
  return val.includes('arxiv.org') || /^\d{4}\.\d+/.test(val.trim())
}

const SLASH_COMMANDS = [
  { id: 'search', slug: 'search', label: 'Search library', desc: 'Open the library search page', prefix: '/search ' },
  { id: 'add', slug: 'add', label: 'Add from arXiv', desc: 'Fetch paper by URL or ID', prefix: '/add ' },
  { id: 'preview', slug: 'preview', label: 'Preview paper', desc: 'Title and abstract without adding', prefix: '/preview ' },
  { id: 'upload', slug: 'upload', label: 'Upload PDF', desc: 'Add a local PDF file', prefix: null },
  { id: 'help', slug: 'help', label: 'Help', desc: 'Keyboard shortcuts and bindings', prefix: null },
  { id: 'howto', slug: 'howto', label: 'Supported inputs', desc: 'Command reference', prefix: null },
]

export default function Home({ setPage, openPaper, focusNonce, onSearchQuery, addToast }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [showHowtoModal, setShowHowtoModal] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [currentMode, setCurrentMode] = useState('normal')
  const [searchQuery, setSearchQuery] = useState('')
  const [addQuery, setAddQuery] = useState('')
  const [previewQuery, setPreviewQuery] = useState('')
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const slashMenuRef = useRef(null)
  const pollingRef = useRef(null)

  const GREETINGS = [
    <>What <em>papers</em> are we conquering today?</>,
    <>Ready to fall down a <em>citation rabbit hole</em>?</>,
    <>Your brain is a <em>sponge</em>. Feed it papers.</>,
    <>What <em>knowledge</em> shall we acquire today?</>,
    <>Paste, search, or upload-<em>let&apos;s go</em>.</>,
    <>Another day, another paper to add to the <em>pile</em>.</>,
    <>Scientific curiosity: <em>activate</em>.</>,
    <>What&apos;s on the <em>arXiv menu</em> today?</>,
    <>Papers: long tweets with <em>footnotes</em>.</>,
    <>Your future self will thank you for <em>reading this</em>.</>,
  ]

  const [greeting] = useState(() => {
    const d = new Date()
    const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5)
    const seed = dayOfYear * 24 + d.getHours()
    return GREETINGS[seed % GREETINGS.length]
  })

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
  }, [])

  useEffect(() => {
    if (!focusNonce) return
    inputRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    const val = input.trim()
    if (val.startsWith('/search ')) {
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
    if (currentMode !== 'add' || !isArxivInput(addQuery)) {
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
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [addQuery, currentMode])

  useEffect(() => {
    if (currentMode !== 'preview' || !isArxivInput(previewQuery)) {
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

  useEffect(() => {
    if (!showHowtoModal) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowHowtoModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showHowtoModal])

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

  const handleSearchLaunch = (query) => {
    onSearchQuery(query.trim())
    setInput('')
    setSearchQuery('')
    setCurrentMode('normal')
    setIsFocused(false)
  }

  const handleArxivAdd = async (query) => {
    setLoading(true)
    setError(null)
    try {
      const response = await axios.post('/api/arxiv/add', { input: query.trim() })
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
          } catch {}
        }, 2500)
        pollingRef.current = pollInterval
      }

      setInput('')
      openPaper?.(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add paper')
      console.error('Error adding paper:', err)
    } finally {
      setLoading(false)
    }
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
      await handleArxivAdd(addQuery)
      setAddQuery('')
      setCurrentMode('normal')
      return
    }

    if (currentMode === 'preview') {
      return
    }

    if (isArxivInput(input)) {
      await handleArxivAdd(input)
      return
    }

    handleSearchLaunch(input)
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
      if (response.data?.alreadyExists) {
        addToast?.('Paper already found, moving to the reader', 'success')
      } else {
        addToast?.('PDF uploaded, moving to the reader', 'success')
      }
      openPaper?.(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload PDF')
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
    currentMode === 'search' ? '/search' :
    currentMode === 'add' ? '/add' :
    currentMode === 'preview' ? '/preview' :
    null

  const inputPlaceholder =
    currentMode === 'search' ? 'Search your library...' :
    currentMode === 'add' ? 'arXiv URL or ID...' :
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
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      padding: '2rem'
    }}>
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
          textAlign: 'center',
          margin: 0,
          color: 'var(--foreground)'
        }}>
          {greeting}
        </h1>
      </div>

      <div
        className={`command-area ${isFocused ? 'focused' : ''}`}
        style={{
          position: 'relative',
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), margin-bottom 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          transform: isFocused ? 'translateY(-6px)' : 'translateY(0)',
          height: '76px',
          marginBottom: isFocused ? '0.75rem' : '2rem'
        }}
      >
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
                  <div
                    className="text-xs mt-0.5 leading-snug"
                    style={{ color: i === slashSelectedIndex ? 'color-mix(in srgb, var(--button-on-secondary) 68%, transparent)' : undefined }}
                  >{cmd.desc}</div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {currentMode === 'add' && preview?.title && (
        <div
          className="animate-preview-fade-in"
          style={{
            position: 'absolute',
            bottom: '100px',
            left: '2rem',
            right: '2rem',
            padding: '0.75rem 1.25rem',
            background: 'color-mix(in srgb, var(--surface) 76%, transparent)',
            border: '1px solid color-mix(in srgb, var(--secondary) 14%, var(--border))',
            borderRadius: '8px',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-sans)',
            color: 'var(--foreground)',
            lineHeight: 1.4,
            backdropFilter: 'blur(18px)',
            boxShadow: '0 18px 52px rgba(0, 0, 0, 0.22)',
            zIndex: 15,
            maxWidth: '75%',
            margin: '0 auto'
          }}
        >
          {preview.title}
        </div>
      )}

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
        className="hidden"
        onChange={handlePdfUpload}
        style={{ display: 'none' }}
      />

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
              <div><code>/search [query]</code> - open the search page</div>
              <div><code>/add [arXiv id or URL]</code> - fetch and add a paper</div>
              <div><code>/preview [arXiv id or URL]</code> - preview title and abstract without adding</div>
              <div><code>/upload</code> - upload a local PDF</div>
              <div><code>/help</code> - open keyboard shortcuts</div>
              <div><code>plain text</code> - search your library</div>
              <div><code>arXiv URL or ID</code> - add directly from the command bar</div>
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
