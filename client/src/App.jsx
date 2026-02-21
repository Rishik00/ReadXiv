import { Suspense, lazy, useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import Shelf from './pages/Shelf'
import Settings from './pages/Settings'
const Reader = lazy(() => import('./pages/Reader'))

function App() {
  const [page, setPage] = useState('home')
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [shelfQuery, setShelfQuery] = useState('')
  const [homeFocusNonce, setHomeFocusNonce] = useState(0)
  const [readerInitialTab, setReaderInitialTab] = useState('edit')
  const [toasts, setToasts] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const raw = localStorage.getItem('papyrus-sidebar-collapsed')
    return raw === 'true'
  })
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('papyrus-settings')
    if (!raw) return { continuousScroll: true, liveMarkdownPreview: true, secondaryColor: 'orange', fontFamily: 'brutalist' }
    try {
      const parsed = JSON.parse(raw)
      return { continuousScroll: true, liveMarkdownPreview: true, secondaryColor: 'orange', fontFamily: 'brutalist', ...parsed }
    } catch {
      return { continuousScroll: true, liveMarkdownPreview: true, secondaryColor: 'orange', fontFamily: 'brutalist' }
    }
  })

  useEffect(() => {
    localStorage.setItem('papyrus-settings', JSON.stringify(settings))
    // Apply theme variables to document element
    document.documentElement.setAttribute('data-secondary', settings.secondaryColor || 'orange')
    document.documentElement.setAttribute('data-font', settings.fontFamily || 'brutalist')
  }, [settings])

  useEffect(() => {
    localStorage.setItem('papyrus-sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

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
    <div className="flex min-h-screen bg-background text-foreground font-mono">
      <div className="fixed right-4 top-4 z-50 flex w-[320px] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-none border px-3 py-2 text-xs shadow-lg uppercase tracking-wider ${
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
      />
      <main className="flex-1 overflow-auto border-l border-border bg-background relative">
        <div className="brutalist-container relative z-10">
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
      </main>
    </div>
  )
}

export default App
