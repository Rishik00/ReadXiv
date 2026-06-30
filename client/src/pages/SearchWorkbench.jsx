// Review: again, lets separate local and lib imports. 
// Question: tell me, why not do typescript for this to encode static types. 
// Question: what does this page do? Why is it called SearchWorkBench? 
import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import TodoistTaskModal, { paperHasTodoistTask } from '../components/TodoistTaskModal'
import { captureAction, captureAppError, captureTiming, elapsedSince, startTimer } from '../lib/instrumentation'

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

// Review: this is a rule of thumb, if a function is not being used more than 3-4 times commonly across the file or many files I wouldn't be putting in a utility function 
// But, at the same time if the function is being used for a purpose then it should be specified in a comment/docstring. 
function isPlaceholderTitle(title, id) {
  // Question: why do this? why not just do typescript? 
  const value = String(title || '').trim()
  if (!value) return true
  return /^arxiv:/i.test(value) || value === id
}

function needsMetadataFetch(paper) {
  if (!paper?.id || String(paper.id).startsWith('local-')) return false
  return isPlaceholderTitle(paper.title, paper.id) || !String(paper.abstract || '').trim()
}

function formatDateAdded(value) {
  if (!value) return 'Unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

// Question: what is default? 
export default function SearchWorkbench({
  initialQuery = '',
  focusNonce,
  setPage,
  openPaper,
  addToast,
}) {
  // Question: Why do we have these many UseState calls? why are we going to track the state of all of these things? 
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
  const [fetchingMetadataId, setFetchingMetadataId] = useState(null)
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
  const selectedNeedsMetadata = needsMetadataFetch(selectedPaper)
  const selectedMetadataFetching = fetchingMetadataId === selectedPaper?.id
  const selectedScheduleState = (() => {
    if (!selectedPaper?.todoist_task_id) return 'Unscheduled'
    if (todoistLoading) return 'Checking'
    if (todoistEntry?.stale) return 'Stale'
    if (todoistEntry?.todoist) return 'Scheduled'
    return 'Linked'
  })()
  const selectedDetails = selectedPaper ? [
    { label: 'Status', value: selectedPaper.status || 'queued', status: selectedPaper.status || 'queued' },
    { label: 'State', value: Number(selectedPaper.offline_pinned) === 1 ? 'Offline' : 'Online' },
    { label: 'ID', value: selectedPaper.id || 'Unknown' },
    { label: 'Year', value: selectedPaper.year || 'Unknown' },
    { label: 'Date added', value: formatDateAdded(selectedPaper.created_at) },
    { label: 'Schedule', value: selectedScheduleState },
    { label: 'Authors', value: selectedPaper.authors || 'Unknown', multiline: true },
  ] : []

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

  // Question: not feeling comfortable with these many arrow functions, any reason why we'd prefer doing this? 
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

  const handleFetchMetadata = async (paper = selectedPaper) => {
    if (!paper?.id || fetchingMetadataId) return
    setFetchingMetadataId(paper.id)
    try {
      const { data } = await axios.post(`/api/papers/${encodeURIComponent(paper.id)}/fetch-metadata`)
      setResults((prev) => prev.map((item) => (item.id === data.id ? { ...item, ...data } : item)))
      captureAction('paper_metadata_fetch', {
        route: 'search',
        paperId: paper.id,
      })
      addToast?.('Paper details filled', 'success')
    } catch (error) {
      captureAppError(error, { route: 'search', source: 'paper_metadata_fetch', paperId: paper.id })
      addToast?.('Fetch failed', 'error')
    } finally {
      setFetchingMetadataId(null)
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
      if (lower === 'm') {
        event.preventDefault()
        if (selectedNeedsMetadata) handleFetchMetadata(selectedPaper)
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
  }, [actionsOpen, currentPage, fetchingMetadataId, focusPanel, query, results.length, selectedNeedsMetadata, selectedPaper, setPage, totalPages])

  // ── inline style helpers ──────────────────────────────────────────────────────
  const paneBase = (active) => ({
    background: 'color-mix(in srgb, var(--surface) 94%, var(--background))',
    border: `1px solid ${active ? 'color-mix(in srgb, var(--secondary) 32%, var(--border))' : 'var(--border)'}`,
    borderRadius: '8px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    transition: 'border-color .18s ease',
  })

  return (
    <div className="rx-workbench" style={{ height:'100vh', display:'flex', flexDirection:'column', padding:'11px', gap:'7px' }}>

      {/* ── Pagination bar — centered, bigger squares ──────────── */}
      {/* ── Board ──────────────────────────────────────────────── */}
      <div style={{ flex:1, minHeight:0, display:'grid', gridTemplateColumns: actionsOpen ? 'minmax(0,.8fr) minmax(0,1.3fr) minmax(0,.58fr)' : 'minmax(0,.8fr) minmax(0,1.3fr)', gap:'8px' }}>

        {/* Stack - library search lives inside here now */}
        <section ref={stackPaneRef} style={paneBase(focusPanel === 'stack')}>
          {/* Search input as the pane header */}
          <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:'8px', padding:'14px 12px', borderBottom:'1px solid var(--border)' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Your Library..."
              style={{ flex:1, minWidth:0, background:'transparent', border:0, outline:0, color:'var(--foreground)', fontFamily:'var(--font-sans)', fontSize:'.92rem', fontWeight:500 }}
            />
            <div style={{ display:'flex', alignItems:'center', gap:'6px', flexShrink:0, borderLeft:'1px solid var(--border)', paddingLeft:'8px' }}>
              <span style={{ fontSize:'.63rem', color:'var(--muted)', whiteSpace:'nowrap' }}>{totalLabel}</span>
            </div>
          </div>

          <div ref={listRef} style={{ flex:1, overflowY:'auto', padding:'6px' }}>
            {loading ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="rx-list-skeleton-row">
                    <div className="skeleton-shimmer" style={{ height:'13px', width:'80%', borderRadius:'3px', marginBottom:'8px' }} />
                    <div className="skeleton-shimmer" style={{ height:'8px', width:'45%', borderRadius:'3px', marginBottom:'8px' }} />
                    <div className="skeleton-shimmer" style={{ height:'8px', width:'62%', borderRadius:'3px' }} />
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="rx-empty-state">
                <div className="rx-empty-state-inner">
                  <div className="rx-empty-state-title">
                    {query.trim() ? 'No matching papers' : 'Your library is empty'}
                  </div>
                  <div className="rx-empty-state-copy">
                    {query.trim()
                      ? 'Try a title word, author name, arXiv ID, or clear the query to return to the full library.'
                      : 'Add an arXiv URL or upload a PDF from Home. New papers will appear here.'}
                  </div>
                </div>
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
                      className="rx-paper-row animate-stagger-fade"
                      data-active={active}
                      style={{
                        animationDelay: `${Math.min(idx, 7) * 30}ms`,
                      }}
                    >
                      <div className="rx-paper-title" style={{ marginBottom:'6px' }}>
                        {paper.title}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px' }}>
                        <span className="rx-paper-row-meta rx-meta">{paper.id}</span>
                        <span className="rx-status-mark" data-status={paper.status || 'queued'}>
                          <span className="rx-status-dot" />
                          <span>{paper.status || 'queued'}</span>
                        </span>
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
          <div style={{ position:'absolute', inset:0, pointerEvents:'none', background:'linear-gradient(180deg, color-mix(in srgb, var(--foreground) 1.5%, transparent), transparent 42%)', zIndex:0 }} />
          <div ref={dosBodyRef} style={{ flex:1, overflowY:'auto', padding:'28px 22px 16px', display:'flex', flexDirection:'column', gap:'11px', position:'relative', zIndex:1 }}>
            {!selectedPaper ? (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', textAlign:'center', fontFamily:'var(--font-mono)', fontSize:'.78rem' }}>
                Select a paper from the results.
              </div>
            ) : (
              <>
                <h2 style={{ fontSize:'clamp(1.25rem, 1.7vw, 1.72rem)', fontWeight:500, lineHeight:1.18, letterSpacing:'0', margin:0, color:'var(--foreground)', maxWidth:'56rem' }}>
                  {selectedPaper.title || selectedPaper.id}
                </h2>

                {selectedNeedsMetadata ? (
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleFetchMetadata(selectedPaper)}
                      disabled={selectedMetadataFetching}
                      className="hover:bg-foreground/[0.05] hover:border-border disabled:opacity-50 transition-colors"
                      style={{
                        border:'1px solid var(--border)',
                        borderRadius:'7px',
                        background:'transparent',
                        color:'var(--foreground)',
                        fontSize:'.76rem',
                        fontWeight:600,
                        padding:'6px 10px',
                        cursor:'pointer',
                      }}
                    >
                      {selectedMetadataFetching ? 'Fetching...' : 'Metadata Missing'}
                    </button>
                  </div>
                ) : null}

                {/* chips — bigger and bolder */}
                {/* authors */}
                {/* abstract */}
                <div style={{ fontSize:'.72rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'color-mix(in srgb, var(--muted) 90%, var(--foreground))' }}>
                  Abstract
                </div>
                <p style={{ flex:1, fontSize:'.9rem', lineHeight:1.72, color:'color-mix(in srgb, var(--foreground) 86%, transparent)', margin:0, overflowY:'auto', paddingRight:'4px' }}>
                  {selectedPaper.abstract || 'No abstract available.'}
                </p>
              </>
            )}
          </div>
        </section>

        {/* Actions rail */}
        {actionsOpen && (
          <aside className="animate-actions-in" style={paneBase(focusPanel === 'actions')}>
            <div style={{ flexShrink:0, padding:'14px 20px 8px', color:'color-mix(in srgb, var(--muted) 90%, var(--foreground))', fontSize:'.72rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase' }}>
              Toolbar
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'6px', display:'flex', flexDirection:'column', gap:'1px' }}>
              {[
                { name:'Open in Reader', sub:null, key:'Enter', onClick: handleOpenSelected },
                selectedNeedsMetadata ? {
                  name: selectedMetadataFetching ? 'Fetching Metadata...' : 'Fetch Metadata',
                  sub:null,
                  key:'M',
                  onClick: () => handleFetchMetadata(selectedPaper),
                  disabled: selectedMetadataFetching,
                } : null,
                { name:'Copy Link', sub:null, key:'C', onClick: handleCopyLink },
                { name:'Cycle Status', sub:null, key:'S', onClick: handleCycleStatus },
                { name: paperHasTodoistTask(selectedPaper) ? 'Edit Schedule' : 'Schedule', sub:null, key:'D', onClick: () => selectedPaper && setTodoistModalPaper(selectedPaper) },
                { name: Number(selectedPaper?.offline_pinned) === 1 ? 'Remove Offline Copy' : 'Pin Offline', sub:null, key:'F', onClick: handleOfflineToggle },
                { name:'Delete Paper', sub:null, key:'Del', danger: true, onClick: handleDeletePaper, disabled: deletingPaperId === selectedPaper?.id, busyLabel:'Deleting...' },
              ].filter(Boolean).map((act) => (
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
                    <div style={{ fontSize:'.83rem', fontWeight:500, color: act.danger ? 'color-mix(in srgb, #e05252 90%, transparent)' : 'var(--foreground)' }}>{act.busyLabel && act.disabled ? act.busyLabel : act.name}</div>
                    {act.sub && <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:'2px' }}>{act.sub}</div>}
                  </div>
                  {act.key ? (
                    <span style={{ fontFamily:'var(--font-mono)', fontSize:'.67rem', color:'var(--muted)', whiteSpace:'nowrap', flexShrink:0, border:'1px solid var(--border)', borderRadius:'4px', padding:'2px 6px' }}>{act.key}</span>
                  ) : null}
                </button>
              ))}
              <div style={{ margin:'12px 10px 4px', borderTop:'1px solid var(--border)', paddingTop:'12px' }}>
                <div style={{ color:'color-mix(in srgb, var(--muted) 90%, var(--foreground))', fontSize:'.68rem', fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:'8px' }}>
                  Details
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {selectedDetails.map((item) => (
                    <div key={item.label} style={{ display:'grid', gridTemplateColumns:'76px minmax(0,1fr)', gap:'10px', alignItems:'baseline' }}>
                      <div style={{ color:'var(--muted)', fontSize:'.68rem', fontFamily:'var(--font-mono)' }}>
                        {item.label}
                      </div>
                      <div style={{
                        color:'color-mix(in srgb, var(--foreground) 88%, transparent)',
                        fontSize:'.76rem',
                        minWidth:0,
                        overflow:'hidden',
                        textOverflow: item.multiline ? 'clip' : 'ellipsis',
                        whiteSpace: item.multiline ? 'normal' : 'nowrap',
                        lineHeight: item.multiline ? 1.45 : undefined,
                      }}>
                        {item.status ? (
                          <span className="rx-status-mark" data-status={item.status} style={{ fontSize:'.68rem' }}>
                            <span className="rx-status-dot" />
                            <span>{item.value}</span>
                          </span>
                        ) : item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

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
        </div>
      )}

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
