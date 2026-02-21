# Papyrus — Execution Plan

> **Papyrus** — A personal research companion. Capture papers, read them with highlights and notes, publish your thinking.
> 

---

## What We're Building

Papyrus is a local-first research tool for people who read a lot of papers. The core loop is simple: paste an arxiv link → it gets fetched and stored → you read it in a clean PDF viewer with highlights → you take notes alongside it → optionally publish those notes. No clutter, no 6-app juggling act.

**Design reference:** Linear's sidebar and navigation structure. Minimal, dark, fast. shadcn/ui components throughout — neutral dark theme, clean typography, no decorative noise.

**Wireframe:** Available as a local HTML file in Cursor. Ask Rishi for `papyrus-wireframe.html` before starting UI work.

**shadcn component library:** Rishi has a local component set — ask for the components directory before wiring up UI. Use those, don't install new ones unless unavoidable.

---

## Tech Stack

Speed of iteration is the priority. Everything below is chosen so agents can move fast and the app stays lightweight.

- **Framework:** React (Vite) — not Electron, not Tauri yet. Web-first for rapid iteration.
- **UI:** shadcn/ui + Tailwind CSS. Neutral dark theme. All components from Rishi's local library.
- **Database:** SQLite via `better-sqlite3` — runs locally, zero setup, fast reads.
- **PDF rendering:** PDF.js — battle-tested, no native deps.
- **Backend (thin):** Express.js local server to handle PDF downloads, SQLite writes, and file I/O. The React frontend talks to this over [localhost](http://localhost).
- **Search:** Fuse.js for fuzzy search over the paper library.
- **Notes:** Plain `.md` files on disk, editable in any editor (Obsidian-compatible).

The app runs as: `npm run dev` (Vite frontend) + `node server.js` (Express backend). No compilation step, no signing, no build pipeline for now.

---

## File Structure

```
papers are stored at ~/.papyrus/
├── papyrus.db
├── pdfs/
├── notes/           # one .md per paper, plain markdown
├── canvas/
└── config.json

repo structure:
├── client/          # React + Vite
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
├── server/          # Express
│   ├── index.js
│   ├── routes/
│   └── db.js        # better-sqlite3 wrapper
└── package.json
```

---

## Database Schema

```sql
CREATE TABLE papers (
  id TEXT PRIMARY KEY,          -- arxiv ID or hash
  title TEXT NOT NULL,
  authors TEXT,
  abstract TEXT,
  url TEXT,
  pdf_path TEXT,
  pdf_url TEXT,
  source TEXT,                  -- 'arxiv' | 'openreview' | 'manual'
  status TEXT DEFAULT 'queued', -- 'queued' | 'reading' | 'done'
  tags TEXT DEFAULT '[]',       -- JSON array
  year INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE highlights (
  id TEXT PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id),
  page INTEGER,
  text TEXT,
  color TEXT DEFAULT 'yellow',
  rect_json TEXT,
  note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Execution Plan

The goal is a working website in 2–3 days that Rishi can actually use. Three features ship first. Everything else is secondary.

### Stage 1 — Core Three Features (Days 1–3)

These three things need to work end-to-end before anything else is touched.

**1. Paper Database (Shelf)**

A table view of all papers in the SQLite database. Each row shows: title, authors, year, status (queued / reading / done), tags, and date added. Clicking a row opens the reader. The table uses shadcn's Table component, styled to match the dark theme. Columns are sortable. Pagination is not needed in v1 — render all rows.

**2. PDF Reader**

A split-pane view: PDF on the left, notes on the right. The PDF is rendered via PDF.js embedded in an iframe or web worker — it should never block the UI. Page navigation and zoom controls are required. Text selection in the PDF triggers a highlight action (save to SQLite with page + text + rect). Highlights persist across sessions and are re-rendered on PDF load. The notes pane is a simple textarea that auto-saves to the paper's `.md` file on disk (debounced, 500ms). The split pane is resizable.

**3. Search Bar**

A single input on the Home page (centered, [claude.ai](http://claude.ai) style). It accepts: an arxiv URL, a bare arxiv ID (e.g. `2301.07041`), or a search query against the existing library. If an arxiv URL or ID is detected, it fetches metadata from the arxiv API, downloads the PDF to `~/.papyrus/pdfs/`, creates a blank `notes.md`, inserts the record into SQLite, and navigates to the Reader. If it's a search query, it runs Fuse.js against the local library and shows results inline. A loading state is shown during fetch. Errors (invalid URL, network failure) are shown as shadcn toasts.

---

### Stage 2 — Web App Polish (Days 4–6)

Once the three core features are working, the focus shifts to making the web app actually pleasant to use every day.

The sidebar needs proper navigation between Home, Shelf, and Reader with breadcrumbs showing the current paper. A command palette (⌘K, using cmdk) should let you jump between papers, add a new one, or change a paper's status without touching the mouse. Status and tag filtering on the shelf should work via dropdown menus. The reader needs highlight color options (yellow, blue, green, pink) and an annotations panel that lists all highlights for the current paper — clicking one scrolls the PDF to that position.

---

### Stage 3 — Desktop App (Days 7–10)

Once the web version is stable and Rishi has used it for a few days, wrap it in Tauri v2. The Express server becomes a Tauri sidecar. The React frontend stays identical. Tauri adds: native file system access without a running server, system tray, global keyboard shortcuts, and a proper app bundle.

If the Tauri bundle ends up over 100MB, evaluate switching the PDF renderer or trimming PDF.js. Target is under 80MB installed.

---

### Stage 4 — Browser Extension (Later)

A Chrome MV3 extension that detects paper pages on arxiv, OpenReview, and Semantic Scholar. ⌘⇧P opens a popup with auto-filled metadata. It POSTs to the local Express server (or Tauri sidecar) at `localhost:7474`. If the app isn't running, it queues the capture in extension storage and syncs on reconnect. The extension UI matches Papyrus's dark theme.

---

### Stage 5 — Mobile (Not Now)

Deprioritized entirely. Revisit after the desktop app ships. Likely a read-only PWA — browse library, read notes, no PDF rendering.

---

## Design System Notes

A few concrete decisions agents should not deviate from:

- Background: `#0a0a0a`. Surface: `#111111`. Border: `#1f1f1f`. Text: `#e5e5e5`. Muted: `#737373`.
- Font: Inter for UI, JetBrains Mono for IDs and code snippets.
- All interactive elements use shadcn components from Rishi's local library — don't reach for external UI packages.
- Sidebar is fixed, narrow (240px), icon + label navigation. Collapsible on small screens.
- No gradients, no shadows except subtle `box-shadow: 0 1px 3px rgba(0,0,0,0.5)` on cards.
- Animations only where they aid comprehension — page transitions, loading states. No decorative motion.

**Design inspiration:**

- Linear — sidebar structure, keyboard-first navigation, command palette
- Notion — split-pane document editing feel
- Bear — clean typography and note-taking flow

---

## Component Library

All UI is built from these shadcn components. Don't install alternatives — use exactly these. Links go to the official docs for each.

| Component | Link | Used For |
| --- | --- | --- |
| **Sidebar** | [https://ui.shadcn.com/docs/components/radix/sidebar](https://ui.shadcn.com/docs/components/radix/sidebar) | Main app navigation — Home, Shelf, Reader, Canvas |
| **Command** | [https://ui.shadcn.com/docs/components/radix/command](https://ui.shadcn.com/docs/components/radix/command) | ⌘K command palette — jump to papers, change status, add new |
| **Button** | [https://ui.shadcn.com/docs/components/radix/button](https://ui.shadcn.com/docs/components/radix/button) | All interactive buttons throughout the app |
| **Breadcrumb** | [https://ui.shadcn.com/docs/components/radix/breadcrumb](https://ui.shadcn.com/docs/components/radix/breadcrumb) | Reader header — Home › Shelf › Paper Title |
| **Calendar** | [https://ui.shadcn.com/docs/components/radix/calendar](https://ui.shadcn.com/docs/components/radix/calendar) | Date picker for filtering shelf by date added |
| **Navigation Menu** | [https://ui.shadcn.com/docs/components/radix/navigation-menu](https://ui.shadcn.com/docs/components/radix/navigation-menu) | Top-level nav fallback if sidebar is collapsed |
| **Pagination** | [https://ui.shadcn.com/docs/components/radix/pagination](https://ui.shadcn.com/docs/components/radix/pagination) | Shelf table — if paper count grows past ~100 rows |
| **Typography** | [https://ui.shadcn.com/docs/components/radix/typography](https://ui.shadcn.com/docs/components/radix/typography) | Base text styles — headings, body, muted, code |
| **Hover Card** | [https://ui.shadcn.com/docs/components/radix/hover-card](https://ui.shadcn.com/docs/components/radix/hover-card) | Paper title hover in shelf — shows abstract preview |
| **Dropdown Menu** | [https://ui.shadcn.com/docs/components/radix/dropdown-menu](https://ui.shadcn.com/docs/components/radix/dropdown-menu) | Status filter, tag filter, right-click context menu on shelf rows |

---

## Open Questions

These are unresolved. Don't make decisions on these without checking with Rishi.

- Domain name: `papyrus.sh` / `papyrus.dev` / `getpapyrus.com`?
- Multi-device sync: Turso (distributed SQLite) as a future option?
- Should Canvas (tldraw concept mapping) be in Stage 2 or Stage 3?
- TTS: Web Speech API or Piper for offline?