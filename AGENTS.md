# ReadXiv agent guide

This is the source-of-truth map for agents working on ReadXiv. Keep it concise,
current, and update it when navigation, settings, storage, or design-system
contracts change.

## Product and architecture

ReadXiv is a personal research companion for collecting, searching, reading,
annotating, and organizing research papers.

- Client: React 18, Vite, Tailwind CSS.
- Server: Express and SQLite through `sql.js`.
- Desktop: Electron, which starts the server and loads the built client.
- CLI: `bin/readxiv.mjs` with command implementations in `lib/commands/`.
- Local data: `~/.papyrus/`.

Development commands:

```text
npm run dev       client on 5173 and server on 7474
npm run build     production client build
npm run electron:dev  desktop app with the Vite development server
$env:READXIV_USE_BUILT_CLIENT=1; npm run electron  desktop app against client/dist
cd server && npm test
```

## Current source map

```text
client/src/
  App.jsx                         navigation, global settings, shortcuts, toasts
  main.jsx                        React entry, instrumentation, bundled fonts
  index.css                       global tokens and specialized feature CSS
  pages/
    Home.jsx                      add/import papers and dashboard
    SearchWorkbench.jsx           library search, dossier, actions
    Reader.jsx                    PDF/notes workspace and references
    Collections.jsx               collection management
    Settings.jsx                  integrations and application preferences
    Help.jsx                      keyboard and configuration reference
  components/
    EditorialLanding.jsx          Home reading dashboard
    PdfViewer.jsx                 PDF.js rendering and highlights
    ReaderPdfFloatingToolbar.jsx  Reader controls
    CollectionAssignModal.jsx
    TodoistTaskModal.jsx
    ui/                            reusable UI primitives

server/
  index.js                        server setup and route registration
  db.js                           schema, migrations, persistence
  routes/                         API modules
  readingSessions.js              reading-session lifecycle
  backup.js                       scheduled database backups

electron/
  main.js                         window and server lifecycle
  preload.js                      renderer bridge
```

Do not rely on older planning documents for the active page list. Inspect
`client/src/App.jsx` and `server/index.js` when navigation or routes matter.

## Client behavior contracts

- `App.jsx` owns the current page; there is no routing library or global store.
- Preserve keyboard-first navigation and do not capture shortcuts while the
  user is typing in an input or editor.
- API calls use relative `/api/*` URLs. Electron sets Axios's base URL from
  `window.electron.apiUrl`.
- Settings are stored in `localStorage` under `papyrus-settings`.
- The document receives `data-theme`, `data-font`, and `data-notes-font`.
- External links can become Electron webview tabs; do not replace that flow
  with browser-only behavior.
- Reader changes must preserve PDF rendering, highlighting, split resizing,
  notes autosave, references, and reading-session instrumentation.

Current pages:

| Page key | Component | Layout class |
|---|---|---|
| `home` | `pages/Home.jsx` | immersive/full viewport |
| `search` | `pages/SearchWorkbench.jsx` | workbench/full viewport |
| `reader` | `pages/Reader.jsx` | reader/full viewport |
| `collections` | `pages/Collections.jsx` | standard page |
| `settings` | `pages/Settings.jsx` | standard page |
| `help` | `pages/Help.jsx` | standard page |

## Design-system contract

ReadXiv should remain quiet, editorial, and suited to long research sessions.
Standardization is not permission to redesign working surfaces.

### Fonts

- The app bundles fonts locally through Fontsource imports in `main.jsx`; do
  not add a runtime Google Fonts import.
- `--font-ui` and `--font-display` are controlled together by `data-font`.
- DM Sans is the default. Fraunces remains the selectable editorial option.
- `--font-code` is JetBrains Mono and is reserved for code, paper IDs,
  keyboard shortcuts, and tabular technical data.
- The notes override remains independent. `data-notes-font='current'` must
  inherit the global font choice.
- Color themes must not silently override fonts. If a future theme/font preset
  is desired, implement it explicitly in settings rather than coupling CSS
  selectors accidentally.

### Type sizes

Use the simple global scale. Do not introduce a new literal size when one of
these categories is adequate:

| Category | CSS variable | Tailwind class |
|---|---|---|
| Very small | `--font-size-very-small` | `text-very-small` |
| Small | `--font-size-small` | `text-small` |
| Medium | `--font-size-medium` | `text-medium` |
| Large | `--font-size-large` | `text-large` |
| Very large | `--font-size-very-large` | `text-very-large` |
| Extra large | `--font-size-extra-large` | `text-extra-large` |
| Home display only | `--font-size-display` | `text-display` |

