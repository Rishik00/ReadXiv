# TLDraw Canvas View - Implementation Summary

**Date:** March 17, 2026  
**Status:** ✅ Complete

## Overview

Successfully implemented the TLDraw Canvas View feature as specified in `tldraw-canvas-view.md`. The feature allows users to selectively send PDF pages to a canvas for visual reasoning and annotation.

## What Was Implemented

### 1. Dependencies
- ✅ Added `tldraw` package to client dependencies
- ✅ No breaking changes to existing packages

### 2. Backend (Server)
- ✅ Added `GET /api/reader/:id/canvas` endpoint - loads canvas JSON or returns empty object
- ✅ Added `PUT /api/reader/:id/canvas` endpoint - saves canvas state to `~/.papyrus/canvas/{id}.json`
- ✅ Canvas directory already initialized in `db.js`

### 3. Client Utilities
- ✅ `client/src/utils/pdfPageToImage.js` - Renders PDF pages to PNG using pdfjs
- ✅ `client/src/utils/canvasAddImage.js` - Headless canvas updates (adds images without mounting UI)

### 4. Components
- ✅ `client/src/components/CanvasView.jsx` - TLDraw editor with:
  - Dark mode forced
  - Auto-save to API (1 second throttle)
  - Loads existing canvas state on mount
  
- ✅ `client/src/components/PdfViewer.jsx` - Enhanced with:
  - "→ Canvas" button on each page (appears on hover)
  - Sends page to canvas via headless store update
  - Loading state during send operation

### 5. Reader Integration
- ✅ `client/src/pages/Reader.jsx` - Added:
  - PDF/Canvas view toggle buttons
  - Conditional rendering based on `viewMode` state
  - Toast notification when page sent to canvas
  - Preserves all existing functionality

## Key Features

1. **User-Driven Curation**: Users click "→ Canvas" on specific PDF pages they want to work with
2. **Headless Updates**: Pages can be sent to canvas even when canvas view is not mounted
3. **Persistent State**: Canvas state saved to disk and synced across sessions
4. **No Breaking Changes**: Existing PDF reader functionality fully preserved
5. **Dark Mode Canvas**: TLDraw forced to dark mode for consistency

## How It Works

1. User opens a paper in the Reader
2. User hovers over a PDF page and clicks "→ Canvas" button
3. Page is rendered to PNG at 2x scale for quality
4. Image is added to canvas JSON via headless TLDraw store
5. Canvas state saved to `~/.papyrus/canvas/{paperId}.json`
6. User switches to Canvas view to see all sent pages
7. Canvas auto-saves any edits/annotations

## Files Changed

### New Files
- `client/src/components/CanvasView.jsx`
- `client/src/utils/pdfPageToImage.js`
- `client/src/utils/canvasAddImage.js`

### Modified Files
- `client/package.json` - Added tldraw dependency
- `server/routes/reader.js` - Added canvas endpoints
- `client/src/components/PdfViewer.jsx` - Added send to canvas button
- `client/src/pages/Reader.jsx` - Added view toggle and canvas integration

## Testing

- ✅ Dev server starts without errors
- ✅ No linter errors
- ✅ No breaking changes to existing reader functionality
- ✅ All imports and dependencies resolved correctly

## Notes

- The implementation follows the plan exactly as specified
- TLDraw bundle is ~1MB but loads efficiently
- Canvas state is stored as JSON for easy backup/sync
- Images stored as data URLs in canvas JSON (prototype approach)
- Future optimization: Consider lazy-loading TLDraw only when needed

## Next Steps (Optional Enhancements)

1. Add keyboard shortcut to toggle between PDF/Canvas views
2. Add "Clear canvas" button
3. Show page number labels on canvas images
4. Add ability to remove individual pages from canvas
5. Consider lazy-loading TLDraw to reduce initial bundle size
