import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import GlobalSearchPalette from './components/GlobalSearchPalette'
import RecentPapersFinder from './components/RecentPapersFinder'
import GlobalCanvas from './components/GlobalCanvas'
import Home from './pages/Home'
import Shelf from './pages/Shelf'
import Settings from './pages/Settings'
import Help from './pages/Help'
const Reader = lazy(() => import('./pages/Reader'))

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
  const [shelfQuery, setShelfQuery] = useState('')
  const [homeFocusNonce, setHomeFocusNonce] = useState(0)
  const [readerInitialTab, setReaderInitialTab] = useState('edit')
  const [toasts, setToasts] = useState([])
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [pendingG, setPendingG] = useState(false)
  const [pendingB, setPendingB] = useState(false)
  const [pendingK, setPendingK] = useState(false)
  const [pendingF, setPendingF] = useState(false)
  const [openSearchNonce, setOpenSearchNonce] = useState(0)
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
  const VALID_THEMES = ['monochrome', 'blue', 'noir', 'olive', 'mist', 'plum', 'periwinkle', 'lichen', 'cinder']
  const VALID_LAYOUTS = ['list', 'split']
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('papyrus-settings')
    if (!raw)
      return { continuousScroll: true, liveMarkdownPreview: true, theme: DEFAULT_THEME, fontFamily: 'brutalist', homeLayout: 'list' }
    try {
      const parsed = JSON.parse(raw)
      let rawTheme =
        parsed.theme === 'default' || parsed.theme === 'aurora'
          ? DEFAULT_THEME
          : parsed.theme === 'experimental'
            ? 'periwinkle'
            : parsed.theme
      const theme = VALID_THEMES.includes(rawTheme) ? rawTheme : DEFAULT_THEME
      const homeLayout = VALID_LAYOUTS.includes(parsed.homeLayout) ? parsed.homeLayout : 'list'
      return { continuousScroll: true, liveMarkdownPreview: true, fontFamily: 'brutalist', ...parsed, theme, homeLayout }
    } catch {
      return { continuousScroll: true, liveMarkdownPreview: true, theme: DEFAULT_THEME, fontFamily: 'brutalist', homeLayout: 'list' }
    }
  })

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

  const navigateTo = useCallback((target) => {
    if (target === 'home') {
      setPage('home')
      setHomeFocusNonce((n) => n + 1)
    } else if (target === 'shelf') {
      setPage('shelf')
    } else if (target === 'settings') {
      setPage('settings')
    } else if (target === 'help') {
      setPage('help')
    }
  }, [])

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
          navigateTo('shelf')
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
          setPage('home')
          setHomeFocusNonce((n) => n + 1)
          setOpenSearchNonce((n) => n + 1)
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
        navigateTo('home')
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
        setSelectedPaper(data)
        setReaderInitialTab('edit')
        setPage('reader')
        return true
      } catch (e) {
        addToast(e.response?.status === 404 ? 'Paper not found' : 'Could not open paper', 'error')
        window.history.replaceState(null, '', '/')
        setPage('home')
        setSelectedPaper(null)
        return false
      }
    },
    [addToast]
  )

  useEffect(() => {
    const fromPath = parsePaperDeepLink(window.location.pathname)
    if (fromPath) openPaperById(fromPath)
  }, [openPaperById])

  useEffect(() => {
    const onPop = () => {
      const id = parsePaperDeepLink(window.location.pathname)
      if (id) openPaperById(id)
      else {
        setPage('home')
        setSelectedPaper(null)
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [openPaperById])

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
    } else if (page !== 'reader' && window.location.pathname.startsWith('/p/')) {
      window.history.replaceState(null, '', '/')
    }
  }, [page, selectedPaper?.id])

  return (
    <div className="flex min-h-screen text-foreground font-sans">
      <div className="fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,22rem)] -translate-x-1/2 flex-col-reverse gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm shadow-xl animate-toast-in ${
              toast.type === 'success'
                ? 'border-secondary/50 bg-secondary/10 text-secondary'
                : toast.type === 'error'
                  ? 'border-red-900/50 bg-red-500/10 text-red-300'
                  : 'border-border bg-surface text-foreground'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

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
          <div className={`relative z-10 ${
            page === 'reader' ? '' : 'brutalist-container pl-6 pr-6 pt-6 pb-16'
          }`}>
          {page === 'home' && (
            <div key="home" className="animate-view-fade">
            <Home
              setPage={setPage}
              setSelectedPaper={setSelectedPaper}
              focusNonce={homeFocusNonce}
              openSearchNonce={openSearchNonce}
              addToast={addToast}
              settings={settings}
              onSearchQuery={(query) => {
                setShelfQuery(query)
                setPage('shelf')
              }}
            />
            </div>
          )}
          {page === 'shelf' && (
            <div key="shelf" className="animate-view-fade">
            <Shelf
              setPage={setPage}
              setSelectedPaper={setSelectedPaper}
              initialQuery={shelfQuery}
              addToast={addToast}
            />
            </div>
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
            <div key="settings" className="animate-view-fade">
              <Settings settings={settings} setSettings={setSettings} setPage={setPage} addToast={addToast} />
            </div>
          )}
          {page === 'help' && (
            <div key="help" className="animate-view-fade">
              <Help setPage={setPage} />
            </div>
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
          setSelectedPaper(paper)
          setReaderInitialTab('edit')
          setPage('reader')
          setRecentsOpen(false)
        }}
      />
      <GlobalSearchPalette
        open={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        currentPage={page}
        onSelectPaper={(paper) => {
          setSelectedPaper(paper)
          setReaderInitialTab('edit')
          setPage('reader')
          setQuickSearchOpen(false)
        }}
        onCommand={(cmd) => {
          if (['home', 'shelf', 'settings', 'help'].includes(cmd.id)) {
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