Routine interface text must not be smaller than 12px. Preserve mathematical,
PDF, and third-party editor sizing when their rendering depends on it.

### Colors

Use semantic variables rather than raw colors for application chrome:

```text
--canvas                 application background
--surface-1              ordinary raised surface
--surface-2              stronger raised/selected surface
--text                   primary text
--text-muted             secondary text
--text-subtle            lowest allowed text emphasis
--accent / --on-accent   interactive accent and its foreground
--divider                decorative separation
--control-border         load-bearing control boundary
--focus-ring             keyboard focus
--success / --warning / --danger
```

`--background`, `--surface`, `--border`, `--foreground`, `--muted`, and
`--secondary` are temporary compatibility aliases. New code should use the
semantic names. Collection colors and PDF highlight colors are domain palettes
and should remain separate from application semantics.

Text tokens must meet WCAG AA. Control boundaries and focus indicators must
meet 3:1 against adjacent surfaces. Do not reduce text contrast with opacity.

### Spacing, shape, and elevation

- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px.
- Radius scale: 4px small, 8px medium, 12px large, full for pills.
- The 2px PDF page/highlight radius is an intentional specialized exception.
- Use `--elevation-1`, `--elevation-2`, and `--elevation-3`; avoid new bespoke
  black-alpha shadows.
- Use `--overlay-scrim` for modal backdrops.

### Layout

Standard pages should converge on:

```text
PageShell
  PageHeader
  page content
```

The shell owns horizontal gutters and vertical page spacing. A page may select
a content width but must not add a second competing outer container.

Available widths:

```text
--content-small        720px
--content-medium       800px
--content-large       1024px
--content-extra-large 1120px
--reading-measure      720px
--page-gutter          responsive 16-40px
```

Every page must avoid horizontal overflow and unintended nested vertical
scrolling. Full-viewport Home, Workbench, and Reader may use specialized shells
but must still consume the shared tokens. Test changes at approximately 1280,
1024, 900, and 620px.

### Components

Prefer primitives in `client/src/components/ui/` for repeated controls.

Available now:

- `PageShell`, `PageHeader`
- `Button`
- `Input`, `Select`, `Textarea`
- `Card`
- `Modal`
- `SettingRow`
- `Badge`

Still candidates when repeated use cases justify them: `IconButton`, `Panel`,
`StatusBadge`, `Kbd`, and `EmptyState`.

Extend a primitive when multiple pages need the same behavior. Do not create a
generic abstraction for a one-off Reader/PDF mechanism. Dynamic inline styles
are appropriate for values such as split width, chart coordinates, highlight
rectangles, and animation progress; static visual declarations belong in
tokens, utilities, or components.

### Focus and accessibility

- Every interactive element must expose a visible `:focus-visible` state.
- Never remove an outline unless an equal or stronger focus indicator replaces
  it.
- Keyboard focus, selected state, hover, and disabled state are different and
  must not rely on one low-contrast border token.
- Icon-only buttons require an accessible name.
- Respect `prefers-reduced-motion` for nonessential motion.

## Server and data safety

- `server/index.js` registers `/api/papers`, `/api/search`, `/api/arxiv`,
  `/api/reader`, `/api/todoist`, `/api/semantic-scholar`,
  `/api/instrumentation`, `/api/dashboard`, `/api/backup`, `/api/publish`, and
  `/api/collections`.
- Schema changes require an idempotent migration in `server/db.js`.
- Never delete or rewrite the user's `~/.papyrus/papyrus.db` during tests.
- Keep tokens and API keys out of source; Settings persists integration config
  through server routes, with environment variables taking precedence.

## Required validation

Use checks proportional to the change. For UI-system work, the minimum is:

1. `npm run build`.
2. `cd server && npm test` when server behavior was touched.
3. Keyboard traversal of affected controls.
4. Desktop and narrow-window checks for affected pages.
5. Electron/offline check when fonts, asset paths, startup, or preload behavior
   changed.
6. Reader smoke test when shared styles can reach the Reader.

Before deleting apparently unused CSS, verify third-party markup, dynamically
constructed class names, and Electron-only states. Report any visual or
behavioral regression immediately; do not hide it inside a cleanup.

## Working rules

- Preserve unrelated user changes in the worktree.
- Prefer small, reviewable migrations over a single design-system rewrite.
- Do not combine UI standardization with product behavior changes.
- Update this file when a new page, route, setting, token category, or durable
  UI convention is introduced.
