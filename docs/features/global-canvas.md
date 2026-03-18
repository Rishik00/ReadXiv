# Global Canvas Feature

## Overview

A global tldraw canvas that can be accessed from anywhere in the app using the keyboard shortcut **Space + K + A**.

## Features

- **Full-screen canvas**: Takes up the entire viewport when opened
- **Dark mode**: Always loads in dark mode
- **Persistent state**: Canvas state is automatically saved to `~/.papyrus/canvas/global.json`
- **Auto-save**: Changes are automatically saved after 1 second of inactivity
- **Keyboard shortcuts**:
  - `Space + K + A` - Open global canvas
  - `Esc` - Close canvas

## Implementation Details

### Frontend Components

- **GlobalCanvas.jsx**: Main canvas component that:
  - Renders tldraw in a full-screen overlay
  - Loads canvas state from API on mount
  - Auto-saves changes with 1-second throttle
  - Forces dark mode via tldraw preferences
  - Handles Escape key to close

### Backend API

- **GET /api/canvas/global**: Load global canvas state
- **PUT /api/canvas/global**: Save global canvas state

### Files Added/Modified

1. `client/src/components/GlobalCanvas.jsx` - New component
2. `server/routes/canvas.js` - New API routes
3. `server/index.js` - Added canvas router
4. `client/src/App.jsx` - Added keyboard shortcut handler and canvas state
5. `client/src/pages/Help.jsx` - Added keyboard shortcut documentation
6. `client/package.json` - Added tldraw dependency

## Usage

1. Press `Space` to enter leader mode
2. Press `K` to enter canvas mode
3. Press `A` to open the global canvas
4. Draw, sketch, or take notes on the canvas
5. Press `Esc` to close and return to the app

All changes are automatically saved and will persist across sessions.
