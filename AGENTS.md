# ReadXiv – Agent Map & Development Guide

This document is a **map** for any agent (or developer) working on ReadXiv. It describes the codebase structure, key files, conventions, and how to modify or resolve issues in each section.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Directory Structure](#directory-structure)
4. [Client (Frontend)](#client-frontend)
5. [Server (Backend)](#server-backend)
6. [Electron (Desktop)](#electron-desktop)
7. [Database](#database)
8. [CLI & Config](#cli--config)
9. [Design System](#design-system)
10. [API Reference](#api-reference)
11. [Keyboard Shortcuts](#keyboard-shortcuts)
12. [Known Issues & Planned Work](#known-issues--planned-work)
13. [Documentation References](#documentation-references)

---

## Project Overview

**ReadXiv** is a personal research companion for collecting and reading arXiv papers. It supports:

- Adding papers via arXiv URL/ID or PDF upload
- Split-pane Reader with PDF viewer + markdown notes
- Highlighting, quote extraction, and note templates
- Paper shelf with search, status, pagination
- Calendar view with deadlines and ICS export
- Global search palette (Ctrl+P) and recent papers (Ctrl+Shift+Y)
- Theme customization and feature toggles

**Stack:** React (Vite), Express, SQLite (sql.js), Electron (optional desktop), Tailwind CSS.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Electron (optional)                                            │
│  - Spawns Node server                                           │
│  - Loads Vite dev or built client                               │
│  - webview for external links                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│  Client (React/Vite)         │  Server (Express)                  │
│  - SPA with page state       │  - REST API on /api/*              │
│  - axios baseURL from        │  - SQLite via sql.js               │
│    electron.apiUrl in app   │  - ~/.papyrus/papyrus.db           │
└─────────────────────────────┴───────────────────────────────────┘
```

- **Web mode:** `npm run dev` → client on 5173, server on 7474
- **Electron mode:** Electron loads client, spawns server internally
- **CLI:** `readxiv` commands (init, start, add, remove, exportdb, etc.)

---

## Directory Structure

```
readxiv/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx         # Root: page state, routing, modals, toasts
│   │   ├── main.jsx        # Entry, axios baseURL, React mount
│   │   ├── index.css       # Themes, Tailwind, global styles
│   │   ├── components/     # Reusable UI
│   │   ├── pages/          # Route-level views
│   │   └── lib/            # Utilities (ics.js, utils.js)
│   ├── public/
│   └── vite.config.js
├── server/                 # Express API
│   ├── index.js            # App setup, routes, health check
│   ├── db.js               # SQLite init, migrations, saveDB
│   └── routes/             # arxiv, papers, reader, search
├── electron/               # Desktop app
│   ├── main.js             # Window, server spawn, IPC
│   └── preload.js          # Exposes electron APIs to renderer
├── lib/                    # CLI logic (commands, server-manager)
├── bin/                    # readxiv CLI entry
├── docs/                   # Planning docs (calendar, Google Calendar)
├── pages.md                # Detailed page/component documentation
├── features.md             # Feature ideas and priorities
├── bugs_ui.md              # UI improvement requests
└── AGENTS.md               # This file
```

---

## Client (Frontend)

### App.jsx – Central Hub

**File:** `client/src/App.jsx`

- **Page state:** `page` ∈ { home, shelf, reader, calendar, settings }
- **Navigation:** `navigateTo(target)` → `setPage`, `setHomeFocusNonce`, etc.
- **Keyboard shortcuts:** `g` + `h/s/k/c` (Search/Shelf/Calendar/Settings), Ctrl+P, Ctrl+K, Ctrl+Shift+Y, ?/Ctrl+/
- **Modals:** `GlobalSearchPalette`, `RecentPapersFinder`, help overlay
- **Toasts:** `addToast(message, type)` – success/error/info
- **Settings:** `papyrus-settings` in localStorage; `data-theme`, `data-font` on document
- **External tabs:** Electron `webview` for opened external URLs

**To add a new page:** Add route in `App.jsx`, update `navigateTo`, add to `GlobalSearchPalette` APP_COMMANDS, update help modal and keyboard handlers.

### Pages

| Page      | File                  | Route/Key   | Purpose                                      |
|-----------|-----------------------|-------------|----------------------------------------------|
| Home      | `pages/Home.jsx`       | `home`      | Search/add papers, arXiv URL/ID, PDF upload   |
| Shelf     | `pages/Shelf.jsx`      | `shelf`     | Paper grid, search, status, delete, schedule |
| Reader    | `pages/Reader.jsx`     | `reader`    | PDF + notes split pane, highlights, status    |
| Calendar  | `pages/Calendar.jsx`   | `calendar`  | PapersCalendar wrapper, deadlines, ICS export |
| Settings  | `pages/Settings.jsx`   | `settings`  | Themes, continuous scroll, markdown preview    |

### Components

| Component              | File                          | Purpose                                                                 |
|------------------------|-------------------------------|-------------------------------------------------------------------------|
| GlobalSearchPalette    | `GlobalSearchPalette.jsx`     | Ctrl+P command palette; paper search + app commands (home, shelf, etc.)  |
| RecentPapersFinder     | `RecentPapersFinder.jsx`     | Ctrl+Shift+Y modal; recent papers with j/k navigation                   |
| PdfViewer              | `PdfViewer.jsx`              | PDF.js renderer, zoom, highlights, recent quotes bar                    |
| PapersCalendar        | `PapersCalendar.jsx`         | Calendar with deadline dots, day panel, AddPaperModal, ICS export         |
| ModeToggle            | `ModeToggle.jsx`             | **Not currently used.** Segmented pill: Search | Shelf | Calendar | Settings |
| Sidebar               | `Sidebar.jsx`                | **Not in use.** Replaced by top-level navigation. Kept for reference.  |

**UI primitives:** `components/ui/` – button, card, calendar (react-day-picker), textarea, badge.

### Client Libraries

- **`lib/ics.js`** – `generateICS(papers)`, `downloadICS(papers, filename)` for calendar export
- **`lib/utils.js`** – cn() and other utilities

### Key Patterns

- **State:** Local `useState`; no global store. Props flow down from App.
- **API:** `axios.get/post/patch/delete` with relative `/api/*` paths (baseURL set in Electron)
- **Settings:** `localStorage.getItem('papyrus-settings')`; keys: `theme`, `fontFamily`, `continuousScroll`, `liveMarkdownPreview`

---

## Server (Backend)

### Entry & Routes

**File:** `server/index.js`

- Port: `process.env.PORT || 7474`
- Routes: `/api/papers`, `/api/search`, `/api/arxiv`, `/api/reader`
- Health: `GET /health`
- DB guard: 503 until `initDB()` completes

### Route Files

| Route       | File              | Endpoints                                                                 |
|-------------|-------------------|----------------------------------------------------------------------------|
| /api/papers | `routes/papers.js` | GET /, GET /recents, GET /:id, POST /, PATCH /:id, DELETE /:id, POST /upload |
| /api/search | `routes/search.js` | GET ?q= – fuzzy search (Fuse.js)                                           |
| /api/arxiv  | `routes/arxiv.js`  | GET /preview, POST /add                                                    |
| /api/reader | `routes/reader.js` | GET /:id, PUT /:id/notes, GET /:id/pdf, highlights CRUD                   |

### Papers PATCH Fields

`PATCH /api/papers/:id` accepts: `title`, `authors`, `abstract`, `status`, `tags`, `year`, `deadline`, `scheduled_date`.

---

## Electron (Desktop)

**Files:** `electron/main.js`, `electron/preload.js`

- **main.js:** Spawns Node server, creates BrowserWindow, loads Vite dev or built client
- **preload.js:** Exposes `window.electron` – `apiUrl`, `isElectron`, `showNotification`, `onOpenExternalTab`
- **External links:** `setWindowOpenHandler` → `open-external-tab` → webview tab bar in App

---

## Database

**File:** `server/db.js`  
**Path:** `~/.papyrus/papyrus.db`

### Schema

**papers**

| Column          | Type    | Notes                                      |
|-----------------|---------|--------------------------------------------|
| id              | TEXT PK | arXiv ID or `local-{hash}`                  |
| title, authors, abstract, url | TEXT |                            |
| pdf_path, pdf_url | TEXT  |                                            |
| source          | TEXT    | 'arxiv' | 'manual'                           |
| status          | TEXT    | 'queued' | 'reading' | 'done' | 'loading' | 'error' |
| tags            | TEXT    | JSON array                                 |
| year            | INTEGER |                                            |
| deadline        | TEXT    | ISO date (e.g. 2025-06-15)                  |
| scheduled_date  | TEXT    | ISO date                                   |
| created_at, updated_at, last_accessed_at | TEXT |                         |

**highlights**

| Column    | Type    |
|-----------|---------|
| id        | TEXT PK |
| paper_id  | TEXT FK |
| page      | INTEGER |
| text      | TEXT    |
| color     | TEXT    | default 'yellow' |
| rect_json | TEXT    |
| note      | TEXT    |
| created_at| TEXT    |

**Migrations:** `db.js` runs `ALTER TABLE` for `last_accessed_at`, `deadline`, `scheduled_date` if missing.

---

## CLI & Config

**Entry:** `bin/readxiv.mjs`  
**Commands:** `readxiv init`, `start:client`, `add`, `remove`, `show_db`, `exportdb`, `start_project`, `config get/set`

**Config:** `~/.papyrus/config.json` – `serverPort`, `clientPort`, `autoStartServer`, `defaultBrowser`, `exportDir`

---

## Design System

### Themes (`index.css`)

Applied via `document.documentElement.setAttribute('data-theme', id)`:

- `default` – Black & Orange
- `monochrome` – Black & White
- `citron-sage`, `slate`, `mist`, `forest`

### CSS Variables

- `--primary`, `--secondary`, `--button-on-secondary`
- `--background`, `--surface`, `--border`, `--muted`, `--foreground`
- `--font-sans`, `--font-mono`, `--font-serif`

### Fonts

- `data-font`: `brutalist` (default) or other; maps to font stack in CSS

---

## API Reference

| Method | Path                      | Purpose                          |
|--------|---------------------------|----------------------------------|
| GET    | /api/papers               | List all papers                  |
| GET    | /api/papers/recents?limit  | Recent papers by last_accessed   |
| GET    | /api/papers/:id            | Single paper                     |
| POST   | /api/papers               | Create paper                     |
| PATCH  | /api/papers/:id            | Update (status, deadline, etc.)  |
| DELETE | /api/papers/:id            | Delete paper                     |
| POST   | /api/papers/upload         | Upload PDF (multipart)           |
| POST   | /api/papers/:id/access     | Mark accessed (for recents)      |
| GET    | /api/search?q=             | Fuzzy search                     |
| GET    | /api/arxiv/preview?input=  | Preview metadata                 |
| POST   | /api/arxiv/add             | Add from arXiv URL/ID            |
| GET    | /api/reader/:id            | Paper + notes + hasPdf           |
| PUT    | /api/reader/:id/notes      | Save notes                       |
| GET    | /api/reader/:id/pdf        | Stream PDF                       |
| GET/POST/DELETE | /api/reader/:id/highlights | Highlights CRUD          |

---

## Keyboard Shortcuts

| Shortcut       | Action                          |
|----------------|----------------------------------|
| Ctrl+P         | Global search palette           |
| Ctrl+K         | Go home / focus search          |
| Ctrl+Shift+Y   | Recent papers modal             |
| ? or Ctrl+/    | Help modal                      |
| g h            | Go to Search                    |
| g s            | Go to Shelf                     |
| g k            | Go to Calendar                  |
| g c            | Go to Settings                  |
| Ctrl+Shift+C   | Copy paper link (Reader)        |
| Ctrl+B         | Bold (in notes)                 |
| Ctrl+1/2       | H1/H2 (in notes)                |
| Ctrl+Shift+L   | List item (in notes)            |
| Ctrl+Shift+K   | Inline code (in notes)         |

---

## Known Issues & Planned Work

### From `bugs_ui.md`

1. **Reader:** Remove top heading; add Ctrl+Shift+C toast "Paper link copied!" (implemented)
2. **PdfViewer:** Move page number to right, highlight controls to left
3. **Notes:** Remove formatting bar (H1, Code, etc.); map to shortcuts; global help
4. **PDF accessibility:** Improve ease of access
5. **Status dropdown:** Move elsewhere
6. **Notes label:** Remove "notes" text
7. **New Search bar:** Remove (if applicable)

### From `features.md`

- **Implemented:** Fast search (Ctrl+P), Recents (Ctrl+Shift+Y)
- **Planned:** Projects/literature survey, email recommendations, Vim bindings, multiple highlight colors, LaTeX, scheduled_date support in Calendar

### Calendar

- **Current:** `deadline` on papers; Calendar shows deadlines; ICS export; AddPaperModal to assign papers to dates
- **Planned (docs):** `scheduled_date`, Google Calendar OAuth, reading sessions, reminders

---

## Documentation References

| Document                         | Purpose                                      |
|---------------------------------|----------------------------------------------|
| `pages.md`                      | Detailed page/component specs, API usage    |
| `features.md`                   | Feature ideas and priorities                 |
| `bugs_ui.md`                    | UI improvement requests                     |
| `docs/calendar_plan.md`         | In-app calendar + ICS build plan             |
| `docs/google_calendar_integration.md` | Google Calendar OAuth, reminders, deadlines |

---

## Quick Reference: Where to Change What

| Task                         | Location(s)                                  |
|-----------------------------|-----------------------------------------------|
| Add a new page              | App.jsx, new file in pages/, GlobalSearchPalette |
| Add API endpoint            | server/routes/*.js, server/index.js           |
| Change DB schema            | server/db.js (migrations)                      |
| Add theme                   | client/src/index.css [data-theme='...']       |
| Add keyboard shortcut       | App.jsx (useEffect keydown)                    |
| Modify PDF viewer           | client/src/components/PdfViewer.jsx           |
| Modify notes editor         | client/src/pages/Reader.jsx                   |
| Calendar logic              | client/src/components/PapersCalendar.jsx      |
| ICS export                  | client/src/lib/ics.js                         |

---

*Last updated: March 2026*
