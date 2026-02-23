import { useEffect, useState } from 'react'
import axios from 'axios'

const navItems = [
  { id: 'home', icon: '⌕', label: 'Search' },
  { id: 'shelf', icon: '☰', label: 'Paper Shelf' },
]

export default function Sidebar({ page, setPage, onSearchClick, collapsed, onOpenRecent }) {
  const [recents, setRecents] = useState([])

  useEffect(() => {
    let mounted = true
    async function loadRecents() {
      try {
        const { data } = await axios.get('/api/papers/recents', { params: { limit: 3 } })
        if (mounted) setRecents(Array.isArray(data) ? data : [])
      } catch {
        if (mounted) setRecents([])
      }
    }
    loadRecents()
    return () => {
      mounted = false
    }
  }, [page])

  return (
    <div
      className={`app-sidebar ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      } border-r border-border flex flex-col flex-shrink-0 h-screen sticky top-0 transition-all duration-200 ease-in-out font-sans`}
    >
      <div className="p-4 pb-2">
        <div className={`mb-8 flex items-center ${collapsed ? 'justify-center' : 'px-2 gap-3'}`}>
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center overflow-hidden shadow-md">
            <img 
              src="/readxiv-logo-r-monogram.png" 
              alt="R" 
              className="w-full h-full object-contain"
            />
          </div>
          {!collapsed && (
            <span className="text-xl font-serif text-foreground">
              readxiv
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSearchClick}
          className={`${
            collapsed ? 'mx-auto h-10 w-10 justify-center px-0' : 'w-full px-4'
          } flex items-center gap-3 rounded-xl border border-border bg-surface py-2.5 text-sm text-muted hover:border-secondary/50 hover:brightness-110 transition-all`}
          title="Search papers"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          {!collapsed && <span className="flex-1 text-left">New Search</span>}
          {!collapsed && (
            <kbd className="font-mono text-[10px] opacity-40">
              ⌘K
            </kbd>
          )}
        </button>
      </div>

      <div className={`flex-1 overflow-auto ${collapsed ? 'p-2' : 'p-3'} flex flex-col gap-1`}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center ${
              collapsed ? 'h-10 justify-center rounded-lg' : 'gap-3 px-3 py-2 rounded-xl'
            } text-sm transition-all ${
              page === item.id
                ? 'bg-secondary/10 text-secondary font-medium'
                : 'text-muted hover:bg-foreground/5 hover:text-foreground'
            }`}
            title={item.label}
          >
            <span className="text-lg">
              {item.id === 'home' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></svg>
              )}
            </span>
            {!collapsed && item.label}
          </button>
        ))}
        {!collapsed && recents.length > 0 && (
          <>
            <div className="mt-6 px-3 py-1 mb-1 text-[11px] font-medium text-muted/50 uppercase tracking-wider">
              Recent Papers
            </div>
            {recents.map((paper) => (
              <button
                key={paper.id}
                type="button"
                onClick={() => {
                  if (onOpenRecent) onOpenRecent(paper)
                }}
                className="w-full truncate rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-foreground/5 hover:text-foreground transition-all"
                title={paper.title}
              >
                {paper.title}
              </button>
            ))}
          </>
        )}
      </div>
      
      <div className={`p-4 ${collapsed ? 'flex justify-center' : 'px-4 flex items-center justify-between'}`}>
        <div className={`flex items-center ${collapsed ? '' : 'gap-3'}`}>
          <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-xs font-medium text-secondary">
            R
          </div>
          {!collapsed && <span className="text-sm font-medium text-foreground/80">Rishi</span>}
        </div>
        {!collapsed && (
          <button
            type="button"
            className="p-2 rounded-lg text-muted hover:bg-foreground/5 hover:text-foreground transition-all"
            onClick={() => setPage('settings')}
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        )}
      </div>
    </div>
  )
}
