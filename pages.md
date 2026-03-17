# Pages Documentation

This document provides a detailed reference for each page and component in ReadXiv, intended for future design iterations and development reference.

---

## Table of Contents

1. [Home Page](#home-page)
2. [Paper Shelf Page](#paper-shelf-page)
3. [Reader Page](#reader-page)
4. [Settings Page](#settings-page)
5. [Sidebar Component](#sidebar-component)
6. [Global Search Palette](#global-search-palette)

---

## Home Page

**File:** `client/src/pages/Home.jsx`  
**Route:** `/` (default page)  
**Keyboard Shortcut:** `Ctrl+K` or `Ctrl+Shift+K`

### Overview

The Home page serves as the primary entry point for adding new papers and searching the library. It features a minimalist, centered design with a prominent search/input field.

### Key Features

#### 1. **Dynamic Greeting**
- Displays a rotating greeting message based on the day of year and hour
- Examples: "What papers are we conquering today?", "Ready to fall down a citation rabbit hole?", "Your brain is a sponge. Feed it papers."
- Provides a personalized, friendly entry point

#### 2. **Multi-Mode Input Field**
The main input field supports multiple input types:

- **arXiv URL**: Full URLs like `https://arxiv.org/abs/2401.12345`
- **arXiv ID**: Bare IDs like `2401.12345` (matches pattern `^\d{4}\.\d+`)
- **Search Query**: Any other text triggers a fuzzy search of the paper shelf
- **Commands**: Special commands like `/howto` and `/bindings` show help panels

**Input Detection Logic:**
```javascript
- Contains 'arxiv.org' → arxiv URL
- Matches /^\d{4}\.\d+/ → arxiv ID
- Starts with '/' → command
- Length > 2 → search query
```

#### 3. **PDF Upload**
- Upload button (arrow icon) allows direct PDF file upload
- Supports `.pdf` files
- Automatically extracts metadata or creates a new paper entry
- Shows success/error toasts

#### 4. **Background Processing**
- When adding an arXiv paper, the system:
  1. Immediately returns paper metadata
  2. Starts background PDF download
  3. Polls every 2.5 seconds for PDF status
  4. Shows notification when PDF is ready (Electron only)
  5. Times out after ~5 minutes (120 attempts)

#### 5. **Help Panels**
- **`/howto`**: Shows supported input formats and usage
- **`/bindings`**: Displays keyboard shortcuts and navigation tips

### Visual Design

- **Layout**: Centered, max-width 800px container
- **Input Field**: Large textarea with focus glow effect (secondary color)
- **Focus State**: Enhanced border and shadow when focused
- **Auto-resize**: Textarea expands vertically as content grows
- **Submit Button**: Arrow icon, enabled only when input has content

### User Interactions

- **Enter**: Submits the form (adds paper or searches)
- **Shift+Enter**: New line in textarea
- **Focus**: Auto-focuses on mount when triggered via `focusNonce` prop
- **Upload**: Click upload icon → file picker → automatic processing

### State Management

- `input`: Current input value
- `loading`: Loading state during paper addition
- `error`: Error message display
- `isFocused`: Tracks focus state for visual feedback
- `pollingRef`: Manages background polling interval

### API Endpoints Used

- `POST /api/arxiv/add` - Add paper from arXiv URL/ID
- `POST /api/papers/upload` - Upload PDF file
- `GET /api/papers/:id` - Poll for paper status

---

## Paper Shelf Page

**File:** `client/src/pages/Shelf.jsx`  
**Route:** Accessed via sidebar navigation  
**Keyboard Shortcut:** Navigate via `Ctrl+P` command palette

### Overview

The Paper Shelf displays all papers in the user's library in a table format with search, filtering, pagination, and management capabilities.

### Key Features

#### 1. **Paper Grid Display**
Table columns:
- **Title**: Paper title (truncated with line-clamp-2)
- **Status**: Badge showing paper status (queued/reading/done)
- **Year**: Publication year or "----" if unavailable
- **Source**: Link to arXiv (if available) or "Local PDF" label
- **Actions**: "Open Notes" and "Delete" buttons

#### 2. **Search Functionality**
- Real-time fuzzy search with 250ms debounce
- Searches across title, authors, and abstract
- Uses Fuse.js backend search
- Updates results as you type
- Shows "X papers found" count

#### 3. **Status Management**
- Color-coded status badges:
  - **Done**: Green (`border-green-500/50 text-green-400 bg-green-500/10`)
  - **Reading**: Secondary color (`border-secondary/50 text-secondary bg-secondary/10`)
  - **Queued/Default**: Muted (`border-border text-muted bg-surface`)

#### 4. **Pagination**
- 10 papers per page
- Previous/Next navigation buttons
- Shows "X of Y" page indicator
- Disabled states at boundaries

#### 5. **Paper Actions**

**Open Notes:**
- Opens the Reader page with notes editor tab active
- Preserves paper selection state

**Delete:**
- Confirmation dialog before deletion
- Optimistic UI update
- Removes from both `papers` and `displayPapers` state

**Click Row:**
- Opens Reader page with PDF viewer

#### 6. **Breadcrumb Navigation**
- Shows "Home / Paper Shelf" at top
- Clickable "Home" link

### Visual Design

- **Layout**: Max-width 1200px, padded container
- **Table**: Grid layout with `grid-cols-[2fr_0.8fr_0.6fr_0.8fr_0.8fr]`
- **Header Row**: Dark background with muted text
- **Row Hover**: Subtle background change (`hover:bg-foreground/[0.02]`)
- **Title Hover**: Changes to secondary color
- **Empty State**: Centered message when no papers found

### User Interactions

- **Search**: Type in search box → debounced API call → filtered results
- **Click Paper Row**: Opens Reader
- **Click "Open Notes"**: Opens Reader with notes tab
- **Click "Delete"**: Confirmation → deletion
- **Click arXiv Link**: Opens external arXiv page (stops propagation)

### State Management

- `papers`: Full list of papers from API
- `displayPapers`: Filtered/search results
- `search`: Search query string
- `currentPage`: Current pagination page (resets on search)
- `loading`: Initial load state
- `deletingPaperId`: Tracks which paper is being deleted

### API Endpoints Used

- `GET /api/papers` - Fetch all papers
- `GET /api/search?q=query` - Fuzzy search papers
- `DELETE /api/papers/:id` - Delete a paper

---

## Reader Page

**File:** `client/src/pages/Reader.jsx`  
**Route:** Accessed when selecting a paper  
**Lazy Loaded:** Yes (React.lazy)

### Overview

The Reader page is the core of ReadXiv, providing a split-pane view with PDF viewer on the left and markdown notes editor on the right. It's designed for active reading and note-taking.

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│ Breadcrumb: Shelf / Paper Title    [Status Dropdown]    │
├─────────────────────────────────────────────────────────┤
│ ┌──────────────┐ │ ┌────────────────────────────────┐ │
│ │              │ │ │ Notes Header [Edit/Preview]   │ │
│ │   PDF        │ │ ├────────────────────────────────┤ │
│ │   Viewer     │ │ │                                │ │
│ │              │ │ │   Markdown Editor / Preview   │ │
│ │              │ │ │                                │ │
│ │              │ │ │                                │ │
│ └──────────────┘ │ └────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Key Features

#### 1. **Split-Pane Layout**
- **Resizable**: Drag handle between PDF and notes
- **Default Split**: 68% PDF, 32% Notes
- **Constraints**: PDF width between 40% and 78%
- **Smooth Resize**: Real-time width adjustment

#### 2. **PDF Viewer** (Left Pane)
See [PdfViewer Component](#pdfviewer-component) for detailed documentation.

**Key Capabilities:**
- Continuous scroll mode (all pages) or single-page view
- Zoom controls (+/- buttons, Ctrl+Wheel)
- Page navigation (◀ ▶ buttons)
- Highlight mode for text selection
- Highlight management (create, delete, clear all)
- Recent quotes bar (last 5 highlights with text)
- Click quote to insert into notes

#### 3. **Notes Editor** (Right Pane)

**Editor Features:**
- Full markdown support
- Auto-save with 500ms debounce
- Status indicator (Autosave on / Syncing... / Sync Error)
- Formatting toolbar (H1, H2, Bold, List, Code)
- Keyboard shortcuts (Ctrl+B for bold)
- Placeholder: "Start writing your thoughts..."

**Preview Mode:**
- Live markdown rendering (MarkdownIt)
- MathJax support for LaTeX equations
- Toggle between Edit and Preview tabs
- Only shown if `liveMarkdownPreview` setting is enabled

**Note Structure Template:**
The editor automatically ensures two sections exist:
- `## Quotes from the paper` - For highlighted quotes
- `## Opinions and Questions` - For user thoughts

**Quote Insertion:**
- When a highlight is clicked in the "Recent Quotes" bar
- Inserts formatted quote block:
  ```
  > Quote text here
  >
  > _Page X_
  ```
- Inserts before "Opinions and Questions" section
- Switches to Edit tab automatically

#### 4. **Status Management**
- Dropdown selector: Queued / Reading / Done
- Updates paper status via API
- Visual feedback in Shelf page

#### 5. **Background PDF Loading**
- Shows progress bar when PDF is downloading
- Polls every 2 seconds for PDF availability
- Displays "Initializing PDF stream..." message
- Auto-hides when PDF is ready

#### 6. **Paper Search Fallback**
- If no paper is selected, shows search interface
- Fuzzy search with 220ms debounce
- Displays up to 8 results
- Click result to load paper

### Visual Design

- **Container**: Full-height flex layout, max-width 1800px
- **PDF Pane**: Rounded card, border-right removed
- **Resize Handle**: 4px wide, hover/active states
- **Notes Pane**: Rounded card, border-left removed
- **Editor**: Full-height textarea, padding, relaxed line-height
- **Preview**: Scrollable div with markdown styling

### User Interactions

**PDF Viewer:**
- Click ◀ ▶ to navigate pages
- Click +/- to zoom
- Ctrl+Wheel to zoom
- Click "✦ Highlight" to enable highlight mode
- Select text → creates highlight
- Click highlight → removes it (in highlight mode)
- Click quote button → inserts into notes

**Notes Editor:**
- Type → auto-saves after 500ms
- Click formatting buttons → inserts markdown
- Ctrl+B → wraps selection in `**bold**`
- Toggle Edit/Preview tabs
- Click quote → inserts formatted quote

**Resize:**
- Mouse down on handle → drag → resize panes

### State Management

- `readerPaper`: Current paper data
- `notes`: Local notes content
- `serverNotes`: Last saved notes (for change detection)
- `notesStatus`: 'idle' | 'saving' | 'saved' | 'error'
- `noteTab`: 'edit' | 'preview'
- `leftWidth`: PDF pane width percentage
- `loading`: Initial load state
- `error`: Error message
- `backgroundPdfLoading`: PDF download status

### API Endpoints Used

- `GET /api/reader/:id` - Load paper and notes
- `PUT /api/reader/:id/notes` - Save notes
- `PATCH /api/papers/:id` - Update paper status
- `POST /api/papers/:id/access` - Track access (for recents)
- `GET /api/search` - Search papers (fallback)

---

## Settings Page

**File:** `client/src/pages/Settings.jsx`  
**Route:** Accessed via sidebar settings icon  
**Keyboard Shortcut:** `Ctrl+P` → type "settings"

### Overview

The Settings page allows users to customize their reading and note-taking experience with theme selection and feature toggles.

### Key Features

#### 1. **Theme Selection**
Six predefined themes available:

- **Black & Orange** (default): `#0A0A0A` / `#D97706`
- **Black & White** (monochrome): `#000000` / `#FFFFFF`
- **Citron & Sage**: `#6c6a1f` / `#577b21`
- **Slate**: `#000000` / `#a0aecd`
- **Mist**: `#f7f7f7` / `#7da2a9`
- **Forest**: `#052415` / `#ffffff`

**Visual Preview:**
- Each theme shows two color swatches (primary/secondary)
- Selected theme highlighted with secondary border/background
- Click to apply theme immediately

#### 2. **Feature Toggles**

**Continuous PDF scrolling:**
- When enabled: PDF displays all pages in continuous scroll
- When disabled: Single-page view with navigation
- Default: Enabled

**Live markdown preview:**
- When enabled: Shows Edit/Preview tabs in Reader
- When disabled: Only shows editor (no preview option)
- Default: Enabled

#### 3. **Keyboard Shortcuts Reference**
Displays all available keyboard shortcuts:
- `Ctrl+P` - Command palette
- `Ctrl+K` - Focus home search
- `Ctrl+B` - Toggle sidebar / Bold (in notes)
- Command palette navigation hints

### Visual Design

- **Layout**: Max-width 800px, centered, padded
- **Title**: Large serif font "Settings"
- **Subtitle**: Muted description text
- **Theme Grid**: 2-3 columns (responsive)
- **Toggle Cards**: Full-width, hover effects
- **Shortcuts Section**: Two-column grid

### User Interactions

- **Select Theme**: Click theme card → immediate application
- **Toggle Features**: Click checkbox → immediate save to localStorage
- **Settings Persist**: Saved to `papyrus-settings` in localStorage

### State Management

- `settings`: Object with `theme`, `continuousScroll`, `liveMarkdownPreview`, `fontFamily`
- Persisted to localStorage
- Applied to document via `data-theme` and `data-font` attributes

---

## Sidebar Component

**File:** `client/src/components/Sidebar.jsx`  
**Location:** Fixed left sidebar on all pages

### Overview

The Sidebar provides persistent navigation, quick search access, recent papers, and user profile information.

### Key Features

#### 1. **Collapsible Design**
- **Expanded**: 260px width, full labels
- **Collapsed**: 68px width, icons only
- **Toggle**: `Ctrl+B` keyboard shortcut
- **State**: Persisted to localStorage (`papyrus-sidebar-collapsed`)

#### 2. **Application Header**
- Logo: Orange "R" monogram image (`/readxiv-logo-r-monogram.png`)
- App name: "readxiv" (hidden when collapsed)
- Styled with serif font

#### 3. **New Search Button**
- Prominent button at top
- Icon + "New Search" label (hidden when collapsed)
- Keyboard shortcut hint: "⌘K"
- Click → navigates to Home and focuses input

#### 4. **Navigation Items**
- **Search** (Home): House icon, active state styling
- **Paper Shelf**: Book icon
- Active item highlighted with secondary color background
- Hover effects on all items

#### 5. **Recent Papers Section**
- Shows last 3 accessed papers
- Fetched from `/api/papers/recents?limit=3`
- Updates when page changes
- Click → opens Reader with notes tab
- Hidden when sidebar collapsed
- Section header: "RECENT PAPERS" (uppercase, muted)

#### 6. **User Profile Footer**
- User avatar: Orange "R" circle
- Username: "Rishi" (hidden when collapsed)
- Settings icon: Gear icon (hidden when collapsed)
- Click settings → navigates to Settings page

### Visual Design

- **Background**: Surface color with border-right
- **Sticky**: Fixed height, scrollable content area
- **Transitions**: Smooth width transitions (200ms)
- **Active State**: Secondary color background + text
- **Hover States**: Subtle background changes

### User Interactions

- **Click Navigation Item**: Navigates to page
- **Click Recent Paper**: Opens Reader
- **Click Settings**: Opens Settings page
- **Click New Search**: Focuses Home input
- **Keyboard**: `Ctrl+B` toggles collapse state

### State Management

- `collapsed`: Boolean from localStorage
- `recents`: Array of recent papers (fetched on mount and page change)
- Updates when `page` prop changes

### API Endpoints Used

- `GET /api/papers/recents?limit=3` - Fetch recent papers

---

## Global Search Palette

**File:** `client/src/components/GlobalSearchPalette.jsx`  
**Trigger:** `Ctrl+P` keyboard shortcut

### Overview

The Global Search Palette is a command palette-style interface for quickly searching papers and executing app commands. Inspired by VS Code's command palette.

### Key Features

#### 1. **Dual Mode Operation**

**Search Mode** (default):
- Searches papers by title, author, abstract
- Shows recent papers when query is empty
- Displays up to 12 results
- 120ms debounce for search queries

**Command Mode** (prefix with `>`, `:`, or `/`):
- Filters app commands
- Shows available navigation commands
- Type `>` + query to enter command mode

#### 2. **Paper Search Results**
- Title (bold, line-clamp-1)
- Metadata: Year and authors (or paper ID)
- Up to 12 results displayed
- Click or Enter → opens Reader

#### 3. **App Commands**
Available commands:
- **Go to Search** (`g h`): Navigate to Home
- **Go to Paper Shelf** (`g s`): Navigate to Shelf
- **Go to Settings** (`g c`): Navigate to Settings
- **Toggle sidebar** (`Ctrl+B`): Collapse/expand sidebar

Command filtering:
- Matches label, keywords, or shortcut
- Partial matching supported

#### 4. **Keyboard Navigation**
- **↑/↓ or j/k**: Navigate results
- **Enter**: Select/execute
- **Tab**: Toggle between search and command mode
- **Esc**: Close palette

**Mode Switching:**
- Type `>` prefix → enter command mode
- Press Tab in search mode → switch to command mode
- Press Tab in command mode → switch back to search

#### 5. **Visual Feedback**
- Active item highlighted with secondary color
- Smooth scrolling to keep active item visible
- Loading state: "Searching…" message
- Empty state: "No papers found" or "No matches"

### Visual Design

- **Overlay**: Full-screen backdrop with blur (`backdrop-blur-sm`)
- **Modal**: Centered, max-width 640px
- **Input**: Prominent search bar with icon
- **Results**: Scrollable list (max-height 400px)
- **Footer**: Keyboard shortcut hints
- **Active Item**: Secondary background highlight

### User Interactions

**Opening:**
- Press `Ctrl+P` → palette opens, input focused

**Searching:**
- Type query → debounced search → results update
- Empty query → shows recent papers

**Navigating:**
- Arrow keys or j/k → move selection
- Enter → execute action
- Esc → close

**Mode Switching:**
- Type `>` → command mode
- Tab → toggle mode

### State Management

- `query`: Search/command query string
- `results`: Paper search results
- `loading`: Search loading state
- `activeIndex`: Currently selected item index
- `isCommandMode`: Boolean (detected from query prefix)
- `commandResults`: Filtered command list

### API Endpoints Used

- `GET /api/search?q=query` - Search papers
- `GET /api/papers/recents?limit=10` - Recent papers (empty query)

---

## PdfViewer Component

**File:** `client/src/components/PdfViewer.jsx`  
**Used In:** Reader page (left pane)

### Overview

The PdfViewer component renders PDF documents using PDF.js with support for highlighting, zooming, navigation, and text selection.

### Key Features

#### 1. **PDF Rendering**
- Uses PDF.js library (`pdfjs-dist`)
- Canvas-based rendering
- High-quality rendering (1.5x device pixel ratio)
- Continuous scroll or single-page mode
- Annotation mode disabled (clean rendering)

#### 2. **Zoom Controls**
- **Range**: 60% to 320% (`SCALE_MIN` to `SCALE_MAX`)
- **Controls**: +/- buttons in header
- **Keyboard**: Ctrl+Wheel to zoom
- **Auto-fit**: Automatically fits to container width on load (1.05x to 2.2x)
- **User Override**: Once user manually zooms, auto-fit disabled

#### 3. **Page Navigation**
- **Previous/Next**: ◀ ▶ buttons
- **Page Indicator**: "X / Y" display
- **Continuous Mode**: Scrolls to page when navigating
- **Single-Page Mode**: Renders only current page

#### 4. **Highlighting System**

**Highlight Mode:**
- Toggle button: "✦ Highlight"
- When enabled: Text selection creates highlights
- Click existing highlight → removes it (in highlight mode)

**Creating Highlights:**
- Select text on PDF → creates yellow highlight
- Normalized coordinates stored (relative to page)
- Text content extracted and stored
- Highlights persist across sessions

**Highlight Display:**
- Overlaid on PDF canvas
- Yellow color (`border-amber-400/80 bg-amber-300/25`)
- Clickable when in highlight mode
- Shows tooltip with text on hover

**Recent Quotes Bar:**
- Shows last 5 highlights with text content
- Click quote → inserts into notes editor
- Truncated display (max-width 320px)

#### 5. **Text Layer**
- Invisible text layer for selection
- Positioned absolutely over canvas
- Only active in highlight mode
- Extracts text content from PDF.js text content API

#### 6. **Highlight Management**
- **Create**: Select text → POST to `/api/reader/:id/highlights`
- **Delete**: Click highlight → DELETE request
- **Clear All**: Button in header → confirmation → clears all
- **Fetch**: Loads all highlights on mount

### Visual Design

- **Container**: Card component with header and content
- **Header**: Navigation controls, highlight toggle, zoom controls
- **Content**: Scrollable area with PDF pages
- **Pages**: Centered, bordered, rounded corners
- **Highlights**: Semi-transparent overlays with borders
- **Recent Quotes**: Horizontal scrollable bar below header

### User Interactions

**Navigation:**
- Click ◀ ▶ → change page
- Scroll → navigate (continuous mode)

**Zooming:**
- Click +/- → adjust scale
- Ctrl+Wheel → zoom in/out
- Auto-fits on initial load

**Highlighting:**
- Click "✦ Highlight" → enable mode
- Select text → create highlight
- Click highlight → delete (in highlight mode)
- Click "Clear all" → confirmation → clear all
- Click quote button → insert into notes

### State Management

- `doc`: PDF.js document object
- `numPages`: Total page count
- `page`: Current page number
- `scale`: Zoom level
- `loading`: PDF loading state
- `error`: Error message
- `highlightMode`: Boolean toggle
- `highlights`: Array of highlight objects
- `pageTextLayers`: Text layer data per page

### API Endpoints Used

- `GET /api/reader/:id/pdf` - Stream PDF file
- `GET /api/reader/:id/highlights` - Fetch highlights
- `POST /api/reader/:id/highlights` - Create highlight
- `DELETE /api/reader/:id/highlights/:highlightId` - Delete highlight
- `DELETE /api/reader/:id/highlights` - Clear all highlights

---

## Design Patterns & Conventions

### Color System
- Uses CSS custom properties via `data-theme` attribute
- Themes defined in `client/src/index.css`
- Secondary color used for accents and highlights
- Muted colors for secondary text

### Typography
- **Serif**: Used for headings and app name
- **Sans-serif**: Used for body text and UI elements
- **Mono**: Used for code, IDs, and technical text
- Font family controlled via `data-font` attribute

### Spacing & Layout
- Consistent padding: `p-4`, `p-6`, `p-8`
- Max-width containers: 800px (Home/Settings), 1200px (Shelf), 1800px (Reader)
- Gap spacing: `gap-2`, `gap-3`, `gap-4`

### Component Patterns
- **Cards**: `claude-card` class for elevated surfaces
- **Buttons**: Consistent hover states and transitions
- **Inputs**: Border focus states with secondary color
- **Badges**: Status indicators with color coding

### State Persistence
- Settings: `localStorage` key `papyrus-settings`
- Sidebar collapse: `localStorage` key `papyrus-sidebar-collapsed`
- All settings applied on mount

### Keyboard Shortcuts Summary
- `Ctrl+P`: Open command palette
- `Ctrl+K` / `Ctrl+Shift+K`: Focus Home search
- `Ctrl+B`: Toggle sidebar (or Bold in notes)
- `Enter`: Submit form / select item
- `Esc`: Close modal / palette
- `↑↓` / `jk`: Navigate lists
- `Tab`: Switch modes in palette

---

## Future Design Considerations

Based on `features.md`, here are areas for potential design iteration:

1. **PDF Reader Improvements**
   - Multiple highlight colors (yellow, green, red)
   - Pinch-to-zoom support
   - Better resolution/quality options
   - Annotation tools

2. **Notes Editor Enhancements**
   - LaTeX compilation for equations
   - Better markdown preview
   - Template enforcement for structure
   - Vim keybindings option

3. **Navigation Improvements**
   - More keyboard shortcuts
   - Vim-like navigation mode
   - Better command palette integration

4. **Projects Feature** (Future)
   - Folder-based organization
   - Paper graph visualization
   - Unified project notes

5. **Recommendations** (Future)
   - Email integration
   - Recommendation engine
   - Dedicated recommendations section

---

## Screenshots

*Note: Screenshots can be added here as they become available. Reference the visual descriptions in each section above for UI details.*

- `home-page.png` - Home page with search interface
- `shelf-page.png` - Paper Shelf with table view
- `reader-page.png` - Reader with split-pane layout
- `settings-page.png` - Settings page with theme selection

---

*Last Updated: March 2, 2026*
