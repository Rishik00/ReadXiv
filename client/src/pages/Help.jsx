export default function Help() {
  const sections = [
    {
      title: 'Navigation',
      items: [
        ['Ctrl+P', 'Command palette - search papers and navigate'],
        ['Ctrl+K', 'Open Library'],
        ['Space h', 'Go home'],
        ['Space l', 'Open Library'],
        ['Space ,', 'Go to Settings'],
        ['Space g', 'Open Help'],
        ['b', 'Go back (outside text inputs and notes)'],
        ['t', 'On home: toggle the desk between Reading and Stats'],
        ['/', 'On home: open the slash command menu'],
        ['Esc', 'Close overlay or go back one surface'],
      ],
    },
    {
      title: 'Library',
      items: [
        ['Home: /library', 'Launch Library with an optional query'],
        ['Home: /search', 'Alias for Library'],
        ['j / k', 'Move result selection'],
        ['Arrow keys', 'Move selection or switch panels'],
        ['Enter / o', 'Open selected paper in the reader'],
        ['Tab', 'Toggle the actions rail'],
        ['h / l', 'Move focus between results, details, and actions'],
        ['Open in browser', 'Use the selected paper action'],
        ['n', 'Open the selected paper’s published notes'],
        ['s / d / f / Delete', 'Status, schedule, offline, delete on the selected paper'],
        ['[ / ]', 'Previous / next result page'],
      ],
    },
    {
      title: 'Reader',
      items: [
        ['Ctrl+Shift+M', 'Toggle PDF / notes panel'],
        ['Space 1 / 2 / 3', 'PDF only, split, notes only'],
        ['Space m / n', 'Maximize or minimize PDF panel'],
        ['Space o', 'Toggle reader floating toolbar'],
        ['Space t', 'Open PDF page jump menu'],
        ['Space b', 'Toggle PDF dark mode'],
        ['Ctrl+Shift+C', 'Copy paper link'],
        ['Ctrl+Shift+S', 'Copy current page to clipboard'],
      ],
    },
    {
      title: 'Notes',
      items: [
        ['Ctrl+Shift+B', 'Bold'],
        ['Ctrl+Shift+1 / 2', 'Heading 1 / 2'],
        ['Ctrl+Shift+L', 'List item'],
        ['Ctrl+Shift+K', 'Inline code'],
      ],
    },
    {
      title: 'Command Palette',
      items: [
        ['Up / Down / j / k', 'Navigate results'],
        ['Enter', 'Open selected result'],
        ['Tab', 'Switch between paper search and app commands'],
        ['>', 'Search commands like home, library, settings'],
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
                  <kbd className="shrink-0 font-mono text-sm px-2.5 py-1 rounded-md bg-surface border border-border min-w-[160px]">
                    {key}
                  </kbd>
                  <span className="text-sm text-muted">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-sm font-semibold text-foreground uppercase tracking-wider">
          Todoist
        </h2>
        <p className="text-sm text-muted mb-3">
          In Library, Schedule / Edit schedule opens a short dialog to set due date and priority when adding a paper to Todoist, or to update an existing link.
          Complete tasks in Todoist when you are done. The server calls Todoist for you; your API token never goes to the browser.
        </p>
      </div>

      <p className="mt-12 text-sm text-muted">
        From Home, Library, and other pages outside the reader, press{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-border font-mono text-sm">Space g</kbd> to open Help.
      </p>
    </div>
  )
}
