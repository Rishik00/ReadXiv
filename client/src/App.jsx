// Review: Lets rename anything from papyrus to readxiv
// Review: always separate local imports from react imports with a comment. 
// Review: bruh, there are barely any comments in this entire 600+ line file. Please lets have comments. 
// Question: Is this file clean? I hardly think so. it looks like I wrote it and I am a beginner JS programmer. This looks....like garbage, is this how all JS code is? 

import { Suspense, lazy, useEffect, useState, useCallback, useRef } from 'react'
import axios from 'axios'
import GlobalSearchPalette from './components/GlobalSearchPalette'
import RecentPapersFinder from './components/RecentPapersFinder'
import Home from './pages/Home'
import Settings from './pages/Settings'
import { notificationsSupported, showNotification } from './lib/notifications'
import Help from './pages/Help'
import {
  captureAction,
  capturePageView,
  captureTiming,
  elapsedSince,
  markCurrentRoute,
  startTimer,
} from './lib/instrumentation'
const Reader = lazy(() => import('./pages/Reader'))
const SearchWorkbench = lazy(() => import('./pages/SearchWorkbench'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const GlobalCanvas = lazy(() => import('./components/GlobalCanvas'))

// Question: does this still apply? If not, explain
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

function parseArxivDeepLink(pathname) {
  const m = pathname.match(/^\/(?:abs|pdf)\/(\d{4}\.\d{4,5}(?:v\d+)?)\/?$/i)
  if (!m) return null
  return m[1]
}

// Review: bruh, this is only being used once throughout the app. Why keep it like this. 
function readerPathForPaperId(id) {
  return `/p/${encodeURIComponent(id)}`
}

function isLibraryPath(pathname) {
  return pathname === '/library' || pathname === '/library/' || pathname === '/search' || pathname === '/search/'
}

function isDashboardPath(pathname) {
  return pathname === '/dashboard' || pathname === '/dashboard/'
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

function createClientId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  )
}

function App() {
  // Question: This is....a lot of state that you're maintaining. Sure all of this is necessary? 
  // Question: actually, are we using react router? What are we doing right now for routes?
  const [page, setPage] = useState('home')
  const [selectedPaper, setSelectedPaper] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchWorkspaceState, setSearchWorkspaceState] = useState({
    query: '',
    currentPage: 1,
    selectedPaperId: null,
  })
  const [homeFocusNonce, setHomeFocusNonce] = useState(0)
  const [homeArxivInput, setHomeArxivInput] = useState(null)
  const [initialRouteResolved, setInitialRouteResolved] = useState(false)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)
  const [readerInitialTab, setReaderInitialTab] = useState('edit')
  const [toasts, setToasts] = useState([])
  const [quickSearchOpen, setQuickSearchOpen] = useState(false)
  const [recentsOpen, setRecentsOpen] = useState(false)
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [pendingCanvasSource, setPendingCanvasSource] = useState(null)
  const [pendingG, setPendingG] = useState(false)
  const readerRef = useRef(null)
  /** Mirror chord flags so the next key is recognized before React re-renders (fixes Space then o). */
  // Teach me: what is useRef() doing? 
  const pendingGRef = useRef(false)
  const pageRef = useRef(page)

  useEffect(() => {
    if (!pendingG) return
    const t = setTimeout(() => {
      pendingGRef.current = false
      setPendingG(false)
    }, 2000)
    return () => clearTimeout(t)
  }, [pendingG])

  // Question: I feel uncomfortable having all of this here. Is there a better way of doing this? 
  const [externalTabs, setExternalTabs] = useState([])
  const [activeExternalTabId, setActiveExternalTabId] = useState(null)
  const DEFAULT_THEME = 'mist'
  const DEFAULT_PDF_ZOOM = 'actual'
  const DEFAULT_READER_VIEW = 'split'
  const VALID_THEMES = ['monochrome', 'blue', 'noir', 'olive', 'mist', 'plum', 'periwinkle', 'lichen', 'cinder']
  const VALID_PDF_ZOOMS = ['actual', 'page-width', 'page-fit', 'auto']
  const VALID_READER_VIEWS = ['split', 'pdf', 'notes']
  const VALID_NOTES_FONTS = ['current', 'source-sans-3', 'atkinson-hyperlegible']

  // Teach Me: what does UseState do? 
  // Question: why is this so big? What is this doing? because this is hardly readable for me. 
  const [settings, setSettings] = useState(() => {
    const raw = localStorage.getItem('papyrus-settings')
    if (!raw)
      return {
        continuousScroll: true,
        theme: DEFAULT_THEME,
        fontFamily: 'brutalist',
        notesFontFamily: 'current',
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
      const notesFontFamily = VALID_NOTES_FONTS.includes(currentSettings.notesFontFamily)
        ? currentSettings.notesFontFamily
        : 'current'
      delete currentSettings['live' + 'MarkdownPreview']
      return {
        continuousScroll: true,
        fontFamily: 'brutalist',
        ...currentSettings,
        theme,
        defaultPdfZoom,
        defaultReaderView,
        notesFontFamily,
      }
    } catch {
      return {
        continuousScroll: true,
        theme: DEFAULT_THEME,
        fontFamily: 'brutalist',
        notesFontFamily: 'current',
        homeLayout: 'list',
        defaultPdfZoom: DEFAULT_PDF_ZOOM,
        defaultReaderView: DEFAULT_READER_VIEW,
      }
    }
  })
  const supportsViewTransitions =
    typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
  const pageTimerRef = useRef(startTimer())

  useEffect(() => {
    pageRef.current = page
  }, [page])

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
    document.documentElement.setAttribute('data-notes-font', settings.notesFontFamily || 'current')
  }, [settings])

  useEffect(() => {
    if (!notificationsSupported()) return undefined
    const storageKey = 'readxiv-last-reading-reminder'
    const checkReminders = async () => {
      try {
        const { data } = await axios.get('/api/papers')
        const papers = Array.isArray(data) ? data : data?.items || []
        if (!papers.length) return
        const today = new Date().toISOString().slice(0, 10)
        const committed = papers
          .filter((paper) => paper.scheduled_date === today)
          .sort((a, b) => String(b.last_accessed_at || '').localeCompare(String(a.last_accessed_at || '')))[0]
        const ambient = papers
          .filter((paper) => paper.status === 'reading' || Number(paper.current_page) > 1)
          .sort((a, b) => String(b.last_accessed_at || '').localeCompare(String(a.last_accessed_at || '')))[0]
        const candidate = committed || ambient
        if (!candidate) return
        const last = Number(localStorage.getItem(storageKey) || 0)
        const interval = committed ? 90 * 60 * 1000 : 5 * 60 * 60 * 1000
        if (!last) {
          localStorage.setItem(storageKey, String(Date.now()))
          return
        }
        if (Date.now() - last < interval) return
        const page = Number(candidate.current_page) > 1 ? ` at page ${candidate.current_page}` : ''
        showNotification(
          committed ? 'You left this for today' : 'Your reading is still here',
          `${candidate.title || candidate.id}${page}`,
          { paperId: candidate.id, page: Number(candidate.current_page) || 1 }
        )
        localStorage.setItem(storageKey, String(Date.now()))
      } catch {
        // Reminders are best-effort and should never interrupt reading.
      }
    }
    checkReminders()
    const timer = setInterval(checkReminders, 60 * 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!window.electron?.onOpenExternalTab) return
    const unsubscribe = window.electron.onOpenExternalTab((url) => {
      const id = createClientId()
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
          captureAction('navigate', { route: pageRef.current, target: 'home', source: 'navigateTo' })
          setPage('home')
          setHomeFocusNonce((n) => n + 1)
        } else if (target === 'search') {
          captureAction('navigate', { route: pageRef.current, target: 'search', source: 'navigateTo' })
          setPage('search')
          setSearchFocusNonce((n) => n + 1)
        } else if (target === 'dashboard') {
          captureAction('navigate', { route: pageRef.current, target: 'dashboard', source: 'navigateTo' })
          setPage('dashboard')
        } else if (target === 'settings') {
          captureAction('navigate', { route: pageRef.current, target: 'settings', source: 'navigateTo' })
          setPage('settings')
        } else if (target === 'help') {
          captureAction('navigate', { route: pageRef.current, target: 'help', source: 'navigateTo' })
          setPage('help')
        }
      })
    },
    [runWithViewTransition]
  )

  const openSearch = useCallback(
    (query = '') => {
      runWithViewTransition(() => {
        captureAction('open_search', {
          route: pageRef.current,
          queryLength: query.length,
          source: 'openSearch',
        })
        setSearchQuery(query)
        setPage('search')
        setSearchFocusNonce((n) => n + 1)
      })
    },
    [runWithViewTransition]
  )

  // Teach me: how does UseCallBack work? why do we have multiple callbacks doing these things and why do we not have a utils.js file or something or a callbacks.js to store all the callbacks throughout the app (assuming there are more)
  const openPaper = useCallback(
    (paper, { initialTab = 'edit' } = {}) => {
      if (!paper) return
      runWithViewTransition(() => {
        captureAction('open_paper', {
          route: pageRef.current,
          paperId: paper.id,
          paperTitle: paper.title,
          initialTab,
        })
        setSelectedPaper(paper)
        setReaderInitialTab(initialTab)
        setPage('reader')
      })
    },
    [runWithViewTransition]
  )

  // Review: holy fuck this is....a VERY LARGE effect call. Is this normal? Any way we can simplify this? 
  // I think i see a way, everything inside every branch looks like it can be made into a function and then we can do switch case statements to make our lives easier. 

  // Teach me: how does UseEffect work? How does anything in the hook system work? 
  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isInputFocused = tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

      if (event.key === 'Escape') {
        pendingGRef.current = false
        setPendingG(false)
        if (!isInputFocused && page === 'reader') {
          event.preventDefault()
          navigateTo('search')
        } else if (!isInputFocused && (page === 'settings' || page === 'help')) {
          event.preventDefault()
          navigateTo('home')
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
        } else if (k === 'l') {
          event.preventDefault()
          navigateTo('search')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'r') {
          event.preventDefault()
          setRecentsOpen(true)
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'd') {
          event.preventDefault()
          navigateTo('dashboard')
          pendingGRef.current = false
          setPendingG(false)
        } else if (page === 'reader' && k === '1') {
          event.preventDefault()
          readerRef.current?.setReaderView?.('pdf')
          pendingGRef.current = false
          setPendingG(false)
        } else if (page === 'reader' && k === '2') {
          event.preventDefault()
          readerRef.current?.setReaderView?.('split')
          pendingGRef.current = false
          setPendingG(false)
        } else if (page === 'reader' && k === '3') {
          event.preventDefault()
          readerRef.current?.setReaderView?.('notes')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === ',') {
          event.preventDefault()
          navigateTo('settings')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === '?' || (event.shiftKey && k === '/')) {
          event.preventDefault()
          setPage('help')
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'b' && page === 'reader') {
          event.preventDefault()
          readerRef.current?.togglePdfDarkMode?.()
          pendingGRef.current = false
          setPendingG(false)
        } else if (k === 'a') {
          event.preventDefault()
          setCanvasOpen(true)
          pendingGRef.current = false
          setPendingG(false)
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

      // Question: what is this doing? 
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

  // Question: again, why not store this in a callbacks.js? 
  const addToast = useCallback((message, type = 'info') => {
    const id = createClientId()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }, [])

  const openPaperById = useCallback(
    async (id, { page: requestedPage } = {}) => {
      try {
        const { data } = await axios.get(`/api/papers/${encodeURIComponent(id)}`)
        const page = Number(requestedPage)
        openPaper(Number.isFinite(page) && page > 0 ? { ...data, current_page: page } : data)
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
    const openFromNotification = (payload = {}) => {
      if (payload.paperId) openPaperById(payload.paperId, { page: payload.page })
    }
    const unsubscribeElectron = window.electron?.onNotificationActivated?.(openFromNotification)
    const onBrowserNotification = (event) => openFromNotification(event.detail)
    window.addEventListener('readxiv-notification-activated', onBrowserNotification)
    return () => {
      unsubscribeElectron?.()
      window.removeEventListener('readxiv-notification-activated', onBrowserNotification)
    }
  }, [openPaperById])

  useEffect(() => {
    let cancelled = false
    const resolveInitialRoute = async () => {
      const fromPath = parsePaperDeepLink(window.location.pathname)
      if (fromPath) {
        await openPaperById(fromPath)
        if (!cancelled) setInitialRouteResolved(true)
        return
      }
      const arxivId = parseArxivDeepLink(window.location.pathname)
      if (arxivId) {
        setHomeArxivInput(`https://arxiv.org/abs/${arxivId}`)
        setPage('home')
        setInitialRouteResolved(true)
        return
      }
      if (isLibraryPath(window.location.pathname)) {
        setPage('search')
        setSearchFocusNonce((n) => n + 1)
      } else if (isDashboardPath(window.location.pathname)) {
        setPage('dashboard')
      }
      setInitialRouteResolved(true)
    }
    resolveInitialRoute()
    return () => {
      cancelled = true
    }
  }, [openPaperById])

  useEffect(() => {
    const onPop = () => {
      const id = parsePaperDeepLink(window.location.pathname)
      if (id) openPaperById(id)
      else {
        const arxivId = parseArxivDeepLink(window.location.pathname)
        if (arxivId) {
          runWithViewTransition(() => {
            setHomeArxivInput(`https://arxiv.org/abs/${arxivId}`)
            setPage('home')
            setSelectedPaper(null)
          })
        } else if (isLibraryPath(window.location.pathname)) {
          runWithViewTransition(() => {
            setPage('search')
            setSelectedPaper(null)
            setSearchFocusNonce((n) => n + 1)
          })
        } else if (isDashboardPath(window.location.pathname)) {
          runWithViewTransition(() => {
            setPage('dashboard')
            setSelectedPaper(null)
          })
        } else {
          runWithViewTransition(() => {
            setPage('home')
            setSelectedPaper(null)
          })
        }
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
      if (!isLibraryPath(window.location.pathname)) {
        window.history.pushState({ readxiv: 'library' }, '', '/library')
      } else if (window.location.pathname.startsWith('/search')) {
        window.history.replaceState({ readxiv: 'library' }, '', '/library')
      }
    } else if (page === 'dashboard') {
      if (!isDashboardPath(window.location.pathname)) {
        window.history.pushState({ readxiv: 'dashboard' }, '', '/dashboard')
      }
    } else if (page === 'home' && isDashboardPath(window.location.pathname)) {
      window.history.replaceState(null, '', '/')
    } else if (page === 'home' && parseArxivDeepLink(window.location.pathname)) {
      window.history.replaceState(null, '', '/')
    } else if (page !== 'reader' && window.location.pathname.startsWith('/p/')) {
      window.history.replaceState(null, '', '/')
    } else if (page !== 'search' && isLibraryPath(window.location.pathname)) {
      window.history.replaceState(null, '', '/')
    }
  }, [page, selectedPaper?.id])

  useEffect(() => {
    if (!initialRouteResolved) return
    markCurrentRoute(page)
    pageTimerRef.current = startTimer()
    capturePageView(page, {
      path: window.location.pathname,
      paperId: page === 'reader' ? selectedPaper?.id : null,
    })
  }, [initialRouteResolved, page, selectedPaper?.id])

  useEffect(() => {
    if (!initialRouteResolved || page === 'canvas') return undefined
    const startedAt = pageTimerRef.current
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        captureTiming('page_load', elapsedSince(startedAt), {
          route: page,
          path: window.location.pathname,
          paperId: page === 'reader' ? selectedPaper?.id : null,
          marker: 'first_two_frames',
        })
      })
    })
    return () => cancelAnimationFrame(id)
  }, [initialRouteResolved, page, selectedPaper?.id])

  // Question: what is chordHint? 
  const chordCommands = pendingG
    ? page === 'reader'
      ? [
          ['h', 'Home'],
          ['l', 'Library'],
          ['d', 'Dashboard'],
          ['r', 'Recent'],
          [',', 'Settings'],
          ['?', 'Help'],
          ['1/2/3', 'Views'],
          ['b', 'Dark'],
          ['t', 'Page'],
        ]
      : [
          ['h', 'Home'],
          ['l', 'Library'],
          ['d', 'Dashboard'],
          ['r', 'Recent'],
          [',', 'Settings'],
          ['?', 'Help'],
          ['a', 'Canvas'],
        ]
    : null

  // Question: is this how good react codebases do? directly just return the HTML file? 
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
      {chordCommands && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div
            className="flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg border px-2.5 py-2 shadow-2xl"
            style={{
              borderColor: 'color-mix(in srgb, var(--foreground) 14%, var(--border))',
              background: 'color-mix(in srgb, var(--surface) 96%, var(--background))',
            }}
          >
            <span
              className="rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{
                borderColor: 'color-mix(in srgb, var(--secondary) 40%, var(--border))',
                color: 'var(--foreground)',
                background: 'color-mix(in srgb, var(--secondary) 9%, transparent)',
              }}
            >
              Space
            </span>
            <span style={{ width:1, height:22, background:'var(--border)' }} />
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
              {chordCommands.map(([key, label]) => (
                <span
                  key={`${key}-${label}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px]"
                  style={{ color:'color-mix(in srgb, var(--foreground) 78%, transparent)' }}
                >
                  <span
                    className="font-mono font-bold"
                    style={{ color:'var(--foreground)' }}
                  >
                    {key}
                  </span>
                  <span>{label}</span>
                </span>
              ))}
            </div>
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
            page === 'reader' || page === 'search' || page === 'home' || page === 'dashboard' ? '' : 'brutalist-container pl-6 pr-6 pt-6 pb-16'
          } ${supportsViewTransitions ? '' : 'animate-view-fade'}`}>
          {page === 'home' && (
            <Home
              setPage={navigateTo}
              openPaper={openPaper}
              focusNonce={homeFocusNonce}
              initialArxivInput={homeArxivInput}
              onInitialArxivInputConsumed={() => setHomeArxivInput(null)}
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
                <span className="text-sm text-muted uppercase tracking-widest">Loading library...</span>
              </div>
            }>
              <SearchWorkbench
                initialQuery={searchQuery}
                focusNonce={searchFocusNonce}
                setPage={navigateTo}
                openPaper={openPaper}
                addToast={addToast}
                workspaceState={searchWorkspaceState}
                onWorkspaceStateChange={setSearchWorkspaceState}
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
                  setPendingCanvasSource({
                    sourceType: 'pdf-page',
                    paperId: selectedPaper?.id,
                    paperTitle: selectedPaper?.title || selectedPaper?.id,
                    page: imageData.page,
                    collectedAt: new Date().toISOString(),
                  })
                  setCanvasOpen(true)
                  addToast(`Page ${imageData.page} added to Canvas`, 'success')
                }}
              />
            </Suspense>
          )}
          {page === 'dashboard' && (
            <Suspense fallback={
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-fade-in">
                <div className="h-2 w-48 rounded-full overflow-hidden bg-surface">
                  <div className="h-full w-1/3 skeleton-shimmer" />
                </div>
                <span className="text-sm text-muted uppercase tracking-widest">Loading dashboard...</span>
              </div>
            }>
              <Dashboard openPaper={openPaper} />
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
          if (['home', 'search', 'dashboard', 'settings', 'help'].includes(cmd.id)) {
            navigateTo(cmd.id)
          }
          setQuickSearchOpen(false)
        }}
      />
      {canvasOpen && (
        <Suspense fallback={null}>
          <GlobalCanvas
            open
            onClose={() => setCanvasOpen(false)}
            pendingSource={pendingCanvasSource}
            onSourceConsumed={() => setPendingCanvasSource(null)}
            onOpenSource={(source) => {
              setCanvasOpen(false)
              if (source?.paperId) openPaperById(source.paperId, { page: source.page })
            }}
          />
        </Suspense>
      )}
    </div>
  )
}

export default App
