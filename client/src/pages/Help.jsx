export default function Help({ setPage }) {
  const sections = [
    {
      title: 'Navigation',
      items: [
        ['Ctrl+P', 'Command palette — search papers & navigate'],
        ['Ctrl+K', 'Go home / focus search bar'],
        ['Space e', 'Open this help page'],
        ['Space h', 'Go to Search'],
        ['Space s', 'Go to Shelf'],
        ['Space c', 'Go to Settings'],
        ['Space f', 'Recent papers'],
        ['Esc', 'Blur search bar'],
      ],
    },
    {
      title: 'Reader',
      items: [
        ['Ctrl+Shift+M', 'Toggle PDF / notes panel'],
        ['Space b h', 'Toggle PDF dark mode'],
        ['Ctrl+Shift+C', 'Copy paper link'],
        ['Ctrl+Shift+D', 'PDF zoom in'],
        ['Ctrl+Shift+F', 'PDF zoom out'],
      ],
    },
    {
      title: 'Notes',
      items: [
        ['Ctrl+Shift+B', 'Bold'],
        ['Ctrl+Shift+1', 'Heading 1'],
        ['Ctrl+Shift+2', 'Heading 2'],
        ['Ctrl+Shift+L', 'List item'],
        ['Ctrl+Shift+K', 'Inline code'],
      ],
    },
    {
      title: 'Search & Shelf',
      items: [
        ['Ctrl+Enter', 'Submit search / add paper'],
      ],
    },
    {
      title: 'Command palette',
      items: [
        ['↑ ↓ j k', 'Navigate results'],
        ['Enter', 'Open selected'],
        ['Tab', 'Switch to commands'],
        ['>', 'App commands (home, shelf, settings)'],
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-[720px] p-8 font-sans">
      <h1 className="mb-2 text-3xl font-serif text-foreground">Help</h1>
      <p className="mb-10 text-sm text-muted">Keyboard shortcuts and commands.</p>

      <div className="space-y-10">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-4 text-sm font-semibold text-foreground uppercase tracking-wider">
              {section.title}
            </h2>
            <div className="space-y-2">
              {section.items.map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-baseline gap-4 py-2 border-b border-border/50 last:border-0"
                >
                  <kbd className="shrink-0 font-mono text-sm px-2.5 py-1 rounded-md bg-surface border border-border min-w-[140px]">
                    {key}
                  </kbd>
                  <span className="text-sm text-muted">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-12 text-sm text-muted">
        Press <kbd className="px-1.5 py-0.5 rounded bg-border font-mono text-sm">Space e</kbd> anytime to open this page.
      </p>
    </div>
  )
}
