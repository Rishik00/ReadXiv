import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react'
import GlobalSearchPalette from './components/GlobalSearchPalette'
import RecentPapersFinder from './components/RecentPapersFinder'
import GlobalCanvas from './components/GlobalCanvas'
import Home from './pages/Home'
import Shelf from './pages/Shelf'
import Queue from './pages/Queue'
import Settings from './pages/Settings'
import Help from './pages/Help'
const Reader = lazy(() => import('./pages/Reader'))

// Settings button: kept in code but not in use. User will specify placement later.
// See Settings page and setPage('settings') - accessible via Ctrl+P > "settings" for now.

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

  useEffect(() => {
    if (!pendingG && !pendingB && !pendingK && !pendingF) return
    const t = setTimeout(() => {
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
  const VALID_THEMES = ['default', 'monochrome', 'blue', 'noir', 'olive']
  const VALID_LAYOUTS = ['list', 'split']
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('papyrus-settings')
    if (!raw) return { continuousScroll: true, liveMarkdownPreview: true, theme: 'default', fontFamily: 'brutalist', homeLayout: 'list' }
    try {
      const parsed = JSON.parse(raw)
      const theme = VALID_THEMES.includes(parsed.theme) ? parsed.theme : 'default'
      const homeLayout = VALID_LAYOUTS.includes(parsed.homeLayout) ? parsed.homeLayout : 'list'
      return { continuousScroll: true, liveMarkdownPreview: true, fontFamily: 'brutalist', ...parsed, theme, homeLayout }
    } catch {
      return { continuousScroll: true, liveMarkdownPreview: true, theme: 'default', fontFamily: 'brutalist', homeLayout: 'list' }
    }
  })

  useEffect(() => {
    localStorage.setItem('papyrus-settings', JSON.stringify(settings))
    // Apply theme variables to document element
    document.documentElement.setAttribute('data-theme', settings.theme || 'default')
    document.documentElement.setAttribute('data-font', settings.fontFamily || 'brutalist')
    
    // Legacy support for secondaryColor if it exists in old settings but not theme
    if (settings.secondaryColor === 'white' && settings.theme === 'default') {
       // We can map this to monochrome or just keep it as is if we want
    }
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
    } else if (target === 'queue') {
      setPage('queue')
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
        setPendingG(false)
        setPendingB(false)
        setPendingK(false)
        setPendingF(false)
        return
      }

      if (pendingK) {
        const k = event.key.toLowerCase()
        if (k === 'a') {
          event.preventDefault()
          setCanvasOpen(true)
          setPendingK(false)
        } else {
          setPendingK(false)
        }
        return
      }

      if (pendingB) {
        const k = event.key.toLowerCase()
        if (k === 'h') {
          event.preventDefault()
          readerRef.current?.togglePdfDarkMode?.()
          setPendingB(false)
        } else {
          setPendingB(false)
        }
        return
      }

      if (pendingG) {
        const k = event.key.toLowerCase()
        if (k === 'h') {
          event.preventDefault()
          navigateTo('home')
          setPendingG(false)
        } else if (k === 's') {
          event.preventDefault()
          navigateTo('shelf')
          setPendingG(false)
        } else if (k === 'q') {
          event.preventDefault()
          navigateTo('queue')
          setPendingG(false)
        } else if (k === 'c') {
          event.preventDefault()
          navigateTo('settings')
          setPendingG(false)
        } else if (k === 'f') {
          event.preventDefault()
          setPendingG(false)
          setPendingF(true)
        } else if (k === 'e') {
          event.preventDefault()
          setPage('help')
          setPendingG(false)
        } else if (k === 'b' && page === 'reader') {
          event.preventDefault()
          setPendingG(false)
          setPendingB(true)
        } else if (k === 'k') {
          event.preventDefault()
          setPendingG(false)
          setPendingK(true)
        } else if (k === 'm' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.maximizePdf?.()
          setPendingG(false)
        } else if (k === 'n' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.minimizePdf?.()
          setPendingG(false)
        } else {
          setPendingG(false)
        }
        return
      }

      if (pendingF) {
        const k = event.key.toLowerCase()
        if (k === 'b') {
          event.preventDefault()
          setPendingF(false)
          setPage('home')
          setHomeFocusNonce((n) => n + 1)
          setOpenSearchNonce((n) => n + 1)
        } else {
          setPendingF(false)
          setRecentsOpen(true)
        }
        return
      }

      if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && !isInputFocused) {
        event.preventDefault()
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
  }, [pendingG, pendingB, pendingK, pendingF, navigateTo, page])

  const addToast = (message, type = 'info') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }

  return (
    <div className="flex min-h-screen text-foreground font-sans">
      <div className="fixed right-4 top-4 z-50 flex w-[320px] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-xl border px-4 py-3 text-sm shadow-xl animate-toast-in ${
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
              onOpenNotes={(paper) => {
                setSelectedPaper(paper)
                setReaderInitialTab('edit')
                setPage('reader')
              }}
            />
            </div>
          )}
          {page === 'queue' && (
            <div key="queue" className="animate-view-fade">
            <Queue setPage={setPage} setSelectedPaper={setSelectedPaper} />
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
          if (['home', 'shelf', 'queue', 'settings', 'help'].includes(cmd.id)) {
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
