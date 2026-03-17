import { useState, useEffect } from 'react'
import axios from 'axios'

const ITEMS_PER_PAGE = 10

function ScheduleModal({ paper, onSave, onClose, getStatusColor }) {
  const [deadline, setDeadline] = useState(paper.deadline || '')
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-backdrop-in"
      onClick={onClose}
    >
      <div
        className="bg-surface border-2 border-border rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-sm font-semibold text-foreground">Set reading deadline</h3>
            <button
              type="button"
              onClick={onClose}
              className="text-muted hover:text-foreground text-xl leading-none -mt-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div>
            <div className="text-sm font-medium text-foreground line-clamp-2">{paper.title}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(paper.status)}`}>
                {paper.status || 'queued'}
              </span>
              <span className="text-[11px] text-muted font-mono">{paper.id}</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] text-muted uppercase block mb-1.5">When do you want to read it?</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full bg-background border-2 border-border rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onSave({ deadline: deadline || null })}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-secondary text-[var(--button-on-secondary)] hover:opacity-90"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Shelf({ setPage, setSelectedPaper, initialQuery = '', onOpenNotes }) {
  const [papers, setPapers] = useState([])
  const [displayPapers, setDisplayPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQuery)
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingPaperId, setDeletingPaperId] = useState(null)
  const [schedulePaperId, setSchedulePaperId] = useState(null)

  useEffect(() => {
    fetchPapers()
  }, [])

  useEffect(() => {
    setSearch(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!search.trim()) {
        setDisplayPapers(papers)
        return
      }

      try {
        const response = await axios.get('/api/search', {
          params: { q: search.trim() },
        })
        setDisplayPapers(response.data)
      } catch (error) {
        console.error('Error searching papers:', error)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [search, papers])

  const fetchPapers = async () => {
    try {
      const response = await axios.get('/api/papers')
      setPapers(response.data)
      setDisplayPapers(response.data)
    } catch (error) {
      console.error('Error fetching papers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePaper = async (paper, event) => {
    event.stopPropagation()
    if (deletingPaperId) return
    const confirmed = window.confirm(`Delete "${paper.title}" from your shelf?`)
    if (!confirmed) return

    setDeletingPaperId(paper.id)
    try {
      await axios.delete(`/api/papers/${paper.id}`)
      setPapers((prev) => prev.filter((p) => p.id !== paper.id))
      setDisplayPapers((prev) => prev.filter((p) => p.id !== paper.id))
    } catch (error) {
      console.error('Error deleting paper:', error)
    } finally {
      setDeletingPaperId(null)
    }
  }

  const handleSchedulePaper = async (paper, { deadline }) => {
    try {
      await axios.patch(`/api/papers/${paper.id}`, { deadline: deadline || null })
      setPapers((prev) => prev.map((p) => (p.id === paper.id ? { ...p, deadline: deadline || null } : p)))
      setDisplayPapers((prev) => prev.map((p) => (p.id === paper.id ? { ...p, deadline: deadline || null } : p)))
      setSchedulePaperId(null)
    } catch (err) {
      console.error('Failed to update schedule', err)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'done':
        return 'border-green-500/50 text-green-400 bg-green-500/10'
      case 'reading':
        return 'border-secondary/50 text-secondary bg-secondary/10'
      default:
        return 'border-border text-muted bg-surface'
    }
  }

  const totalPages = Math.max(1, Math.ceil(displayPapers.length / ITEMS_PER_PAGE))
  const pageStart = (currentPage - 1) * ITEMS_PER_PAGE
  const pagedPapers = displayPapers.slice(pageStart, pageStart + ITEMS_PER_PAGE)

  if (loading) {
    return (
      <div className="p-8 max-w-[880px] mx-auto animate-fade-in">
        <div className="rounded-xl border-2 border-border bg-surface overflow-hidden">
          <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr] gap-4 p-4 px-6 bg-background/50 border-b-2 border-border">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 rounded skeleton-shimmer" />
            ))}
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr] gap-4 p-5 px-6 border-b-2 border-border last:border-0">
              <div className="space-y-2">
                <div className="h-4 w-3/4 rounded skeleton-shimmer" />
                <div className="h-2.5 w-1/3 rounded skeleton-shimmer" />
              </div>
              <div className="h-5 w-16 rounded-full skeleton-shimmer" />
              <div className="h-4 w-12 rounded skeleton-shimmer" />
              <div className="h-4 w-14 rounded skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[880px] mx-auto font-sans animate-view-fade">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3 text-sm font-medium">
          <span className="text-muted cursor-pointer hover:text-foreground transition-colors" onClick={() => setPage('home')}>
            Home
          </span>
          <span className="text-muted/50">/</span>
          <span className="text-foreground">Paper Shelf</span>
        </div>
        <div className="text-secondary text-sm font-medium">
          {displayPapers.length} papers found
        </div>
      </div>

      <div className="flex gap-4 items-center mb-6">
        <div className="relative flex-1 max-w-[460px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library..."
            className="w-full bg-surface border-2 border-border rounded-xl px-4 py-3 pl-12 text-sm text-foreground outline-none focus:border-secondary/50 transition-all"
          />
        </div>
      </div>

      {displayPapers.length === 0 ? (
        <div className="claude-card p-20 text-center text-muted">
          {search ? 'No matching papers found' : 'Your library is empty. Add papers from the home screen.'}
        </div>
      ) : (
        <div className="claude-card overflow-hidden">
          <div className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr] gap-4 p-4 px-6 bg-background/50 border-b-2 border-border items-center">
            <div className="text-xs font-semibold text-muted/60">Title</div>
            <div className="text-xs font-semibold text-muted/60 text-center">Status</div>
            <div className="text-xs font-semibold text-muted/60 text-center">Source</div>
            <div className="text-xs font-semibold text-muted/60 text-center">Actions</div>
          </div>
          {pagedPapers.map((paper, idx) => (
            <div
              key={paper.id}
              style={{ animationDelay: `${idx * 40}ms` }}
              onClick={() => {
                setSelectedPaper(paper)
                setPage('reader')
              }}
              className="grid grid-cols-[2fr_0.8fr_0.8fr_0.8fr] gap-4 py-6 px-6 border-b-2 border-border last:border-0 cursor-pointer hover:bg-foreground/[0.02] transition-colors items-center group animate-stagger-fade opacity-0"
            >
              <div>
                <div className="text-sm font-medium leading-snug group-hover:text-secondary transition-colors line-clamp-2">{paper.title}</div>
                <div className="text-[11px] text-muted mt-1.5 font-mono opacity-50">{paper.id}</div>
              </div>
              <div className="flex justify-center">
                <select
                  value={paper.status || 'queued'}
                  onChange={async (e) => {
                    e.stopPropagation()
                    const status = e.target.value
                    try {
                      await axios.patch(`/api/papers/${paper.id}`, { status })
                      setPapers((prev) => prev.map((p) => (p.id === paper.id ? { ...p, status } : p)))
                      setDisplayPapers((prev) => prev.map((p) => (p.id === paper.id ? { ...p, status } : p)))
                    } catch {}
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium border cursor-pointer appearance-none pr-6 bg-transparent ${getStatusColor(
                    paper.status
                  )}`}
                  style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23737373%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.25rem top 50%', backgroundSize: '0.5rem auto' }}
                >
                  <option value="queued">Queued</option>
                  <option value="reading">Reading</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div className="flex justify-center">
                {paper.url ? (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="text-xs text-secondary hover:underline font-medium inline-flex items-center gap-1"
                  >
                    arXiv <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                  </a>
                ) : (
                  <span className="text-xs text-muted/40">Local PDF</span>
                )}
              </div>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSchedulePaperId(schedulePaperId === paper.id ? null : paper.id)
                  }}
                  className="text-xs text-foreground font-medium hover:text-secondary transition-colors"
                  title="Set reading deadline"
                >
                  Schedule
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (onOpenNotes) onOpenNotes(paper)
                  }}
                  className="text-xs text-foreground font-medium hover:text-secondary transition-colors"
                >
                  Notes
                </button>
                <button
                  type="button"
                  onClick={(event) => handleDeletePaper(paper, event)}
                  disabled={deletingPaperId === paper.id}
                  className="text-xs text-red-400 font-medium hover:text-red-300 transition-colors disabled:opacity-60"
                >
                  {deletingPaperId === paper.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {schedulePaperId && (() => {
        const paper = displayPapers.find((p) => p.id === schedulePaperId)
        if (!paper) return null
        return (
          <ScheduleModal
            paper={paper}
            getStatusColor={getStatusColor}
            onSave={(data) => handleSchedulePaper(paper, data)}
            onClose={() => setSchedulePaperId(null)}
          />
        )
      })()}

      {displayPapers.length > ITEMS_PER_PAGE && (
        <div className="mt-8 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-2 rounded-lg border-2 border-border bg-surface text-muted hover:text-foreground hover:border-secondary/50 disabled:opacity-30 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span className="text-sm font-medium text-muted">
            {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-lg border-2 border-border bg-surface text-muted hover:text-foreground hover:border-secondary/50 disabled:opacity-30 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
