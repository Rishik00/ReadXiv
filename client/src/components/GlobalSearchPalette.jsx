import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

export default function GlobalSearchPalette({ open, onClose, onSelectPaper }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)

  const hasQuery = query.trim().length > 0
  const title = useMemo(() => (hasQuery ? 'Global Search' : 'Recent Papers'), [hasQuery])

  useEffect(() => {
    if (!open) return
    setActiveIndex(0)
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!query.trim()) {
      setLoading(true)
      axios
        .get('/api/papers/recents', { params: { limit: 8 } })
        .then(({ data }) => {
          setResults(Array.isArray(data) ? data : [])
          setActiveIndex(0)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await axios.get('/api/search', { params: { q: query.trim() } })
        setResults(Array.isArray(data) ? data.slice(0, 12) : [])
        setActiveIndex(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 160)

    return () => clearTimeout(timer)
  }, [open, query])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveIndex((idx) => (results.length === 0 ? 0 : Math.min(results.length - 1, idx + 1)))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveIndex((idx) => Math.max(0, idx - 1))
        return
      }
      if (event.key === 'Enter' && results[activeIndex]) {
        event.preventDefault()
        onSelectPaper(results[activeIndex])
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, onSelectPaper, results, activeIndex])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] bg-foreground/80 backdrop-blur-sm px-4 py-20" onClick={onClose}>
      <div
        className="mx-auto w-full max-w-[720px] border border-border bg-surface rounded-2xl shadow-2xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-border bg-background p-4">
          <div className="mb-3 flex items-center justify-between text-xs font-medium">
            <span className="text-secondary">{title}</span>
            <span className="text-muted/60">⌘P • Esc to close</span>
          </div>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, author, abstract..."
              className="w-full border border-border bg-foreground/5 rounded-xl px-4 py-3 pl-12 text-sm text-foreground outline-none focus:border-secondary/50 transition-all"
            />
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto p-2">
          {loading && (
            <div className="px-4 py-4 text-sm text-muted animate-pulse">Searching library…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted">
              {hasQuery ? 'No matching papers found' : 'No recent papers yet'}
            </div>
          )}
          {!loading &&
            results.map((paper, index) => (
              <button
                key={paper.id}
                type="button"
                onClick={() => onSelectPaper(paper)}
                className={`mb-1 w-full rounded-xl px-4 py-3 text-left transition-all ${
                  index === activeIndex
                    ? 'bg-secondary/10 border border-secondary/30'
                    : 'border border-transparent hover:bg-foreground/5'
                }`}
              >
                <div className="text-sm font-medium text-foreground line-clamp-1">{paper.title}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted/60">
                  <span>{paper.year || '----'}</span>
                  <span>•</span>
                  <span className="truncate">{paper.authors || paper.id}</span>
                </div>
              </button>
            ))}
        </div>
      </div>
    </div>
  )
}
