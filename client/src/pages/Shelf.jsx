import { useState, useEffect } from 'react'
import axios from 'axios'

const ITEMS_PER_PAGE = 10

export default function Shelf({ setPage, setSelectedPaper, initialQuery = '', onOpenNotes }) {
  const [papers, setPapers] = useState([])
  const [displayPapers, setDisplayPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQuery)
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingPaperId, setDeletingPaperId] = useState(null)

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
      <div className="p-8 max-w-[980px] mx-auto">
        <div className="rounded-xl border border-border bg-surface p-6 text-muted">Loading papers...</div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto font-sans">
      <div className="flex items-center justify-between mb-10">
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

      <div className="flex gap-4 items-center mb-10">
        <div className="relative flex-1 max-w-[460px]">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your library..."
            className="w-full bg-surface border border-border rounded-xl px-4 py-3 pl-12 text-sm text-foreground outline-none focus:border-secondary/50 transition-all"
          />
        </div>
      </div>

      {displayPapers.length === 0 ? (
        <div className="claude-card p-20 text-center text-muted">
          {search ? 'No matching papers found' : 'Your library is empty. Add papers from the home screen.'}
        </div>
      ) : (
        <div className="claude-card overflow-hidden">
          <div className="grid grid-cols-[2fr_0.8fr_0.6fr_0.8fr_0.8fr] gap-4 p-4 px-6 bg-background/50 border-b border-border">
            {['Title', 'Status', 'Year', 'Source', 'Actions'].map((h, i) => (
              <div key={i} className="text-xs font-semibold text-muted/60">
                {h}
              </div>
            ))}
          </div>
          {pagedPapers.map((paper) => (
            <div
              key={paper.id}
              onClick={() => {
                setSelectedPaper(paper)
                setPage('reader')
              }}
              className="grid grid-cols-[2fr_0.8fr_0.6fr_0.8fr_0.8fr] gap-4 p-5 px-6 border-b border-border last:border-0 cursor-pointer hover:bg-foreground/[0.02] transition-colors items-center group"
            >
              <div>
                <div className="text-sm font-medium leading-snug group-hover:text-secondary transition-colors line-clamp-2">{paper.title}</div>
                <div className="text-[11px] text-muted mt-1.5 font-mono opacity-50">{paper.id}</div>
              </div>
              <div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(
                    paper.status
                  )}`}
                >
                  {paper.status || 'queued'}
                </span>
              </div>
              <div className="text-sm text-muted/80">{paper.year || '----'}</div>
              <div>
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
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (onOpenNotes) onOpenNotes(paper)
                  }}
                  className="text-xs text-foreground font-medium hover:text-secondary transition-colors"
                >
                  Open Notes
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

      {displayPapers.length > ITEMS_PER_PAGE && (
        <div className="mt-8 flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-2 rounded-lg border border-border bg-surface text-muted hover:text-foreground hover:border-secondary/50 disabled:opacity-30 transition-all"
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
            className="p-2 rounded-lg border border-border bg-surface text-muted hover:text-foreground hover:border-secondary/50 disabled:opacity-30 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      )}
    </div>
  )
}
