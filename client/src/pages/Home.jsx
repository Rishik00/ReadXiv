import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

export default function Home({ setPage, setSelectedPaper, focusNonce, onSearchQuery, addToast }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [isFocused, setIsFocused] = useState(false)

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
    if (normalizedInput === '/howto' || normalizedInput === '/bindings') return
    
    // If it's an arxiv URL or ID, fetch and add paper
    if (inputType === 'arxiv URL' || inputType === 'arxiv ID') {
      setLoading(true)
      setError(null)
      
      try {
        const response = await axios.post('/api/arxiv/add', {
          input: input.trim()
        })

        setSelectedPaper(response.data)
        if (response.data?.alreadyExists) {
          addToast?.('Paper already found, moving to the reader', 'success')
        } else {
          addToast?.('Paper added, moving to the reader', 'success')
        }
        setPage('reader')
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
  const showHowto = input.trim().toLowerCase() === '/howto'
  const showBindings = input.trim().toLowerCase() === '/bindings'

  return (
    <div className="mx-auto flex min-h-[82vh] w-full max-w-[800px] flex-col items-center justify-center px-6 py-12">
      <div className="mb-12 flex flex-col items-center justify-center gap-6 text-center">
        <h1 className="text-4xl md:text-5xl font-serif text-foreground tracking-tight">
          {greeting}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-[720px] mb-8">
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
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            placeholder="Paste arXiv URL, ID, or search..."
            className="w-full bg-transparent border-none outline-none text-lg text-foreground font-sans placeholder:text-muted/50 resize-none py-2 px-2"
            disabled={loading}
          />
          <div className="flex justify-between items-center mt-4 px-2">
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
        {['/howto', '/bindings'].map(
          (ex, i) => (
            <button
              key={i}
              onClick={() => setInput(ex)}
              className="bg-surface border border-border rounded px-2.5 py-1 text-[11px] text-muted font-mono cursor-pointer hover:bg-background transition-colors"
            >
              {ex}
            </button>
          )
        )}
      </div>

      {showHowto && (
        <div className="mt-3 w-full max-w-[760px] border-2 border-border bg-surface/80 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-[12px] font-bold text-secondary uppercase tracking-[0.2em] mb-4 border-b border-border pb-2">
            Supported Inputs
          </p>
          {[
            ['https://arxiv.org/abs/...', 'Full arxiv URL'],
            ['2401.12345', 'Bare arxiv ID'],
            ['/howto', 'Show this help panel'],
            ['any text', 'Fuzzy search your shelf'],
          ].map(([cmd, desc], i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
              <code className="text-[11px] text-foreground font-mono bg-background px-2 py-1 border border-border min-w-[220px]">
                {cmd}
              </code>
              <span className="text-xs text-muted uppercase tracking-wider">{desc}</span>
            </div>
          ))}
        </div>
      )}
      {showHowto && (
        <div className="mt-4 text-[10px] text-muted uppercase tracking-[0.15em]">Status: Local-only command execution.</div>
      )}
      {showBindings && (
        <div className="mt-3 w-full max-w-[760px] border-2 border-border bg-surface/80 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-[12px] font-bold text-secondary uppercase tracking-[0.2em] mb-4 border-b border-border pb-2">
            Keyboard Bindings
          </p>
          {[
            ['Ctrl+P', 'Command palette (search papers & navigate)'],
            ['Ctrl+K', 'Focus this search bar'],
            ['Ctrl+B', 'Toggle sidebar'],
            ['Ctrl+B (in notes)', 'Bold selected text'],
            ['Ctrl+Enter', 'Submit search / add paper'],
          ].map(([cmd, desc], i) => (
            <div key={i} className="flex items-center gap-4 py-2 border-b border-border/50 last:border-0">
              <code className="text-[11px] text-foreground font-mono bg-background px-2 py-1 border border-border min-w-[220px]">
                {cmd}
              </code>
              <span className="text-xs text-muted uppercase tracking-wider">{desc}</span>
            </div>
          ))}
          <div className="mt-4 pt-3 border-t border-border/50 text-[11px] text-muted">
            In command palette: <span className="text-secondary font-mono">↑↓jk</span> navigate · <span className="text-secondary font-mono">Enter</span> open · <span className="text-secondary font-mono">Tab</span> commands · type <span className="text-secondary font-mono">&gt;</span> for app commands
          </div>
        </div>
      )}
    </div>
  )
}
