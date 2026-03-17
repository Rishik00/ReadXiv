import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

function isArxivInput(val) {
  if (!val?.trim()) return false
  return val.includes('arxiv.org') || /^\d{4}\.\d+/.test(val.trim())
}

export default function Home({ setPage, setSelectedPaper, focusNonce, onSearchQuery, addToast }) {
  const goToHelp = () => setPage('help')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const pollingRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => () => {
    if (pollingRef.current) clearInterval(pollingRef.current)
  }, [])

  const detectInputType = (val) => {
    if (val.includes('arxiv.org')) return 'arxiv URL'
    if (val.match(/^\d{4}\.\d+/)) return 'arxiv ID'
    if (val.startsWith('/')) return 'command'
    if (val.length > 2) return 'searching...'
    return null
  }

  useEffect(() => {
    if (!focusNonce) return
    inputRef.current?.focus()
  }, [focusNonce])

  useEffect(() => {
    if (!isArxivInput(input)) {
      setPreview(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.get('/api/arxiv/preview', { params: { input: input.trim() } })
        if (!cancelled) setPreview({ title: data.title, authors: data.authors })
      } catch {
        if (!cancelled) setPreview(null)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [input])

  const GREETINGS = [
    'What papers are we conquering today?',
    'Ready to fall down a citation rabbit hole?',
    'Your brain is a sponge. Feed it papers.',
    'What knowledge shall we acquire today?',
    'Paste, search, or upload—let\'s go.',
    'Another day, another paper to add to the pile.',
    'Scientific curiosity: activate.',
    'What\'s on the arXiv menu today?',
    'Papers: long tweets with footnotes.',
    'Your future self will thank you for reading this.',
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

    const inputType = detectInputType(input)
    const normalizedInput = input.trim().toLowerCase()
    if (normalizedInput === '/howto') {
      setShowHowtoModal(true)
      setInput('')
      return
    }
    if (normalizedInput === '/bindings') {
      setPage('help')
      setInput('')
      return
    }

    // If it's an arxiv URL or ID, fetch and add paper
    if (inputType === 'arxiv URL' || inputType === 'arxiv ID') {
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
          const maxAttempts = 120 // ~5 min at 2.5s
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

  const inputType = detectInputType(input)
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

  return (
    <div className="mx-auto flex min-h-[82vh] w-full max-w-[800px] flex-col items-center justify-center px-6 py-16">
      <div className="mb-12 flex flex-col items-center justify-center gap-6 text-center">
        <h1 className="text-4xl md:text-5xl font-serif text-foreground tracking-tight">
          {greeting}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-[720px] mb-8 relative">
        {preview && (
          <div className="mb-2 px-4 py-2 rounded-lg border border-border bg-surface/95 text-left animate-lip-in">
            <div className="text-sm font-medium text-foreground line-clamp-1">{preview.title}</div>
            <div className="text-xs text-muted truncate mt-0.5">{preview.authors}</div>
          </div>
        )}
        <div
          className={`claude-input-container p-4 transition-all duration-300 relative ${
            isFocused 
              ? 'border-secondary/60' 
              : 'border-border shadow-lg hover:border-border/80'
          }`}
          style={isFocused ? {
            boxShadow: '0 0 0 1px color-mix(in srgb, var(--secondary) 60%, transparent), 0 0 20px 4px color-mix(in srgb, var(--secondary) 15%, transparent), 0 0 40px 8px color-mix(in srgb, var(--secondary) 5%, transparent)'
          } : {}}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = e.target.scrollHeight + 'px'
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                inputRef.current?.blur()
                e.preventDefault()
                return
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Paste arXiv URL, ID, or search..."
            className="w-full bg-transparent border-none outline-none text-lg text-foreground font-sans placeholder:text-muted/50 resize-none py-2 px-2"
            disabled={loading}
          />
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              isFocused ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex justify-between items-center pt-4 px-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-full hover:bg-foreground/5 text-muted hover:text-foreground transition-colors"
                  title="Upload PDF"
                  disabled={loading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                </button>
              </div>
              <div className="flex gap-3 items-center">
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    input.trim() && !loading
                      ? 'bg-secondary text-[var(--button-on-secondary)] hover:opacity-90'
                      : 'bg-foreground/5 text-muted cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handlePdfUpload}
      />

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap justify-center mb-10">
        <button
          type="button"
          onClick={openHowto}
          className="bg-surface border-2 border-border rounded-lg px-3 py-1.5 text-sm text-muted font-mono cursor-pointer hover:bg-background transition-colors"
        >
          /howto
        </button>
        <button
          type="button"
          onClick={goToHelp}
          className="bg-surface border-2 border-border rounded-lg px-3 py-1.5 text-sm text-muted font-mono cursor-pointer hover:bg-background transition-colors"
        >
          /bindings
        </button>
      </div>

      {showHowtoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-backdrop-in p-4"
          onClick={() => setShowHowtoModal(false)}
        >
          <div
            className="bg-surface border-2 border-border rounded-xl shadow-2xl w-full max-w-[560px] max-h-[85vh] overflow-y-auto animate-modal-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <p className="text-sm font-bold text-secondary uppercase tracking-wider">Supported Inputs</p>
                <button type="button" onClick={() => setShowHowtoModal(false)} className="text-muted hover:text-foreground text-xl leading-none">×</button>
              </div>
              {[
                ['https://arxiv.org/abs/...', 'Full arxiv URL (shows title & authors preview)'],
                ['2401.12345', 'Bare arxiv ID'],
                ['/howto', 'Show this help panel'],
                ['/bindings', 'Go to Help page (keyboard shortcuts)'],
                ['any text', 'Fuzzy search your shelf'],
              ].map(([cmd, desc], i) => (
                <div key={i} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
                  <code className="text-sm text-foreground font-mono bg-background px-2 py-1 border border-border min-w-[200px] shrink-0">{cmd}</code>
                  <span className="text-sm text-muted">{desc}</span>
                </div>
              ))}
              <p className="mt-4 text-sm text-muted">Status: Local-only command execution.</p>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
