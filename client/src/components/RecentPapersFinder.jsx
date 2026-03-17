import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

export default function RecentPapersFinder({ open, onClose, onSelectPaper }) {
  const [papers, setPapers] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setActiveIndex(0)
    setLoading(true)
    axios
      .get('/api/papers/recents', { params: { limit: 12 } })
      .then(({ data }) => {
        setPapers(Array.isArray(data) ? data : [])
        setActiveIndex(0)
      })
      .catch(() => setPapers([]))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const maxIdx = Math.max(0, papers.length - 1)
    setActiveIndex((idx) => Math.min(maxIdx, idx))
  }, [papers.length, open])

  const moveSelection = (delta) => {
    if (papers.length === 0) return
    setActiveIndex((idx) => {
      const next = idx + delta
      return Math.max(0, Math.min(papers.length - 1, next))
    })
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if ((event.key === 'ArrowDown' || event.key === 'j') && papers.length > 0) {
        event.preventDefault()
        moveSelection(1)
        return
      }
      if ((event.key === 'ArrowUp' || event.key === 'k') && papers.length > 0) {
        event.preventDefault()
        moveSelection(-1)
        return
      }
      if (event.key === 'Enter' && papers.length > 0) {
        event.preventDefault()
        const paper = papers[activeIndex]
        if (paper && onSelectPaper) {
          onSelectPaper(paper)
          onClose?.()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, onSelectPaper, papers, activeIndex])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] bg-foreground/80 backdrop-blur-sm flex items-start justify-center pt-[8vh] px-6 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] border border-border bg-surface rounded-xl shadow-2xl overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="text-muted shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>
          </span>
          <span className="text-sm font-medium text-foreground">Recent papers</span>
          <span className="text-[10px] text-muted/70 shrink-0 ml-auto">Space F</span>
        </div>

        <div ref={listRef} className="max-h-[480px] overflow-auto py-2">
          {loading && (
            <div className="px-4 py-8 flex flex-col gap-3 animate-fade-in">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-4 w-[85%] rounded skeleton-shimmer" />
                  <div className="h-2.5 w-1/3 rounded skeleton-shimmer" />
                </div>
              ))}
            </div>
          )}
          {!loading && papers.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-muted">No recent papers</div>
          )}
          {!loading &&
            papers.map((paper, idx) => (
              <button
                key={paper.id}
                type="button"
                data-index={idx}
                onClick={() => {
                  onSelectPaper?.(paper)
                  onClose?.()
                }}
                className={`w-full flex flex-col gap-0.5 px-4 py-2.5 text-left transition-colors ${
                  idx === activeIndex
                    ? 'bg-secondary/15 text-secondary'
                    : 'text-foreground hover:bg-foreground/5'
                }`}
              >
                <span className="text-sm font-medium line-clamp-2">{paper.title}</span>
                <span className="text-[11px] text-muted truncate">
                  {[paper.year, paper.authors].filter(Boolean).join(' · ') || paper.id}
                </span>
              </button>
            ))}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-background/50 text-[10px] text-muted">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">↓</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">j</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">k</kbd>
            <span className="ml-2">navigate</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono">Enter</kbd>
            <span className="ml-1">open</span>
          </span>
        </div>
      </div>
    </div>
  )
}
