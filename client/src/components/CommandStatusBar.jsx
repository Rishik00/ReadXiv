function chordLabel({ pendingG, pendingB, pendingK, pendingF }) {
  if (pendingB) return 'SPACE B';
  if (pendingK) return 'SPACE K';
  if (pendingF) return 'SPACE F';
  if (pendingG) return 'SPACE';
  return 'NORMAL';
}

export default function CommandStatusBar({
  page,
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

  const hints = [
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
  ];

  return (
    <div className="command-status-bar">
      <button
        type="button"
        className="command-status-mode is-active"
        onClick={onCommand}
        title="Open command palette"
      >
        {chord}
      </button>

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
