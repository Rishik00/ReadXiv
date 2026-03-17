import { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

const COMMAND_PREFIXES = ['>', ':', '/']
const APP_COMMANDS = [
  { id: 'home', label: 'Go to Search', shortcut: 'Space h', keywords: ['home', 'search', 'h'] },
  { id: 'shelf', label: 'Go to Paper Shelf', shortcut: 'Space s', keywords: ['shelf', 'papers', 'library', 's'] },
  { id: 'settings', label: 'Go to Settings', shortcut: 'Space c', keywords: ['settings', 'config', 'preferences', 'c'] },
  { id: 'help', label: 'Help (keyboard shortcuts)', shortcut: 'Space e', keywords: ['help', 'shortcuts', 'keys', 'e'] },
]

function filterCommands(query) {
  const q = query.toLowerCase().trim()
  if (!q) return APP_COMMANDS
  return APP_COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.keywords.some((k) => k.startsWith(q) || q.startsWith(k))
  )
}

export default function GlobalSearchPalette({
  open,
  onClose,
  onSelectPaper,
  onCommand,
  currentPage,
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const hasQuery = query.trim().length > 0
  const isCommandMode = COMMAND_PREFIXES.some((p) => query.startsWith(p))
  const commandQuery = isCommandMode ? query.slice(1).trim() : ''
  const commandResults = useMemo(() => filterCommands(commandQuery), [commandQuery])

  const isSearchMode = !isCommandMode
  const displayItems = isCommandMode ? commandResults : results
  const hasItems = displayItems.length > 0

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const timer = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!isSearchMode) return

    if (!query.trim()) {
      setLoading(true)
      axios
        .get('/api/papers/recents', { params: { limit: 10 } })
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
    }, 120)

    return () => clearTimeout(timer)
  }, [open, query, isSearchMode])

  useEffect(() => {
    setActiveIndex(0)
  }, [isCommandMode])

  useEffect(() => {
    if (!open) return
    const maxIdx = displayItems.length - 1
    setActiveIndex((idx) => (maxIdx < 0 ? 0 : Math.min(maxIdx, idx)))
  }, [displayItems.length, open])

  const moveSelection = (delta) => {
    if (displayItems.length === 0) return
    setActiveIndex((idx) => {
      const next = idx + delta
      return Math.max(0, Math.min(displayItems.length - 1, next))
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
      if ((event.key === 'ArrowDown' || event.key === 'j') && displayItems.length > 0) {
        event.preventDefault()
        moveSelection(1)
        return
      }
      if ((event.key === 'ArrowUp' || event.key === 'k') && displayItems.length > 0) {
        event.preventDefault()
        moveSelection(-1)
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        if (!hasItems) return
        if (isCommandMode) {
          const c = commandResults[activeIndex]
          if (c && onCommand) {
            onCommand(c)
            onClose?.()
          }
        } else {
          const paper = results[activeIndex]
          if (paper && onSelectPaper) {
            onSelectPaper(paper)
            onClose?.()
          }
        }
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        if (hasQuery && !isCommandMode) {
          setQuery((q) => (COMMAND_PREFIXES.includes(q[0]) ? q : '>' + q))
        } else if (isCommandMode && commandQuery) {
          setQuery(commandQuery)
        }
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, onSelectPaper, onCommand, activeIndex, commandResults, results, hasItems, isCommandMode, commandQuery, hasQuery, displayItems.length])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${activeIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeIndex, open])

  if (!open) return null

  const placeholder = isCommandMode
    ? 'Search commands... (e.g. shelf, settings)'
    : 'Search papers by title, author, abstract... (type > for commands)'

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
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input
            ref={inputRef}
            autoComplete="off"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          <span className="text-[10px] text-muted/70 shrink-0">Esc</span>
        </div>

        <div ref={listRef} className="max-h-[480px] overflow-auto py-2">
          {isCommandMode ? (
            <>
              {commandResults.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted">
                  No matches. Try: home, shelf, settings
                </div>
              ) : (
                commandResults.map((cmd, idx) => (
                  <button
                    key={cmd.id}
                    type="button"
                    data-index={idx}
                    onClick={() => {
                      onCommand?.(cmd)
                      onClose?.()
                    }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                      idx === activeIndex
                        ? 'bg-secondary/15 text-secondary'
                        : 'text-foreground hover:bg-foreground/5'
                    }`}
                  >
                    <span>{cmd.label}</span>
                    <kbd className="text-[10px] text-muted font-mono">{cmd.shortcut}</kbd>
                  </button>
                ))
              )}
            </>
          ) : (
            <>
              {loading && (
                <div className="px-4 py-4 flex items-center gap-3 animate-fade-in">
                  <div className="h-2 w-24 rounded skeleton-shimmer" />
                  <span className="text-xs text-muted">Searching…</span>
                </div>
              )}
              {!loading && results.length === 0 && (
                <div className="px-4 py-8 text-center text-xs text-muted">
                  {hasQuery ? 'No papers found' : 'No recent papers. Type to search.'}
                </div>
              )}
              {!loading &&
                results.map((paper, idx) => (
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
                    <span className="text-sm font-medium line-clamp-1">{paper.title}</span>
                    <span className="text-[11px] text-muted truncate">
                      {[paper.year, paper.authors].filter(Boolean).join(' · ') || paper.id}
                    </span>
                  </button>
                ))}
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-background/50 text-[10px] text-muted">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono">↑</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">↓</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">j</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">k</kbd>
            <span className="ml-2">navigate</span>
            <span className="mx-2">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono">Space h</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">Space s</kbd>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono ml-1">Space c</kbd>
            <span className="ml-1">switch</span>
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono">Enter</kbd>
            <span className="ml-1">open</span>
            <span className="mx-2">·</span>
            <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 font-mono">Tab</kbd>
            <span className="ml-1">commands</span>
          </span>
        </div>
      </div>
    </div>
  )
}
