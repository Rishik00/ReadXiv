function truncateTitle(title) {
  if (!title) return '';
  return title.length > 82 ? `${title.slice(0, 79).trimEnd()}...` : title;
}

function modeLabel(page) {
  if (page === 'home') return 'SEARCH';
  if (page === 'shelf') return 'SHELF';
  if (page === 'reader') return 'READER';
  if (page === 'settings') return 'SETTINGS';
  if (page === 'help') return 'HELP';
  return page?.toUpperCase?.() || 'READXIV';
}

function chordLabel({ pendingG, pendingB, pendingK, pendingF }) {
  if (pendingB) return 'SPACE B';
  if (pendingK) return 'SPACE K';
  if (pendingF) return 'SPACE F';
  if (pendingG) return 'SPACE';
  return 'NORMAL';
}

export default function CommandStatusBar({
  page,
  selectedPaper,
  pendingG,
  pendingB,
  pendingK,
  pendingF,
  onNavigate,
  onCommand,
  onRecents,
}) {
  const chord = chordLabel({ pendingG, pendingB, pendingK, pendingF });
  const isChordActive = chord !== 'NORMAL';
  if (!isChordActive) return null;

  const context =
    page === 'reader'
      ? truncateTitle(selectedPaper?.title || selectedPaper?.id || 'No paper selected')
      : page === 'shelf'
        ? 'Library queue'
        : page === 'home'
          ? 'Add, search, or preview papers'
          : page === 'settings'
            ? 'Preferences'
            : page === 'help'
              ? 'Keyboard reference'
              : 'Research workspace';

  const hints = isChordActive
    ? [
        ['h', 'search'],
        ['s', 'shelf'],
        ...(page === 'reader'
          ? [
              ['q', 'pdf'],
              ['w', 'split'],
              ['e', 'notes'],
              ['t', 'page'],
            ]
          : []),
        ['f', 'recent'],
        ['c', 'settings'],
      ]
    : [
        ['Space', 'leader'],
        ['Ctrl+P', 'command'],
        ['gh', 'search'],
        ['gs', 'shelf'],
        ...(page === 'reader' ? [['gw', 'split']] : []),
      ];

  return (
    <div className="command-status-bar">
      <div className="command-status-left">
        <button
          type="button"
          className={`command-status-mode ${isChordActive ? 'is-active' : ''}`}
          onClick={onCommand}
          title="Open command palette"
        >
          {chord}
        </button>
        <button
          type="button"
          className="command-status-page"
          onClick={() => onNavigate?.(page === 'reader' ? 'shelf' : 'home')}
          title={page === 'reader' ? 'Go to shelf' : 'Go to search'}
        >
          {modeLabel(page)}
        </button>
        <span className="command-status-context">{context}</span>
      </div>

      <div className="command-status-hints">
        {hints.map(([key, label]) => (
          <button
            key={`${key}-${label}`}
            type="button"
            className="command-status-hint"
            onClick={() => {
              if (label === 'command') onCommand?.();
              else if (label === 'recent') onRecents?.();
              else if (label === 'search') onNavigate?.('home');
              else if (label === 'shelf') onNavigate?.('shelf');
              else if (label === 'settings') onNavigate?.('settings');
            }}
          >
            <kbd>{key}</kbd>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
