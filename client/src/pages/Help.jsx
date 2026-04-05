export default function Help({ setPage }) {
  const sections = [
    {
      title: 'Navigation',
      items: [
        ['Ctrl+P', 'Command palette — search papers & navigate'],
        ['Ctrl+K', 'Go home / focus search bar'],
        ['Space e', 'Open Help (from Search, Shelf, … — in reader: notes-only layout)'],
        ['Space h', 'Go to Search'],
        ['/', 'On home: open command menu (/search, /add, …)'],
        [
          '/p/<paper-id>',
          'Open a paper directly in the reader (e.g. http://localhost:5173/p/2401.12345; use your dev port if different)',
        ],
        ['Space s', 'Go to Shelf'],
        ['Space c', 'Go to Settings'],
        ['Space f', 'Recent papers'],
        ['Space f b', 'Search panel (library search)'],
        ['Esc', 'Blur search bar'],
      ],
    },
    {
      title: 'Reader',
      items: [
        ['Ctrl+Shift+M', 'Toggle PDF / notes panel'],
        ['Space q', 'PDF-only layout'],
        ['Space w', 'Split view'],
        ['Space e', 'Notes-only layout'],
        ['Space m', 'Maximize PDF panel'],
        ['Space n', 'Minimize PDF panel'],
        ['Space o', 'Toggle reader floating toolbar'],
        ['Space t', 'PDF: open go-to-page menu (toolbar)'],
        ['Space b h', 'Toggle PDF dark mode'],
        ['Ctrl+Shift+S', 'Copy current page to clipboard'],
        ['Ctrl+Shift+C', 'Copy paper link'],
        ['Ctrl+Shift+D', 'PDF zoom in'],
        ['Ctrl+Shift+F', 'PDF zoom out'],
      ],
    },
    {
      title: 'Notes',
      items: [
        ['Preview math', '$$…$$ = inline; $$$$…$$$$ = block (newline). Also $…$, \\(…\\), \\[…\\]'],
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
        ['Home: /search', 'Result rows show Todoist status when the paper is linked; otherwise NOT IN TODOIST'],
        ['Shelf: Schedule', 'Schedule or Edit schedule: due date & priority in Todoist (configure under Settings)'],
      ],
    },
    {
      title: 'Canvas',
      items: [
        ['Space k a', 'Open global canvas'],
        ['Space h', 'Exit canvas (go home)'],
        ['Esc', 'Exit canvas'],
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

      <div className="mt-10">
        <h2 className="mb-4 text-sm font-semibold text-foreground uppercase tracking-wider">
          Todoist
        </h2>
        <p className="text-sm text-muted mb-3">
          On the Paper Shelf, Schedule / Edit schedule opens a short dialog to set due date and priority (Todoist’s P1–P4) when adding a paper to Todoist, or to update an existing link.
          Complete tasks in Todoist when you’re done. The server calls Todoist for you; your API token never goes to the browser.
        </p>
        <ul className="text-sm text-muted list-disc pl-5 space-y-2">
          <li>
            Open <kbd className="px-1.5 py-0.5 rounded bg-border font-mono text-xs">Space c</kbd> Settings →{' '}
            <span className="font-medium text-foreground">Todoist</span>. Paste your API token once (from Todoist → Integrations),
            fetch projects, pick <span className="font-medium text-foreground">Inbox</span> or a project—or use{' '}
            <span className="font-medium text-foreground">Create / use “ReadXiv Todoist”</span>—then Save. Tokens are written only to{' '}
            <code className="font-mono text-xs">~/.papyrus/config.json</code> on the server; they are not stored in browser localStorage.
          </li>
          <li>
            Optional overrides: <code className="font-mono text-xs">TODOIST_API_TOKEN</code> and{' '}
            <code className="font-mono text-xs">TODOIST_PROJECT_ID</code> in the server environment take precedence over the saved file.
          </li>
          <li>
            If Shelf shows <span className="font-medium text-foreground">410 Gone</span> when adding a task, Todoist retired the old REST v2 API—restart
            the ReadXiv server after pulling the latest code so it uses the current Todoist API.
          </li>
        </ul>
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-sm font-semibold text-foreground uppercase tracking-wider">
          Semantic Scholar (References)
        </h2>
        <p className="text-sm text-muted mb-3">
          In the Reader, the References tab loads cited papers from Semantic Scholar&apos;s API. An optional API key
          improves rate limits; you can add it under Settings → Semantic Scholar (saved to{' '}
          <code className="font-mono text-xs">~/.papyrus/config.json</code>
          ). <code className="font-mono text-xs">SEMANTIC_SCHOLAR_API_KEY</code> in the server environment overrides
          the saved key if set.
        </p>
      </div>

      <p className="mt-12 text-sm text-muted">
        From Search, Shelf, and other pages (not the reader), press{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-border font-mono text-sm">Space e</kbd> to open Help. In the reader,{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-border font-mono text-sm">Space e</kbd> switches to notes-only layout.
      </p>
    </div>
  )
}
