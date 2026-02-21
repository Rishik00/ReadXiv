import { useState, useEffect } from 'react'
import axios from 'axios'

const ITEMS_PER_PAGE = 10

export default function Shelf({ setPage, setSelectedPaper, initialQuery = '', onOpenNotes }) {
  const [papers, setPapers] = useState([])
  const [displayPapers, setDisplayPapers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(initialQuery)
  const [currentPage, setCurrentPage] = useState(1)

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
    <div className="p-7 max-w-[1100px] mx-auto font-mono">
      <div className="flex items-center gap-2 mb-8 text-[11px] uppercase tracking-[0.2em] font-bold">
        <span className="text-muted cursor-pointer hover:text-secondary" onClick={() => setPage('home')}>
          SYSTEM
        </span>
        <span className="text-muted text-[10px]">/</span>
        <span className="text-foreground">PAPER_SHELF</span>
        <span className="ml-auto text-secondary">
          [{displayPapers.length} RECORDS FOUND] · PAGE {currentPage}/{totalPages}
        </span>
      </div>

      <div className="flex gap-4 items-center mb-8 flex-wrap">
        <div className="relative flex-1 max-w-[400px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-muted pointer-events-none font-bold">
            ⌕
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="QUERY DATABASE..."
            className="w-full bg-surface border-2 border-border rounded-none px-4 py-2.5 pl-10 text-[12px] text-foreground outline-none focus:border-secondary uppercase tracking-widest transition-all"
          />
        </div>
      </div>

      {displayPapers.length === 0 ? (
        <div className="border-2 border-border bg-surface p-16 text-center text-muted uppercase tracking-widest font-bold">
          {search ? 'NO MATCHING RECORDS' : 'DATABASE EMPTY // ADD PAPERS VIA HOME'}
        </div>
      ) : (
        <div className="border-2 border-border rounded-none overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
          <div className="grid grid-cols-[2.1fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-4 p-4 px-6 bg-surface border-b-2 border-border">
            {['PAPER_TITLE', 'STATUS', 'YEAR', 'SOURCE', 'NOTES'].map((h, i) => (
              <div key={i} className="text-[10px] font-bold text-muted uppercase tracking-[0.2em]">
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
              className="grid grid-cols-[2.1fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-4 p-5 px-6 border-b border-border last:border-0 cursor-pointer hover:bg-surface/50 transition-colors items-center group"
            >
              <div>
                <div className="text-[13px] font-bold leading-tight uppercase tracking-wide group-hover:text-secondary transition-colors">{paper.title}</div>
                <div className="text-[10px] font-mono text-muted mt-1.5 opacity-60">ID: {paper.id}</div>
              </div>
              <div>
                <span
                  className={`inline-flex items-center px-2 py-1 rounded-none text-[9px] font-bold uppercase tracking-widest border ${getStatusColor(
                    paper.status
                  )}`}
                >
                  {paper.status || 'queued'}
                </span>
              </div>
              <div className="text-[11px] text-muted font-bold tracking-widest">{paper.year || '----'}</div>
              <div>
                {paper.url ? (
                  <a
                    href={paper.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="text-[10px] text-secondary hover:underline font-bold uppercase tracking-widest"
                  >
                    SRC_LINK ↗
                  </a>
                ) : (
                  <span className="text-[10px] text-muted opacity-40">----</span>
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (onOpenNotes) onOpenNotes(paper)
                  }}
                  className="text-[10px] text-foreground font-bold uppercase tracking-widest border-b border-border hover:border-foreground transition-all"
                >
                  OPEN_NOTES
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {displayPapers.length > ITEMS_PER_PAGE && (
        <div className="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="border-2 border-border bg-surface px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-background disabled:opacity-30 transition-all active:translate-y-0.5"
          >
            ← PREV
          </button>
          <span className="text-[11px] font-bold text-muted tracking-[0.2em]">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="border-2 border-border bg-surface px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-foreground hover:bg-background disabled:opacity-30 transition-all active:translate-y-0.5"
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  )
}
