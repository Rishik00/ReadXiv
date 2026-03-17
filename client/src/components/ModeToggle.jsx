/**
 * Cursor-style segmented pill: Search | Shelf | Settings
 * On Reader: all three show as exit options (← Search, ← Shelf, ← Settings)
 */
export default function ModeToggle({ currentPage, onNavigate, variant = 'default' }) {
  const isReader = currentPage === 'reader'
  const isSubtle = variant === 'reader'

  const baseClass = `fixed z-40 flex items-center rounded-lg border border-border bg-surface text-sm font-medium transition-all duration-300 ease-out ${
    isSubtle ? 'opacity-50 hover:opacity-100 group-hover:opacity-100' : ''
  }`

  const positionClass = 'bottom-6 left-6'

  const segmentClass = (active) =>
    `px-4 py-2 transition-colors border-r border-border last:border-r-0 ${
      active
        ? 'bg-secondary/20 text-secondary cursor-default'
        : 'text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer'
    }`

  const exitSegmentClass = () =>
    'px-3 py-2 flex items-center gap-1.5 transition-colors text-muted hover:text-foreground hover:bg-foreground/5 cursor-pointer border-r border-border last:border-r-0'

  if (isReader) {
    return (
      <div className={`${baseClass} ${positionClass}`} role="group">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className={exitSegmentClass()}
          aria-label="Exit to Search"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Search
        </button>
        <button
          type="button"
          onClick={() => onNavigate('shelf')}
          className={exitSegmentClass()}
          aria-label="Exit to Shelf"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Shelf
        </button>
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={exitSegmentClass()}
          aria-label="Exit to Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Settings
        </button>
      </div>
    )
  }

  // On Settings: show Search | Shelf as exit options
  if (currentPage === 'settings') {
    return (
      <div className={`${baseClass} ${positionClass}`}>
        <button type="button" onClick={() => onNavigate('home')} className={segmentClass(false)}>
          Search
        </button>
        <button type="button" onClick={() => onNavigate('shelf')} className={segmentClass(false)}>
          Shelf
        </button>
      </div>
    )
  }

  // On Home or Shelf: full pill Search | Shelf | Settings
  const Seg = ({ label, target, active }) =>
    active ? (
      <span className={segmentClass(true)} aria-current="page">{label}</span>
    ) : (
      <button type="button" onClick={() => onNavigate(target)} className={segmentClass(false)}>
        {label}
      </button>
    )

  return (
    <div className={`${baseClass} ${positionClass}`}>
      <Seg label="Search" target="home" active={currentPage === 'home'} />
      <Seg label="Shelf" target="shelf" active={currentPage === 'shelf'} />
      <Seg label="Settings" target="settings" active={currentPage === 'settings'} />
    </div>
  )
}
