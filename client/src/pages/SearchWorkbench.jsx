import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import TodoistTaskModal, { paperHasTodoistTask } from '../components/TodoistTaskModal'
import { captureAction, captureAppError, captureTiming, elapsedSince, startTimer } from '../lib/instrumentation'

function formatTodoistPriority(p) {
  if (typeof p !== 'number') return '-'
  const map = { 4: 'P1', 3: 'P2', 2: 'P3', 1: 'P4' }
  return map[p] ?? `(${p})`
}

function formatTodoistDue(due) {
  if (!due) return null
  if (typeof due === 'string') return due
  if (due.string) return due.string
  if (due.date) return due.date
  return null
}

function getStatusColor(status) {
  switch (status) {
    case 'done':
      return 'border-red-500/50 text-red-400 bg-red-500/10'
    case 'reading':
      return 'border-green-500/50 text-green-400 bg-green-500/10'
    default:
      return 'border-white/40 text-white bg-white/10'
  }
}

function cycleStatus(status) {
  if (status === 'queued') return 'reading'
  if (status === 'reading') return 'done'
  return 'queued'
}

export default function SearchWorkbench({
  initialQuery = '',
  focusNonce,
  setPage,
  openPaper,
  addToast,
}) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pageSize] = useState(10)
  const [totalPages, setTotalPages] = useState(1)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [focusPanel, setFocusPanel] = useState('stack')
  const [todoistModalPaper, setTodoistModalPaper] = useState(null)
  const [todoistEntry, setTodoistEntry] = useState(null)
  const [todoistLoading, setTodoistLoading] = useState(false)
  const [deletingPaperId, setDeletingPaperId] = useState(null)
  const [metadataEditPaper, setMetadataEditPaper] = useState(null)
  const [metadataDraft, setMetadataDraft] = useState({ title: '', authors: '', abstract: '' })
  const [metadataSaving, setMetadataSaving] = useState(false)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const stackPaneRef = useRef(null)
  const dosPaneRef = useRef(null)
  const dosBodyRef = useRef(null)
  const prevPaperIdRef = useRef(null)
  const pageBarRef = useRef(null)

  useEffect(() => {
    setQuery(initialQuery)
    setCurrentPage(1)
  }, [initialQuery])

  useEffect(() => {
    if (!focusNonce) return
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [focusNonce])

  useEffect(() => {
    setCurrentPage(1)
  }, [query])

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      const startedAt = startTimer()
      setLoading(true)
      try {
        const { data } = await axios.get('/api/papers', {
          params: {
            q: query.trim(),
            page: currentPage,
            pageSize,
          },
        })
        if (cancelled) return
        const items = Array.isArray(data?.items) ? data.items : []
        setResults(items)
        setTotal(Number.isFinite(data?.total) ? data.total : items.length)
        setTotalPages(Number.isFinite(data?.totalPages) ? data.totalPages : 1)
        setCurrentPage(Number.isFinite(data?.page) ? data.page : 1)
        setSelectedIndex((prev) => {
          if (items.length === 0) return 0
          return Math.min(prev, items.length - 1)
        })
        captureTiming('page_load', elapsedSince(startedAt), {
          route: 'search',
          source: 'search_results',
          queryLength: query.trim().length,
          page: currentPage,
          resultCount: items.length,
          total: Number.isFinite(data?.total) ? data.total : items.length,
        })
      } catch (error) {
        if (cancelled) return
        console.error('Error loading search page:', error)
        captureAppError(error, {
          route: 'search',
          source: 'search_results',
          queryLength: query.trim().length,
          page: currentPage,
        })
        setResults([])
        setTotal(0)
        setTotalPages(1)
        setSelectedIndex(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 140)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, currentPage, pageSize])

  const selectedPaper = results[selectedIndex] || null

  useEffect(() => {
    if (!selectedPaper?.id) {
      setTodoistEntry(null)
      setTodoistLoading(false)
      return
    }
    if (!selectedPaper.todoist_task_id) {
      setTodoistEntry({ stale: false, todoist: null })
      setTodoistLoading(false)
      return
    }

    let cancelled = false
    setTodoistLoading(true)
    axios
      .post('/api/todoist/resolve-papers', { paperIds: [selectedPaper.id] })
      .then(({ data }) => {
        if (cancelled) return
        const entry = data && typeof data === 'object' ? data[selectedPaper.id] : null
        setTodoistEntry(entry || { stale: true, todoist: null })
      })
      .catch(() => {
        if (!cancelled) setTodoistEntry({ stale: true, todoist: null })
      })
      .finally(() => {
        if (!cancelled) setTodoistLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedPaper?.id, selectedPaper?.todoist_task_id])

  useEffect(() => {
    const row = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)
    row?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
  }, [selectedIndex])

  const totalLabel = useMemo(() => {
    if (total === 0) return 'No papers'
    if (query.trim()) return `${total} matches`
    return `${total} papers`
  }, [query, total])

  const refreshSelectedTodoist = () => {
    if (!selectedPaper?.id) return
    setTodoistEntry(null)
    setTodoistLoading(false)
    axios
      .post('/api/todoist/resolve-papers', { paperIds: [selectedPaper.id] })
      .then(({ data }) => {
        const entry = data && typeof data === 'object' ? data[selectedPaper.id] : null
        setTodoistEntry(entry || { stale: true, todoist: null })
      })
      .catch(() => {
        setTodoistEntry({ stale: true, todoist: null })
      })
  }

  const updateSelectedPaper = (updater) => {
    if (!selectedPaper) return
    setResults((prev) => prev.map((paper, idx) => (idx === selectedIndex ? updater(paper) : paper)))
  }

  const handleOpenSelected = () => {
    if (!selectedPaper) return
    captureAction('search_open_selected_paper', {
      route: 'search',
      paperId: selectedPaper.id,
      paperTitle: selectedPaper.title,
      index: selectedIndex,
    })
    openPaper?.(selectedPaper)
  }

  const handleCycleStatus = async () => {
    if (!selectedPaper) return
    const nextStatus = cycleStatus(selectedPaper.status || 'queued')
    try {
      const { data } = await axios.patch(`/api/papers/${selectedPaper.id}`, { status: nextStatus })
      updateSelectedPaper(() => ({ ...selectedPaper, ...data }))
      captureAction('paper_status_change', {
        route: 'search',
        paperId: selectedPaper.id,
        fromStatus: selectedPaper.status || 'queued',
        toStatus: nextStatus,
      })
      addToast?.(`Status: ${nextStatus}`, 'success')
    } catch (error) {
      captureAppError(error, { route: 'search', source: 'paper_status_change', paperId: selectedPaper.id })
      addToast?.('Could not update status', 'error')
    }
  }

  const handleOfflineToggle = async () => {
    if (!selectedPaper) return
    const next = !Number(selectedPaper.offline_pinned)
    try {
      const { data } = await axios.post(`/api/papers/${selectedPaper.id}/offline`, { enabled: next })
      updateSelectedPaper(() => ({ ...selectedPaper, ...data }))
      captureAction('paper_offline_toggle', {
        route: 'search',
        paperId: selectedPaper.id,
        enabled: next,
      })
      addToast?.(next ? 'Offline copy ready' : 'Offline copy removed', 'success')
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Offline update failed'
      addToast?.(msg, 'error')
    }
  }

  const handleDeletePaper = async () => {
    if (!selectedPaper || deletingPaperId) return
    const confirmed = window.confirm(`Delete "${selectedPaper.title}" from your library?`)
    if (!confirmed) return
    setDeletingPaperId(selectedPaper.id)
    try {
      await axios.delete(`/api/papers/${selectedPaper.id}`)
      captureAction('paper_delete', {
        route: 'search',
        paperId: selectedPaper.id,
        paperTitle: selectedPaper.title,
      })
      addToast?.('Paper deleted', 'success')
      if (results.length === 1 && currentPage > 1) {
        setCurrentPage((p) => Math.max(1, p - 1))
      } else {
        setResults((prev) => prev.filter((paper) => paper.id !== selectedPaper.id))
        setTotal((prev) => Math.max(0, prev - 1))
        setSelectedIndex((prev) => Math.max(0, Math.min(prev, results.length - 2)))
      }
    } catch (error) {
      captureAppError(error, { route: 'search', source: 'paper_delete', paperId: selectedPaper.id })
      addToast?.('Could not delete paper', 'error')
    } finally {
      setDeletingPaperId(null)
    }
  }

  const handleCopyLink = () => {
    if (!selectedPaper) return
    const url = selectedPaper.url
      || (selectedPaper.id && !selectedPaper.id.startsWith('local')
          ? `https://arxiv.org/abs/${selectedPaper.id}`
          : null)
    if (!url) { addToast?.('No link available', 'error'); return }
    navigator.clipboard.writeText(url)
      .then(() => {
        captureAction('copy_paper_link', { route: 'search', paperId: selectedPaper.id })
        addToast?.('Link copied', 'success')
      })
      .catch((error) => {
        captureAppError(error, { route: 'search', source: 'copy_paper_link', paperId: selectedPaper.id })
        addToast?.('Could not copy', 'error')
      })
  }

  const openMetadataEditor = (paper = selectedPaper) => {
    if (!paper) return
    setMetadataEditPaper(paper)
    setMetadataDraft({
      title: paper.title || '',
      authors: paper.authors || '',
      abstract: paper.abstract || '',
    })
  }

  const handleSaveMetadata = async (event) => {
    event?.preventDefault?.()
    if (!metadataEditPaper?.id || metadataSaving) return
    const payload = {
      title: metadataDraft.title.trim() || metadataEditPaper.title || metadataEditPaper.id,
      authors: metadataDraft.authors.trim(),
      abstract: metadataDraft.abstract.trim(),
    }
    setMetadataSaving(true)
    try {
      const { data } = await axios.patch(`/api/papers/${metadataEditPaper.id}`, payload)
      setResults((prev) => prev.map((paper) => (paper.id === data.id ? { ...paper, ...data } : paper)))
      setMetadataEditPaper(null)
      captureAction('paper_metadata_save', {
        route: 'search',
        paperId: metadataEditPaper.id,
      })
      addToast?.('Paper details saved', 'success')
    } catch (error) {
      captureAppError(error, { route: 'search', source: 'paper_metadata_save', paperId: metadataEditPaper.id })
      addToast?.('Could not save paper details', 'error')
    } finally {
      setMetadataSaving(false)
    }
  }

  const changePage = (nextPage) => {
    const target = Math.max(1, Math.min(nextPage, totalPages))
    if (target === currentPage) return
    captureAction('search_page_change', {
      route: 'search',
      fromPage: currentPage,
      toPage: target,
      totalPages,
    })
    setCurrentPage(target)
    setSelectedIndex(0)
    setFocusPanel('stack')
  }

  // ── scroll active page square into view ──────────────────────────────────────
  useEffect(() => {
    const bar = pageBarRef.current
    if (!bar) return
    bar.querySelector('[data-active="true"]')?.scrollIntoView({ inline: 'center', behavior: 'auto', block: 'nearest' })
  }, [currentPage])

  // ── panel entrance animation on mount ────────────────────────────────────────
  useEffect(() => {
    const animIn = (el, delay) => {
      if (!el) return
      el.style.opacity = '0'
      el.style.transform = 'translateY(10px)'
      el.style.transition = 'none'
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = `opacity .38s ${delay}ms cubic-bezier(.16,1,.3,1), transform .38s ${delay}ms cubic-bezier(.16,1,.3,1)`
        el.style.opacity = '1'
        el.style.transform = 'none'
      }))
    }
    animIn(stackPaneRef.current, 0)
    animIn(dosPaneRef.current, 55)
  }, [])

  // ── dossier cross-fade when selected paper changes ────────────────────────────
  useEffect(() => {
    const id = selectedPaper?.id
    if (!id || !prevPaperIdRef.current) { prevPaperIdRef.current = id; return }
    if (id === prevPaperIdRef.current) return
    prevPaperIdRef.current = id
    const el = dosBodyRef.current
    if (!el) return
    el.style.opacity = '0.3'
    el.style.transform = 'translateY(5px)'
    el.style.transition = 'none'
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'opacity .2s ease, transform .2s cubic-bezier(.16,1,.3,1)'
      el.style.opacity = '1'
      el.style.transform = 'none'
    }))
  }, [selectedPaper?.id])

  useEffect(() => {
    const isTextInputFocused = () => {
      const el = document.activeElement
      const tag = el?.tagName?.toLowerCase()
      return tag === 'input' || tag === 'textarea' || el?.isContentEditable
    }

    const moveSelection = (delta) => {
      if (results.length === 0) return
      setSelectedIndex((prev) => Math.max(0, Math.min(prev + delta, results.length - 1)))
      setFocusPanel('stack')
    }

    const movePanel = (direction) => {
      const panels = actionsOpen ? ['stack', 'dossier', 'actions'] : ['stack', 'dossier']
      const current = panels.indexOf(focusPanel)
      const next = current + direction
      if (next >= 0 && next < panels.length) setFocusPanel(panels[next])
    }

    const onKeyDown = (event) => {
      const inputFocused = isTextInputFocused()

      if (event.key === 'Escape') {
        if (inputFocused && query) {
          event.preventDefault()
          setQuery('')
          return
        }
        if (actionsOpen) {
          event.preventDefault()
          setActionsOpen(false)
          setFocusPanel('dossier')
          return
        }
        if (!inputFocused) {
          event.preventDefault()
          setPage('home')
        }
        return
      }

      if (inputFocused) return

      const key = event.key
      const lower = key.toLowerCase()

      if (key === 'Tab') {
        event.preventDefault()
        setActionsOpen((prev) => !prev)
        setFocusPanel((prev) => {
          if (!actionsOpen) return 'actions'
          return prev === 'actions' ? 'dossier' : prev
        })
        return
      }

      if (lower === '/' || lower === 'i') {
        event.preventDefault()
        inputRef.current?.focus()
        return
      }
      if (lower === 'j' || key === 'ArrowDown') {
        event.preventDefault()
        moveSelection(1)
        return
      }
      if (lower === 'k' || key === 'ArrowUp') {
        event.preventDefault()
        moveSelection(-1)
        return
      }
      if (lower === 'h') {
        event.preventDefault()
        movePanel(-1)
        return
      }
      if (lower === 'l') {
        event.preventDefault()
        movePanel(1)
        return
      }
      if (key === 'ArrowLeft') {
        event.preventDefault()
        changePage(currentPage - 1)
        return
      }
      if (key === 'ArrowRight') {
        event.preventDefault()
        changePage(currentPage + 1)
        return
      }
      if (key === 'Enter' || lower === 'o') {
        event.preventDefault()
        handleOpenSelected()
        return
      }
      if (lower === 's') {
        event.preventDefault()
        handleCycleStatus()
        return
      }
      if (lower === 'c') {
        event.preventDefault()
        handleCopyLink()
        return
      }
      if (lower === 'd') {
        event.preventDefault()
        if (!actionsOpen) setActionsOpen(true)
        if (selectedPaper) setTodoistModalPaper(selectedPaper)
        setFocusPanel('actions')
        return
      }
      if (lower === 'e') {
        event.preventDefault()
        openMetadataEditor()
        return
      }
      if (lower === 'f') {
        event.preventDefault()
        handleOfflineToggle()
        return
      }
      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        handleDeletePaper()
        return
      }
      if (key === '[') {
        event.preventDefault()
        changePage(currentPage - 1)
        return
      }
      if (key === ']') {
        event.preventDefault()
        changePage(currentPage + 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [actionsOpen, currentPage, focusPanel, query, results.length, selectedPaper, setPage, totalPages])

  // ── inline style helpers ──────────────────────────────────────────────────────
  const paneBase = (active) => ({
    background: 'var(--surface)',
    border: `1px solid ${active ? 'color-mix(in srgb, var(--secondary) 28%, transparent)' : 'var(--border)'}`,
    borderRadius: '10px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    transition: 'border-color .18s ease',
  })

  const paneHeader = {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '11px 15px',
    borderBottom: '1px solid var(--border)',
  }

  const hdLabel = {
    fontSize: '.66rem',
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    color: 'var(--muted)',
  }

  const hdHint = {
    fontSize: '.61rem',
    color: 'color-mix(in srgb, var(--muted) 65%, transparent)',
  }

  const kbdBadge = {
    fontFamily: 'var(--font-mono)',
    fontSize: '.66rem',
    color: 'var(--muted)',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 6px',
    userSelect: 'none',
  }

  const todoistLabel = (() => {
    if (!selectedPaper?.todoist_task_id) return null
    if (todoistLoading) return '…'
    if (todoistEntry?.stale) return 'stale link'
    if (!todoistEntry?.todoist) return null
    const t = todoistEntry.todoist
    const pri = formatTodoistPriority(t.priority)
    const due = formatTodoistDue(t.due)
    return [pri, due ? `due ${due}` : null].filter(Boolean).join(' · ')
  })()

  const formatAuthors = (authors) => {
    if (!authors) return null
    const parts = authors.split(',').map(a => a.trim()).filter(Boolean)
    if (parts.length === 0) return null
    if (parts.length <= 2) return parts.join(', ')
    return `${parts[0]}, ${parts[1]} et al.`
  }

  const cardStatusStyle = (status, isActive) => ({
    fontSize: '.58rem',
    textTransform: 'uppercase',
    letterSpacing: '.07em',
    borderRadius: '999px',
    padding: '2px 7px',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontWeight: 600,
    ...(() => {
      const normalized = status || 'queued'
      if (normalized === 'reading') {
        return {
          background: isActive ? 'rgba(34, 197, 94, 0.18)' : 'rgba(34, 197, 94, 0.10)',
          color: '#4ade80',
          border: '1px solid rgba(34, 197, 94, 0.45)',
        }
      }
      if (normalized === 'done') {
        return {
          background: isActive ? 'rgba(239, 68, 68, 0.18)' : 'rgba(239, 68, 68, 0.10)',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.45)',
        }
      }
      return {
        background: isActive ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.06)',
        color: 'rgba(255, 255, 255, 0.88)',
        border: '1px solid rgba(255, 255, 255, 0.34)',
      }
    })(),
  })

  return (
    <div style={{ height:'100vh', display:'flex', flexDirection:'column', padding:'11px', gap:'7px', background:`radial-gradient(ellipse 60% 28% at 50% 0%, color-mix(in srgb, var(--secondary) 4%, transparent), transparent) fixed, var(--background)` }}>

      {/* ── Pagination bar — centered, bigger squares ──────────── */}
      {totalPages > 1 && (
        <div
          ref={pageBarRef}
          style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', gap:'4px', overflowX:'auto', scrollbarWidth:'none', padding:'2px 0' }}
        >
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
            const active = page === currentPage
            return (
              <button
                key={page}
                type="button"
                data-active={active}
                onClick={() => changePage(page)}
                style={{
                  flexShrink: 0,
                  width: '34px', height: '34px',
                  borderRadius: '8px',
                  border: `1px solid ${active ? 'var(--secondary)' : 'var(--border)'}`,
                  background: active
                    ? 'var(--secondary)'
                    : 'color-mix(in srgb, var(--foreground) 5%, transparent)',
                  color: active ? 'var(--button-on-secondary)' : 'var(--muted)',
                  fontSize: '.68rem',
                  fontWeight: active ? 700 : 400,
                  cursor: 'pointer',
                  transition: 'all .12s ease',
                  display: 'grid',
                  placeItems: 'center',
                }}
                className={active ? '' : 'hover:border-secondary/40 hover:text-foreground hover:bg-foreground/[0.07]'}
              >
                {page}
              </button>
            )
          })}
          <span style={{ flexShrink:0, fontSize:'.63rem', color:'color-mix(in srgb, var(--muted) 50%, transparent)', marginLeft:'8px', whiteSpace:'nowrap' }}>
            ← →
          </span>
        </div>
      )}

      {/* ── Board ──────────────────────────────────────────────── */}
      <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns: actionsOpen ? 'minmax(0,.8fr) minmax(0,1.3fr) minmax(0,.58fr)' : 'minmax(0,.8fr) minmax(0,1.3fr)', gap:'8px' }}>

        {/* Stack — search bar lives inside here now */}
        <section ref={stackPaneRef} style={paneBase(focusPanel === 'stack')}>
          {/* Search input as the pane header */}
          <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:'8px', padding:'14px 12px', borderBottom:'1px solid var(--border)' }}>
            <span style={{ background:'var(--secondary)', color:'var(--button-on-secondary)', borderRadius:'5px', padding:'2px 7px', fontFamily:'var(--font-mono)', fontSize:'.7rem', fontWeight:700, whiteSpace:'nowrap', flexShrink:0 }}>/search</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Your library…"
              style={{ flex:1, minWidth:0, background:'transparent', border:0, outline:0, color:'var(--foreground)', fontFamily:'var(--font-mono)', fontSize:'.86rem' }}
            />
            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0, borderLeft:'1px solid var(--border)', paddingLeft:'8px' }}>
              <span style={{ fontSize:'.63rem', color:'var(--muted)', whiteSpace:'nowrap' }}>{totalLabel}</span>
              <span style={{ ...kbdBadge, fontSize:'.61rem' }}>j / k</span>
            </div>
          </div>

          <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:'6px' }}>
            {loading ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ padding:'11px 11px', borderRadius:'8px', border:'1px solid var(--border)' }}>
                    <div className="skeleton-shimmer" style={{ height:'13px', width:'80%', borderRadius:'3px', marginBottom:'8px' }} />
                    <div className="skeleton-shimmer" style={{ height:'8px', width:'45%', borderRadius:'3px' }} />
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', textAlign:'center', color:'var(--muted)', padding:'2rem', fontFamily:'var(--font-mono)', fontSize:'.78rem' }}>
                {query.trim() ? 'No papers match this query.' : 'Your library is empty.'}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {results.map((paper, idx) => {
                  const active = idx === selectedIndex
                  return (
                    <button
                      key={paper.id}
                      type="button"
                      data-index={idx}
                      onClick={() => { setSelectedIndex(idx); setFocusPanel('stack') }}
                      className={active ? 'animate-stagger-fade' : 'hover:bg-foreground/[0.03] hover:border-border animate-stagger-fade'}
                      style={{
                        animationDelay: `${Math.min(idx, 7) * 30}ms`,
                        width:'100%', textAlign:'left', padding:'12px 12px',
                        borderRadius:'8px',
                        border: active
                          ? '1px solid color-mix(in srgb, var(--secondary) 34%, var(--border))'
                          : '1px solid transparent',
                        background: active ? 'color-mix(in srgb, var(--secondary) 18%, var(--surface))' : 'transparent',
                        cursor:'pointer', transition:'background .1s ease, border-color .1s ease',
                      }}
                    >
                      <div style={{ fontSize:'.9rem', fontWeight:600, lineHeight:1.35, letterSpacing:'-.015em', marginBottom:'5px', color: 'var(--foreground)' }}>
                        {paper.title}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
                        <div style={{ fontSize:'.62rem', color: active ? 'color-mix(in srgb, var(--foreground) 72%, transparent)' : 'var(--muted)', letterSpacing:'.01em', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {formatAuthors(paper.authors) || paper.id}
                        </div>
                        <span style={cardStatusStyle(paper.status, active)}>{paper.status || 'queued'}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* Dossier */}
        <section ref={dosPaneRef} style={{ ...paneBase(focusPanel === 'dossier'), position:'relative' }}>
          <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'radial-gradient(ellipse 50% 35% at 100% 0%, color-mix(in srgb, var(--secondary) 5%, transparent), transparent)', zIndex:0 }} />
          <div style={{ ...paneHeader, padding:'9px 13px', position:'relative', zIndex:1 }}>
            <span style={hdLabel}>Paper</span>
            <span style={hdHint}>{actionsOpen ? 'Tab · close actions' : 'Tab · open actions'}</span>
          </div>
          <div ref={dosBodyRef} style={{ flex:1, overflowY:'auto', padding:'16px 18px', display:'flex', flexDirection:'column', gap:'11px', position:'relative', zIndex:1 }}>
            {!selectedPaper ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', textAlign:'center', fontFamily:'var(--font-mono)', fontSize:'.78rem' }}>
                Select a paper from the results.
              </div>
            ) : (
              <>
                <h2 style={{ fontSize:'clamp(1.4rem, 2.1vw, 2rem)', fontWeight:400, lineHeight:1.14, letterSpacing:'-.03em', margin:0, color:'var(--foreground)' }}>
                  {selectedPaper.title}
                </h2>

                {/* chips — bigger and bolder */}
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  {[
                    { t: selectedPaper.status || 'queued', active: selectedPaper.status === 'reading' },
                    selectedPaper.year ? { t: selectedPaper.year } : null,
                    { t: Number(selectedPaper.offline_pinned) === 1 ? 'offline' : 'offline off' },
                    todoistLabel ? { t: todoistLabel } : !selectedPaper.todoist_task_id ? { t: 'not in todoist' } : null,
                  ].filter(Boolean).map((c, i) => (
                    <span key={i} style={{
                      fontSize:'.76rem', fontWeight:600,
                      letterSpacing:'.04em', textTransform:'uppercase',
                      color: c.active ? 'var(--secondary)' : 'var(--muted)',
                      border:`1px solid ${c.active ? 'color-mix(in srgb, var(--secondary) 35%, transparent)' : 'var(--border)'}`,
                      borderRadius:'999px', padding:'4px 11px',
                      background: c.active ? 'color-mix(in srgb, var(--secondary) 9%, transparent)' : 'transparent',
                    }}>
                      {c.t}
                    </span>
                  ))}
                </div>

                {/* authors */}
                {selectedPaper.authors ? (
                  <div style={{ fontSize:'.7rem', color:'var(--muted)', lineHeight:1.5 }}>
                    {selectedPaper.authors}
                  </div>
                ) : null}

                {/* abstract */}
                <p style={{ flex:1, fontSize:'.9rem', lineHeight:1.78, color:'var(--foreground)', opacity:0.82, margin:0, overflowY:'auto', paddingRight:'4px' }}>
                  {selectedPaper.abstract || 'No abstract available.'}
                </p>
              </>
            )}
          </div>
        </section>

        {/* Actions rail */}
        {actionsOpen && (
          <aside className="animate-actions-in" style={paneBase(focusPanel === 'actions')}>
            <div style={{ ...paneHeader, padding:'9px 13px' }}>
              <span style={hdLabel}>Actions</span>
              <span style={hdHint}>Tab · close</span>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'6px', display:'flex', flexDirection:'column', gap:'1px' }}>
              {[
                { name:'Open in Reader', sub:'PDF + notes view', key:'Enter', onClick: handleOpenSelected },
                { name:'Edit Details', sub:'Title, authors, abstract', key:'E', onClick: () => openMetadataEditor() },
                { name:'Copy Link', sub: selectedPaper?.url ? 'arXiv URL' : 'Construct arxiv.org URL', key:'C', onClick: handleCopyLink },
                { name:'Cycle Status', sub: selectedPaper ? `Currently: ${selectedPaper.status || 'queued'}` : 'Queued → Reading → Done', key:'S', onClick: handleCycleStatus },
                { name: paperHasTodoistTask(selectedPaper) ? 'Edit Schedule' : 'Schedule in Todoist', sub:'Todoist due date + priority', key:'D', onClick: () => selectedPaper && setTodoistModalPaper(selectedPaper) },
                { name: Number(selectedPaper?.offline_pinned) === 1 ? 'Remove Offline Copy' : 'Pin for Offline', sub:'Download or remove local PDF', key:'F', onClick: handleOfflineToggle },
                { name:'Delete Paper', sub:'Remove from library', key:'⌫', danger: true, onClick: handleDeletePaper, disabled: deletingPaperId === selectedPaper?.id },
              ].map((act) => (
                <button
                  key={act.name}
                  type="button"
                  onClick={act.onClick}
                  disabled={!selectedPaper || act.disabled}
                  style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'10px', padding:'9px 10px', borderRadius:'7px', border:'1px solid transparent', width:'100%', textAlign:'left', background:'transparent', cursor:'pointer' }}
                  className={act.danger
                    ? 'hover:bg-red-500/[0.07] hover:border-red-500/25 disabled:opacity-40 transition-colors'
                    : 'hover:bg-foreground/[0.05] hover:border-border disabled:opacity-40 transition-colors'
                  }
                >
                  <div>
                    <div style={{ fontSize:'.83rem', fontWeight:500, color: act.danger ? 'color-mix(in srgb, #e05252 90%, transparent)' : 'var(--foreground)' }}>{act.disabled ? 'Deleting…' : act.name}</div>
                    {act.sub && <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:'2px' }}>{act.sub}</div>}
                  </div>
                  <span style={{ fontFamily:'var(--font-mono)', fontSize:'.67rem', color:'var(--muted)', whiteSpace:'nowrap', flexShrink:0, border:'1px solid var(--border)', borderRadius:'4px', padding:'2px 6px' }}>{act.key}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {todoistModalPaper && (
        <TodoistTaskModal
          paper={todoistModalPaper}
          getStatusColor={getStatusColor}
          addToast={addToast}
          onCreated={(taskId) => {
            setResults((prev) => prev.map((paper) => (
              paper.id === todoistModalPaper.id ? { ...paper, todoist_task_id: taskId } : paper
            )))
            refreshSelectedTodoist()
          }}
          onUpdated={refreshSelectedTodoist}
          onClose={() => setTodoistModalPaper(null)}
        />
      )}
      {metadataEditPaper && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 px-4"
          onClick={() => !metadataSaving && setMetadataEditPaper(null)}
        >
          <form
            onSubmit={handleSaveMetadata}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-lg border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted">Edit Paper Details</div>
              <button
                type="button"
                onClick={() => setMetadataEditPaper(null)}
                disabled={metadataSaving}
                className="text-sm text-muted hover:text-foreground disabled:opacity-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 p-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">Title</span>
                <input
                  value={metadataDraft.title}
                  onChange={(e) => setMetadataDraft((prev) => ({ ...prev, title: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-secondary"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">Authors</span>
                <input
                  value={metadataDraft.authors}
                  onChange={(e) => setMetadataDraft((prev) => ({ ...prev, authors: e.target.value }))}
                  placeholder="Comma-separated names"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-secondary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">Abstract</span>
                <textarea
                  value={metadataDraft.abstract}
                  onChange={(e) => setMetadataDraft((prev) => ({ ...prev, abstract: e.target.value }))}
                  rows={9}
                  className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus:border-secondary"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                onClick={() => setMetadataEditPaper(null)}
                disabled={metadataSaving}
                className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={metadataSaving}
                className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-button-on-secondary disabled:opacity-50"
              >
                {metadataSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
