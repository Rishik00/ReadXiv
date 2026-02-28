import { Suspense, lazy, useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import GlobalSearchPalette from './components/GlobalSearchPalette'
import Home from './pages/Home'
import Shelf from './pages/Shelf'
import Settings from './pages/Settings'
const Reader = lazy(() => import('./pages/Reader'))

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
  const [externalTabs, setExternalTabs] = useState([])
  const [activeExternalTabId, setActiveExternalTabId] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const raw = localStorage.getItem('papyrus-sidebar-collapsed')
    return raw === 'true'
  })
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('papyrus-settings')
    if (!raw) return { continuousScroll: true, liveMarkdownPreview: true, theme: 'default', fontFamily: 'brutalist' }
    try {
      const parsed = JSON.parse(raw)
      return { continuousScroll: true, liveMarkdownPreview: true, theme: 'default', fontFamily: 'brutalist', ...parsed }
    } catch {
      return { continuousScroll: true, liveMarkdownPreview: true, theme: 'default', fontFamily: 'brutalist' }
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
    localStorage.setItem('papyrus-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    if (!window.electron?.onOpenExternalTab) return
    window.electron.onOpenExternalTab((url) => {
      const id = crypto.randomUUID()
      setExternalTabs((prev) => [...prev, { id, url, title: getTabTitle(url) }])
      setActiveExternalTabId(id)
    })
  }, [])

  const closeExternalTab = (id) => {
    setExternalTabs((prev) => prev.filter((t) => t.id !== id))
    setActiveExternalTabId((current) => (current === id ? null : current))
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setSidebarCollapsed((v) => !v)
        return
      }
      if ((event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k') || (event.ctrlKey && event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        setPage('home')
        setHomeFocusNonce((n) => n + 1)
        return
      }
      if (event.ctrlKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setQuickSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

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
            className={`rounded-xl border px-4 py-3 text-sm shadow-xl ${
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

      <Sidebar
        page={page}
        setPage={setPage}
        collapsed={sidebarCollapsed}
        onSearchClick={() => {
          setPage('home')
          setHomeFocusNonce((n) => n + 1)
        }}
        onOpenRecent={(paper) => {
          setSelectedPaper(paper)
          setReaderInitialTab('edit')
          setPage('reader')
        }}
      />
      <main className="app-main flex-1 overflow-auto relative flex flex-col">
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
          <div className={`${page === 'reader' ? '' : 'brutalist-container'} relative z-10`}>
          {page === 'home' && (
            <Home
              setPage={setPage}
              setSelectedPaper={setSelectedPaper}
              focusNonce={homeFocusNonce}
              addToast={addToast}
              onSearchQuery={(query) => {
                setShelfQuery(query)
                setPage('shelf')
              }}
            />
          )}
          {page === 'shelf' && (
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
          )}
          {page === 'reader' && (
            <Suspense fallback={<div className="p-8 text-muted uppercase tracking-widest animate-pulse">Loading reader…</div>}>
              <Reader
                paper={selectedPaper}
                setSelectedPaper={setSelectedPaper}
                setPage={setPage}
                settings={settings}
                initialTab={readerInitialTab}
              />
            </Suspense>
          )}
          {page === 'settings' && <Settings settings={settings} setSettings={setSettings} />}
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
          if (cmd.id === 'home') {
            setPage('home')
            setHomeFocusNonce((n) => n + 1)
          } else if (cmd.id === 'shelf') {
            setPage('shelf')
          } else if (cmd.id === 'settings') {
            setPage('settings')
          } else if (cmd.id === 'toggle-sidebar') {
            setSidebarCollapsed((v) => !v)
          }
          setQuickSearchOpen(false)
        }}
      />
    </div>
  )
}

export default App
