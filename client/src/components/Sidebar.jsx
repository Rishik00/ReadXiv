const navItems = [
  { id: 'home', icon: '⌕', label: 'Search' },
  { id: 'shelf', icon: '☰', label: 'Paper Shelf' },
]

export default function Sidebar({ page, setPage, onSearchClick, collapsed }) {
  return (
    <div
      className={`${
        collapsed ? 'w-[84px]' : 'w-[248px]'
      } bg-background border-r border-border flex flex-col flex-shrink-0 h-screen sticky top-0 transition-all duration-150 font-mono`}
    >
      <div className="p-4 pb-3">
        <div className={`mb-6 flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-8 h-8 rounded-none bg-secondary text-white flex items-center justify-center text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            R
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-brutalist uppercase text-foreground">
              readxiv
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onSearchClick}
          className={`${
            collapsed ? 'mx-auto h-10 w-10 justify-center px-0' : 'w-full px-3'
          } flex items-center gap-3 rounded-none border-2 border-border bg-surface py-2 text-[11px] text-muted hover:border-secondary hover:text-foreground transition-all uppercase tracking-widest font-bold`}
          title="Search papers"
        >
          <span className="text-sm">⌕</span>
          {!collapsed && <span className="flex-1 text-left">Search</span>}
          {!collapsed && (
            <kbd className="font-mono text-[9px] border border-border px-1 py-0.5 opacity-50">
              CTRL+K
            </kbd>
          )}
        </button>
      </div>

      <div className="h-px w-full bg-border" />

      <div className={`flex-1 overflow-auto ${collapsed ? 'p-3' : 'p-2'} flex flex-col gap-1`}>
        {!collapsed && (
          <div className="px-3 py-2 mb-1 text-[10px] font-bold text-muted uppercase tracking-[0.2em]">
            Terminal
          </div>
        )}
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center ${
              collapsed ? 'h-12 justify-center' : 'gap-3 px-3 py-2.5'
            } text-[11px] text-left transition-all uppercase tracking-widest font-bold border-2 ${
              page === item.id
                ? 'bg-secondary border-secondary text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]'
                : 'text-muted border-transparent hover:border-border hover:bg-surface'
            }`}
            title={item.label}
          >
            <span className="text-sm w-[18px] text-center">{item.icon}</span>
            {!collapsed && item.label}
          </button>
        ))}
        {!collapsed && (
          <>
            <div className="mt-3 px-2 py-1 mb-1 text-[10px] font-semibold text-muted uppercase tracking-wider">
              Recent
            </div>
            {['Attention Is All You Need', 'Flash Attention', 'Scaling Laws'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPage('reader')}
                className="w-full truncate rounded px-2.5 py-1.5 text-left text-xs text-muted hover:bg-surface transition-colors"
                title={item}
              >
                ◫ {item}
              </button>
            ))}
          </>
        )}
      </div>
      
      <div className="h-px w-full bg-border" />
      
      <div className={`p-3 ${collapsed ? 'flex justify-center' : 'px-4 flex items-center justify-between'}`}>
        <div className={`flex items-center ${collapsed ? '' : 'gap-1.5'}`}>
          <div className="w-[22px] h-[22px] rounded-full bg-surface flex items-center justify-center text-[10px] font-semibold">
            R
          </div>
          {!collapsed && <span className="text-xs text-muted">Rishi</span>}
        </div>
        {!collapsed && (
          <button
            type="button"
            className="text-sm text-muted cursor-pointer hover:text-foreground transition-colors"
            onClick={() => setPage('settings')}
            title="Settings"
          >
            ⚙
          </button>
        )}
      </div>
    </div>
  )
}
