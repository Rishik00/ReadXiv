import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { captureAction } from '../lib/instrumentation'

const RECENT_LIMIT = 10

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
      .get('/api/papers/recents', { params: { limit: RECENT_LIMIT } })
      .then(({ data }) => {
        const nextPapers = Array.isArray(data) ? data.slice(0, RECENT_LIMIT) : []
        setPapers(nextPapers)
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

  const openPaperAtIndex = (index, source = 'keyboard') => {
    const paper = papers[index]
    if (!paper || !onSelectPaper) return
    captureAction('recent_paper_select', {
      route: window.__readxivCurrentRoute || null,
      paperId: paper.id,
      paperTitle: paper.title,
      source,
      index,
    })
    onSelectPaper(paper)
    onClose?.()
  }

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if ((event.key === 'ArrowRight' || event.key === 'l' || event.key === 'ArrowDown' || event.key === 'j') && papers.length > 0) {
        event.preventDefault()
        moveSelection(1)
        return
      }
      if ((event.key === 'ArrowLeft' || event.key === 'h' || event.key === 'ArrowUp' || event.key === 'k') && papers.length > 0) {
        event.preventDefault()
        moveSelection(-1)
        return
      }
      if (event.key === 'Enter' && papers.length > 0) {
        event.preventDefault()
        openPaperAtIndex(activeIndex)
        return
      }
      if (/^[0-9]$/.test(event.key) && papers.length > 0) {
        event.preventDefault()
        const index = event.key === '0' ? 9 : Number(event.key) - 1
        openPaperAtIndex(index)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, papers, activeIndex])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex, open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/70 p-6 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[720px] overflow-hidden rounded-lg shadow-2xl animate-modal-in"
        style={{
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.46)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-sm font-medium text-foreground">Recents</span>
        </div>

        <div ref={listRef}>
          {loading && (
            <div className="flex flex-col gap-3 px-3 py-6 animate-fade-in">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2.5">
                  <div className="h-4 w-[85%] rounded skeleton-shimmer" />
                </div>
              ))}
            </div>
          )}

          {!loading && papers.length === 0 && (
            <div className="rx-empty-state !h-auto py-10">
              <div className="rx-empty-state-inner">
                <div className="rx-empty-state-title">No recent papers</div>
                <div className="rx-empty-state-copy">Open a paper from Library and it will appear here.</div>
              </div>
            </div>
          )}

          {!loading &&
            papers.map((paper, idx) => {
              const active = idx === activeIndex
              return (
                <button
                  key={paper.id}
                  type="button"
                  data-index={idx}
                  onClick={() => openPaperAtIndex(idx, 'click')}
                  className={`flex w-full items-start gap-3 px-6 py-2 text-left transition-colors animate-stagger-fade ${
                    active ? 'bg-secondary/15 text-secondary' : 'text-foreground hover:bg-foreground/5'
                  }`}
                  style={{ animationDelay: `${Math.min(idx, 7) * 30}ms` }}
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border font-mono text-[10px]"
                    style={{
                      borderColor: active
                        ? 'color-mix(in srgb, var(--secondary) 48%, var(--border))'
                        : 'var(--border)',
                    }}
                  >
                    {idx === 9 ? '0' : idx + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug line-clamp-2">
                      {paper.title}
                    </span>
                  </span>
                </button>
              )
            })}
        </div>
      </div>
    </div>
  )
}
