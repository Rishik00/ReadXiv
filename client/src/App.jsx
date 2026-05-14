import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import GlobalSearchPalette from './components/GlobalSearchPalette'
import RecentPapersFinder from './components/RecentPapersFinder'
import GlobalCanvas from './components/GlobalCanvas'
import Home from './pages/Home'
import Settings from './pages/Settings'
import Help from './pages/Help'
const Reader = lazy(() => import('./pages/Reader'))
const SearchWorkbench = lazy(() => import('./pages/SearchWorkbench'))

// Settings button: kept in code but not in use. User will specify placement later.
// See Settings page and setPage('settings') - accessible via Ctrl+P > "settings" for now.

function parsePaperDeepLink(pathname) {
  const m = pathname.match(/^\/p\/([^/]+)\/?$/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function readerPathForPaperId(id) {
  return `/p/${encodeURIComponent(id)}`
}

function isSearchPath(pathname) {
  return pathname === '/search' || pathname === '/search/'
}

function getTabTitle(url) {
  try {
    const u = new URL(url)
    if (u.hostname.includes('arxiv.org')) return 'arXiv'
    return u.hostname.replace(/^www\./, '')
  } catch {
    return 'External'
  }
}

function App() {
  const [page, setPage] = useState('home')
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [homeFocusNonce, setHomeFocusNonce] = useState(0)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)
  const [readerInitialTab, setReaderInitialTab] = useState('edit')
  const [toasts, setToasts] = useState([])
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [pendingG, setPendingG] = useState(false)
  const [pendingB, setPendingB] = useState(false)
  const [pendingK, setPendingK] = useState(false)
  const [pendingF, setPendingF] = useState(false)
  const readerRef = useRef(null)
  /** Mirror chord flags so the next key is recognized before React re-renders (fixes Space then o). */
  const pendingGRef = useRef(false)
  const pendingBRef = useRef(false)
  const pendingKRef = useRef(false)
  const pendingFRef = useRef(false)

  useEffect(() => {
    if (!pendingG && !pendingB && !pendingK && !pendingF) return
    const t = setTimeout(() => {
      pendingGRef.current = false
      pendingBRef.current = false
      pendingKRef.current = false
      pendingFRef.current = false
      setPendingG(false)
      setPendingB(false)
      setPendingK(false)
      if (pendingF) {
        setPendingF(false)
        setRecentsOpen(true)
      }
    }, pendingF ? 400 : 2000)
    return () => clearTimeout(t)
  }, [pendingG, pendingB, pendingK, pendingF])
  const [externalTabs, setExternalTabs] = useState([])
  const [activeExternalTabId, setActiveExternalTabId] = useState(null)
  const DEFAULT_THEME = 'mist'
  const DEFAULT_PDF_ZOOM = 'actual'
  const DEFAULT_READER_VIEW = 'split'
  const VALID_THEMES = ['monochrome', 'blue', 'noir', 'olive', 'mist', 'plum', 'periwinkle', 'lichen', 'cinder']
  const VALID_PDF_ZOOMS = ['actual', 'page-width', 'page-fit', 'auto']
  const VALID_READER_VIEWS = ['split', 'pdf', 'notes']
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('papyrus-settings')
    if (!raw)
      return {
        continuousScroll: true,
        theme: DEFAULT_THEME,
        fontFamily: 'brutalist',
        homeLayout: 'list',
        defaultPdfZoom: DEFAULT_PDF_ZOOM,
        defaultReaderView: DEFAULT_READER_VIEW,
      }
    try {
      const parsed = JSON.parse(raw)
      let rawTheme =
        parsed.theme === 'default' || parsed.theme === 'aurora'
          ? DEFAULT_THEME
          : parsed.theme === 'experimental'
            ? 'periwinkle'
            : parsed.theme
      const theme = VALID_THEMES.includes(rawTheme) ? rawTheme : DEFAULT_THEME
      const currentSettings = { ...parsed }
      const defaultPdfZoom = VALID_PDF_ZOOMS.includes(currentSettings.defaultPdfZoom)
        ? currentSettings.defaultPdfZoom
        : DEFAULT_PDF_ZOOM
      const defaultReaderView = VALID_READER_VIEWS.includes(currentSettings.defaultReaderView)
        ? currentSettings.defaultReaderView
        : DEFAULT_READER_VIEW
      delete currentSettings['live' + 'MarkdownPreview']
      return {
        continuousScroll: true,
        fontFamily: 'brutalist',
        ...currentSettings,
        theme,
        defaultPdfZoom,
        defaultReaderView,
      }
    } catch {
      return {
        continuousScroll: true,
        theme: DEFAULT_THEME,
        fontFamily: 'brutalist',
        homeLayout: 'list',
        defaultPdfZoom: DEFAULT_PDF_ZOOM,
        defaultReaderView: DEFAULT_READER_VIEW,
      }
    }
  })
  const supportsViewTransitions =
    typeof document !== 'undefined' && typeof document.startViewTransition === 'function'

  const runWithViewTransition = useCallback((update) => {
    const startViewTransition = document.startViewTransition?.bind(document)
    if (!startViewTransition) {
      update()
      return Promise.resolve()
    }

    try {
      const transition = startViewTransition(() => {
        update()
      })
      return transition.finished.catch(() => {})
    } catch {
      update()
      return Promise.resolve()
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('papyrus-settings', JSON.stringify(settings))
    // Apply theme variables to document element
    document.documentElement.setAttribute('data-theme', settings.theme || DEFAULT_THEME)
    document.documentElement.setAttribute('data-font', settings.fontFamily || 'brutalist')
  }, [settings])

  useEffect(() => {
    if (!window.electron?.onOpenExternalTab) return
    const unsubscribe = window.electron.onOpenExternalTab((url) => {
      const id = crypto.randomUUID()
      setExternalTabs((prev) => [...prev, { id, url, title: getTabTitle(url) }])
      setActiveExternalTabId(id)
    })
    return () => unsubscribe?.()
  }, [])

  const closeExternalTab = (id) => {
    setExternalTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveExternalTabId((current) => (current === id ? null : current))
  }

  const navigateTo = useCallback(
    (target) => {
      runWithViewTransition(() => {
        if (target === 'home') {
          setPage('home')
          setHomeFocusNonce((n) => n + 1)
        } else if (target === 'search') {
          setPage('search')
          setSearchFocusNonce((n) => n + 1)
        } else if (target === 'settings') {
          setPage('settings')
        } else if (target === 'help') {
          setPage('help')
        }
      })
    },
    [runWithViewTransition]
  )

  const openSearch = useCallback(
    (query = '') => {
      runWithViewTransition(() => {
        setSearchQuery(query)
        setPage('search')
        setSearchFocusNonce((n) => n + 1)
      })
    },
    [runWithViewTransition]
  )

  const openPaper = useCallback(
    (paper, { initialTab = 'edit' } = {}) => {
      if (!paper) return
      runWithViewTransition(() => {
        setSelectedPaper(paper)
        setReaderInitialTab(initialTab)
        setPage('reader')
      })
    },
    [runWithViewTransition]
  )

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isInputFocused = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

      if (event.key === 'Escape') {
        pendingGRef.current = false
        pendingBRef.current = false
        pendingKRef.current = false
        pendingFRef.current = false
        setPendingG(false)
        setPendingB(false)
        setPendingK(false)
        setPendingF(false)
        return
      }

      if (pendingKRef.current) {
        const k = event.key.toLowerCase()
        if (k === 'a') {
          event.preventDefault()
          setCanvasOpen(true)
          pendingKRef.current = false
          setPendingK(false)
        } else {
          pendingKRef.current = false
          setPendingK(false)
        }
        return
      }

      if (pendingBRef.current) {
        const k = event.key.toLowerCase()
        if (k === 'h') {
          event.preventDefault()
          readerRef.current?.togglePdfDarkMode?.()
          pendingBRef.current = false
          setPendingB(false)
        } else {
          pendingBRef.current = false
          setPendingB(false)
        }
        return
      }

      if (pendingGRef.current) {
        const k = event.key.toLowerCase()
        if (k === 'h') {
          event.preventDefault()
          navigateTo('home')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 's') {
          event.preventDefault()
          navigateTo('search')
          pendingGRef.current = false
          setPendingG(false)
        } else if (page === 'reader' && k === 'q') {
          event.preventDefault()
          readerRef.current?.setReaderView?.('pdf')
          pendingGRef.current = false
          setPendingG(false)
        } else if (page === 'reader' && k === 'w') {
          event.preventDefault()
          readerRef.current?.setReaderView?.('split')
          pendingGRef.current = false
          setPendingG(false)
        } else if (page === 'reader' && k === 'e') {
          event.preventDefault()
          readerRef.current?.setReaderView?.('notes')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'c') {
          event.preventDefault()
          navigateTo('settings')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'f') {
          event.preventDefault()
          pendingGRef.current = false
          pendingFRef.current = true
          setPendingG(false)
          setPendingF(true)
        } else if (k === 'e') {
          event.preventDefault()
          setPage('help')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'b' && page === 'reader') {
          event.preventDefault()
          pendingGRef.current = false
          pendingBRef.current = true
          setPendingG(false)
          setPendingB(true)
        } else if (k === 'k') {
          event.preventDefault()
          pendingGRef.current = false
          pendingKRef.current = true
          setPendingG(false)
          setPendingK(true)
        } else if (k === 'm' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.maximizePdf?.()
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'n' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.minimizePdf?.()
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'o' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.toggleReaderToolbarExpanded?.()
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 't' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.openPdfPageJumpMenu?.()
          pendingGRef.current = false
          setPendingG(false)
        } else {
          pendingGRef.current = false
          setPendingG(false)
        }
        return
      }

      if (pendingFRef.current) {
        const k = event.key.toLowerCase()
        if (k === 'b') {
          event.preventDefault()
          pendingFRef.current = false
          setPendingF(false)
          navigateTo('search')
        } else {
          pendingFRef.current = false
          setPendingF(false)
          setRecentsOpen(true)
        }
        return
      }

      if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && !isInputFocused) {
        event.preventDefault()
        pendingGRef.current = true
        setPendingG(true)
        return
      }

      if ((event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k') || (event.ctrlKey && event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        navigateTo('search')
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setQuickSearchOpen(true)
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigateTo, page])

  const addToast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }, [])

  const openPaperById = useCallback(
    async (id) => {
      try {
        const { data } = await axios.get(`/api/papers/${encodeURIComponent(id)}`)
        openPaper(data)
        return true
      } catch (e) {
        addToast(e.response?.status === 404 ? 'Paper not found' : 'Could not open paper', 'error')
        window.history.replaceState(null, '', '/')
        setPage('home')
        setSelectedPaper(null)
        return false
      }
    },
    [addToast, openPaper]
  )

  useEffect(() => {
    const fromPath = parsePaperDeepLink(window.location.pathname)
    if (fromPath) {
      openPaperById(fromPath)
      return
    }
    if (isSearchPath(window.location.pathname)) {
      setPage('search')
      setSearchFocusNonce((n) => n + 1)
    }
  }, [openPaperById])

  useEffect(() => {
    const onPop = () => {
      const id = parsePaperDeepLink(window.location.pathname)
      if (id) openPaperById(id)
      else if (isSearchPath(window.location.pathname)) {
        runWithViewTransition(() => {
          setPage('search')
          setSelectedPaper(null)
          setSearchFocusNonce((n) => n + 1)
        })
      } else {
        runWithViewTransition(() => {
          setPage('home')
          setSelectedPaper(null)
        })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [openPaperById, runWithViewTransition])

  useEffect(() => {
    if (page === 'reader' && selectedPaper?.id) {
      const target = readerPathForPaperId(selectedPaper.id)
      if (window.location.pathname !== target) {
        const swapWithinReader = window.location.pathname.startsWith('/p/')
        if (swapWithinReader) {
          window.history.replaceState({ readxiv: 'reader', id: selectedPaper.id }, '', target)
        } else {
          window.history.pushState({ readxiv: 'reader', id: selectedPaper.id }, '', target)
        }
      }
    } else if (page === 'search') {
      if (!isSearchPath(window.location.pathname)) {
        window.history.pushState({ readxiv: 'search' }, '', '/search')
      }
    } else if (page !== 'reader' && window.location.pathname.startsWith('/p/')) {
      window.history.replaceState(null, '', '/')
    } else if (page !== 'search' && isSearchPath(window.location.pathname)) {
      window.history.replaceState(null, '', '/')
    }
  }, [page, selectedPaper?.id])

  const chordHint = pendingB
    ? 'h toggle PDF dark mode'
    : pendingK
      ? 'a open canvas'
      : pendingF
        ? 'b browse library | any other key recent papers'
        : pendingG
          ? page === 'reader'
            ? 'h home | s search | c settings | e help | q/w/e views | b dark mode | k canvas'
            : 'h home | s search | c settings | e help | f recent papers'
          : null

  return (
    <div className="flex min-h-screen text-foreground font-sans">
      <div className="fixed bottom-5 right-5 z-50 flex w-[min(92vw,20rem)] flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl shadow-2xl animate-toast-in overflow-hidden"
            style={{ background: 'var(--foreground)', color: 'var(--background)' }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3">
              <span className="text-sm shrink-0" style={{ opacity: 0.5 }}>
                {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : '·'}
              </span>
              <span className="text-sm font-medium leading-snug">{toast.message}</span>
            </div>
            <div
              className="h-[2px] w-full animate-toast-progress origin-left"
              style={{ background: 'var(--background)', opacity: 0.15 }}
            />
          </div>
        ))}
      </div>
      {chordHint && (
        <div className="pointer-events-none fixed bottom-5 left-5 z-50">
          <div
            className="rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-foreground/80 shadow-2xl"
            style={{
              borderColor: 'color-mix(in srgb, var(--secondary) 24%, var(--border))',
              background: 'color-mix(in srgb, var(--surface) 74%, transparent)',
              backdropFilter: 'blur(20px)',
            }}
          >
            Space -&gt; {chordHint}
          </div>
        </div>
      )}

      <main className={`app-main flex-1 overflow-auto relative flex flex-col min-w-0 ${page === 'reader' ? 'group' : ''}`}>
        {externalTabs.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-border bg-surface/80">
            <button
              type="button"
              onClick={() => setActiveExternalTabId(null)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeExternalTabId === null ? 'bg-border text-foreground' : 'text-muted hover:text-foreground hover:bg-foreground/5'
              }`}
            >
              ReadXiv
            </button>
            {externalTabs.map((tab) => (
              <div key={tab.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveExternalTabId(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeExternalTabId === tab.id ? 'bg-border text-foreground' : 'text-muted hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  {tab.title}
                </button>
                <button
                  type="button"
                  onClick={() => closeExternalTab(tab.id)}
                  className="p-1 rounded text-muted hover:text-foreground hover:bg-foreground/10"
                  aria-label="Close tab"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className={`flex-1 overflow-auto ${activeExternalTabId ? 'hidden' : ''}`}>
          <div key={supportsViewTransitions ? 'app-page-shell' : page} className={`relative z-10 ${
            page === 'reader' || page === 'search' ? '' : 'brutalist-container pl-6 pr-6 pt-6 pb-16'
          } ${supportsViewTransitions ? '' : 'animate-view-fade'}`}>
          {page === 'home' && (
            <Home
              setPage={navigateTo}
              openPaper={openPaper}
              focusNonce={homeFocusNonce}
              addToast={addToast}
              onSearchQuery={openSearch}
            />
          )}
          {page === 'search' && (
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
                <div className="h-2 w-48 rounded-full overflow-hidden bg-surface">
                  <div className="h-full w-1/3 skeleton-shimmer" />
                </div>
                <span className="text-sm text-muted uppercase tracking-widest">Loading search...</span>
              </div>
            }>
              <SearchWorkbench
                initialQuery={searchQuery}
                focusNonce={searchFocusNonce}
                setPage={navigateTo}
                openPaper={openPaper}
                addToast={addToast}
              />
            </Suspense>
          )}
          {page === 'reader' && (
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
                <div className="h-2 w-48 rounded-full overflow-hidden bg-surface">
                  <div className="h-full w-1/3 skeleton-shimmer" />
                </div>
                <span className="text-sm text-muted uppercase tracking-widest">Loading reader…</span>
              </div>
            }>
              <Reader
                ref={readerRef}
                paper={selectedPaper}
                setSelectedPaper={setSelectedPaper}
                setPage={setPage}
                settings={settings}
                initialTab={readerInitialTab}
                addToast={addToast}
                onSendToCanvas={(imageData) => {
                  addToast(`Page ${imageData.page} copied to clipboard`)
                }}
              />
            </Suspense>
          )}
          {page === 'settings' && (
            <Settings settings={settings} setSettings={setSettings} setPage={setPage} addToast={addToast} />
          )}
          {page === 'help' && (
            <Help setPage={setPage} />
          )}
          </div>
        </div>
        {window.electron?.isElectron && activeExternalTabId && (() => {
          const tab = externalTabs.find((t) => t.id === activeExternalTabId)
          if (!tab) return null
          return (
            <div className="flex-1 flex flex-col min-h-0">
              <webview
                src={tab.url}
                className="flex-1 w-full min-h-0"
                style={{ minHeight: 400 }}
              />
            </div>
          )
        })()}
      </main>
      <RecentPapersFinder
        open={recentsOpen}
        onClose={() => setRecentsOpen(false)}
        onSelectPaper={(paper) => {
          openPaper(paper)
          setRecentsOpen(false)
        }}
      />
      <GlobalSearchPalette
        open={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        currentPage={page}
        onSelectPaper={(paper) => {
          openPaper(paper)
          setQuickSearchOpen(false)
        }}
        onCommand={(cmd) => {
          if (['home', 'search', 'settings', 'help'].includes(cmd.id)) {
            navigateTo(cmd.id)
          }
          setQuickSearchOpen(false)
        }}
      />
      <GlobalCanvas
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
      />
    </div>
  )
}

export default App
