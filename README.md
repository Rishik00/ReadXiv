# Papyrus

A personal research companion for reading papers.

## Quick Start

### Installation

1. Install all dependencies:
```bash
npm run install:all
```

**Note:** We use `sql.js` (pure JavaScript SQLite) which works on all platforms without native compilation!

2. Start the development servers:
```bash
npm run dev
```

This will start:
- Frontend (React + Vite) on http://localhost:5173
- Backend (Express) on http://localhost:7474

## Project Structure

```
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
├── server/          # Express backend
│   ├── index.js
│   ├── routes/
│   └── db.js
└── package.json
```

## Features

- **Paper Database**: SQLite-based storage for papers
- **Search**: Fuzzy search using Fuse.js
- **Arxiv Integration**: Add papers by URL or ID
- **PDF Reader**: (Coming soon) PDF.js integration

## Data Storage

Papers are stored in `~/.papyrus/`:
- `papyrus.db` - SQLite database
- `pdfs/` - Downloaded PDF files
- `notes/` - Markdown notes (one per paper)
- `canvas/` - Canvas files

## API Endpoints

- `GET /api/papers` - List all papers
- `GET /api/papers/:id` - Get single paper
- `POST /api/papers` - Create paper
- `POST /api/arxiv/add` - Add paper from arxiv URL/ID
- `GET /api/search?q=query` - Search papers
- `GET /health` - Health check
