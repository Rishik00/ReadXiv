# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Install all dependencies (run once after cloning):
```bash
npm run install:all
```

Start both frontend and backend in development mode:
```bash
npm run dev
```

- Frontend (React + Vite): http://localhost:5173
- Backend (Express): http://localhost:7474

Build frontend for production:
```bash
npm run build
```

Run as Electron desktop app (dev mode, requires the client dev server to already be running):
```bash
npm run electron:dev
```

Build distributable Electron app:
```bash
npm run electron:build
```

There are no automated tests in this project.

## Architecture

This is a **three-layer desktop app** called "Papyrus" (internal name) / "ReadXiv" (product name):

1. **`electron/`** — Electron shell. `main.js` spawns the Express server as a child process, waits for it to be healthy, then opens a `BrowserWindow`. In dev mode it loads `http://localhost:5173`; in production it loads `client/dist/index.html`. `preload.js` exposes `window.electron.apiUrl` so the client can point `axios` at the right base URL.

2. **`server/`** — Express backend (ES modules, port 7474). `db.js` manages a **sql.js** (pure-JS SQLite) database persisted at `~/.papyrus/papyrus.db`. Data also lives in `~/.papyrus/{pdfs,notes,canvas}/`. Routes:
   - `routes/arxiv.js` — `POST /api/arxiv/add`: fetches metadata from the arXiv Atom API, inserts a paper record with `status='loading'`, then downloads the PDF in the background (fire-and-forget) and updates `status` to `'queued'` or `'error'`.
   - `routes/papers.js` — CRUD for the `papers` table; `POST /api/papers/:id/access` bumps `last_accessed_at`.
   - `routes/search.js` — fuzzy search via Fuse.js over title/authors/abstract.
   - `routes/reader.js` — serves the paper + its markdown notes file; streams PDF bytes with range-request support; CRUD for `highlights` table.

3. **`client/`** — React 18 + Vite + Tailwind SPA. Navigation is **client-side state only** (no router): `App.jsx` holds `page` state (`'home' | 'shelf' | 'reader' | 'settings'`) and renders the matching page component.
   - **Home** — arxiv URL/ID input to add papers; shows recent papers.
   - **Shelf** — browse/filter all papers with fuzzy search.
   - **Reader** — split-pane view: left is `PdfViewer` (pdf.js canvas rendering with highlight draw mode), right is a markdown notes editor with live preview toggle. PDF poll-checks every 2 s while `status === 'loading'`. Notes auto-save with a 500 ms debounce via `PUT /api/reader/:id/notes`.
   - **Settings** — theme and font family selector; state persisted in `localStorage` under `papyrus-settings`.
   - **GlobalSearchPalette** — `Ctrl+P` command palette for paper/command search.
   - Keyboard shortcuts: `Ctrl+B` toggles sidebar, `Ctrl+K` / `Ctrl+Shift+K` focuses Home search, `Ctrl+P` opens palette.

## Theming

CSS custom properties defined in `client/src/index.css` under `[data-theme='...']` attributes (default, monochrome, citron-sage, etc.). `App.jsx` sets `document.documentElement.setAttribute('data-theme', ...)` from settings. Font family is similarly controlled via `data-font` attribute.

## Key Data Notes

- Paper IDs are bare arXiv IDs (e.g., `2301.07041`).
- `authors` and `tags` columns are stored as comma-separated strings and JSON strings respectively.
- The database is loaded entirely into memory by sql.js on startup and **written to disk synchronously** via `saveDB()` after every mutation.
- Notes are stored as plain `.md` files at `~/.papyrus/notes/<arxivId>.md`, not in the database.
