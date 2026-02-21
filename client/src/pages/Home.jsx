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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    const inputType = detectInputType(input)
    const normalizedInput = input.trim().toLowerCase()
    if (normalizedInput === '/help' || normalizedInput === '/bindings' || normalizedInput === '/keyboardbindings') return
    
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
  const showHelp = input.trim().toLowerCase() === '/help'
  const showBindings =
    input.trim().toLowerCase() === '/bindings' || input.trim().toLowerCase() === '/keyboardbindings'

  return (
    <div className="mx-auto flex min-h-[82vh] w-full max-w-[980px] flex-col items-center justify-center px-6 py-12 font-mono">
      <h1 className="mb-10 mt-10 text-center text-[56px] font-bold tracking-brutalist-tight leading-none uppercase text-foreground">
        readxiv
      </h1>

      <form onSubmit={handleSubmit} className="w-full max-w-[760px] mb-7">
        <div
          className={`bg-surface border-2 p-7 px-7 transition-all shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] ${
            isFocused ? 'border-secondary shadow-[12px_12px_0px_0px_rgba(234,88,12,0.2)]' : 'border-border'
          }`}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="PASTE ARXIV URL / ID, OR SEARCH..."
            className="w-full bg-transparent border-none outline-none text-xl text-foreground font-mono placeholder:text-muted uppercase tracking-wider"
            disabled={loading}
          />
          <div className="flex justify-between items-center mt-6">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-secondary pulse-accent" />
              <span className="text-[10px] uppercase tracking-widest text-muted">System Ready</span>
            </div>
            <div className="flex gap-3 items-center">
              <kbd className="text-[10px] font-mono text-muted bg-background border border-border px-1.5 py-0.5">
                CTRL + ENTER
              </kbd>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all border-2 ${
                  input.trim() && !loading
                    ? 'bg-secondary border-secondary text-white hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[0px] active:translate-y-[0px] active:shadow-none'
                    : 'bg-surface text-muted border-border cursor-not-allowed'
                }`}
              >
                {loading ? 'PROCESSING...' : 'EXECUTE →'}
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-xs font-bold uppercase tracking-widest border-2 border-border bg-background text-foreground hover:bg-surface hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[0px] active:translate-y-[0px] active:shadow-none transition-all"
                disabled={loading}
              >
                UPLOAD PDF
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
        {['/help', '/bindings', '/keyboardbindings'].map(
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

      {showHelp && (
        <div className="mt-3 w-full max-w-[760px] border-2 border-border bg-surface/80 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-[12px] font-bold text-secondary uppercase tracking-[0.2em] mb-4 border-b border-border pb-2">
            Supported Inputs
          </p>
          {[
            ['https://arxiv.org/abs/...', 'Full arxiv URL'],
            ['2401.12345', 'Bare arxiv ID'],
            ['/help', 'Show this help panel'],
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
      {showHelp && (
        <div className="mt-4 text-[10px] text-muted uppercase tracking-[0.15em]">Status: Local-only command execution.</div>
      )}
      {showBindings && (
        <div className="mt-3 w-full max-w-[760px] border-2 border-border bg-surface/80 p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <p className="text-[12px] font-bold text-secondary uppercase tracking-[0.2em] mb-4 border-b border-border pb-2">
            Keyboard Bindings
          </p>
          {[
            ['Ctrl+Shift+K', 'Focus search'],
            ['Ctrl+B', 'Toggle sidebar'],
            ['Ctrl+B (in notes)', 'Bold selected text'],
            ['Ctrl+Enter', 'Submit search/add paper'],
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
    </div>
  )
}
