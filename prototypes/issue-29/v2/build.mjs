import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const studies = [
  { id: '01', slug: 'shared-frame', name: 'Shared frame', className: 'v1', bar: 'direct', note: 'One continuous surface holds the greeting, command field, and reading desk.' },
  { id: '02', slug: 'split-desk', name: 'Split desk', className: 'v2', bar: 'direct', note: 'The bar and greeting sit beside the paper, joined by one border and baseline.' },
  { id: '03', slug: 'task-rail', name: 'Task rail', className: 'v3', bar: 'task', note: 'A compact task rail becomes the left edge of the reading workspace.' },
  { id: '04', slug: 'editorial-sheet', name: 'Editorial sheet', className: 'v4', bar: 'direct', note: 'The page reads as one editorial sheet, with the field set into its middle.' },
  { id: '05', slug: 'scroll-handoff', name: 'Scroll handoff', className: 'v5', bar: 'direct', note: 'The command field compresses into a sticky dock as the reading desk comes forward.' },
  { id: '06', slug: 'reading-first', name: 'Reading first', className: 'v6', bar: 'task', note: 'The paper owns the canvas; greeting and actions are integrated into its edges.' },
]

const nav = (active) => `<nav class="study-nav" aria-label="Design studies">${studies.map(study => `<a href="${study.id}-${study.slug}.html" ${study.id === active ? 'aria-current="page"' : ''} aria-label="Study ${study.id}: ${study.name}">${study.id}</a>`).join('')}</nav>`

const greeting = () => `<header class="greeting">
  <p class="greeting-context">ReadXiv / Home</p>
  <h1>Another day, another paper<br>to the <em>pile.</em></h1>
  <p class="greeting-sub">Find what you saved. Bring in what you found.</p>
</header>`

const directBar = () => `<section class="command command-direct" aria-label="Paper command bar">
  <div class="command-label"><span>Search and add</span><span class="command-position">/ to focus</span></div>
  <form class="command-form" data-command-form>
    <span class="search-mark" aria-hidden="true">⌕</span>
    <label class="sr-only" for="command-input">Search, open, or add a paper</label>
    <input id="command-input" data-command-input autocomplete="off" placeholder="Search papers or paste an arXiv link…" aria-controls="command-results" aria-expanded="false">
    <button type="submit" class="enter-key" aria-label="Run command">↵</button>
  </form>
  <div class="command-results" id="command-results" data-results role="listbox" aria-label="Paper results" hidden></div>
  <div class="command-actions" aria-label="Command modes">
    <button type="button" data-mode="search" aria-pressed="true">Search <kbd>S</kbd></button>
    <button type="button" data-mode="open" aria-pressed="false">Open <kbd>O</kbd></button>
    <button type="button" data-mode="add" aria-pressed="false">Add <kbd>A</kbd></button>
    <button type="button" data-upload>Upload PDF <kbd>U</kbd></button>
  </div>
</section>`

const taskBar = () => `<section class="command command-task" aria-label="Paper task bar">
  <div class="task-choices" role="group" aria-label="Choose a task">
    <button type="button" data-mode="search" aria-pressed="true"><span>⌕</span><strong>Search</strong><kbd>S</kbd></button>
    <button type="button" data-mode="open" aria-pressed="false"><span>↗</span><strong>Open</strong><kbd>O</kbd></button>
    <button type="button" data-mode="add" aria-pressed="false"><span>＋</span><strong>Add</strong><kbd>A</kbd></button>
    <button type="button" data-upload><span>⇧</span><strong>Upload PDF</strong><kbd>U</kbd></button>
  </div>
  <div class="task-entry">
    <div class="command-label"><span data-mode-label>Search your library</span><span class="command-position">/ to focus</span></div>
    <form class="command-form" data-command-form>
      <label class="sr-only" for="command-input">Search library</label>
      <input id="command-input" data-command-input autocomplete="off" placeholder="Title, author, or arXiv ID" aria-controls="command-results" aria-expanded="false">
      <button type="submit" class="enter-key" aria-label="Run command">↵</button>
    </form>
    <div class="command-results" id="command-results" data-results role="listbox" aria-label="Paper results" hidden></div>
  </div>
</section>`

const desk = () => `<section class="desk" aria-label="Reading desk">
  <div class="desk-top">
    <span class="desk-context" data-desk-context>At your desk</span>
    <div class="desk-switch" role="tablist" aria-label="Desk view">
      <button type="button" role="tab" data-view="reading" aria-selected="true">Reading</button>
      <button type="button" role="tab" data-view="stats" aria-selected="false">Stats <kbd>T</kbd></button>
    </div>
  </div>
  <div class="desk-reading" data-reading>
    <button type="button" class="hero-paper" data-paper-index="0">
      <span class="paper-year">2026 / paper 13 of 19 pages</span>
      <strong>Attention Drift: What Autoregressive Speculative Decoding Models Learn</strong>
      <span class="paper-authors">Doğaç Eldenk, Payal Mohapatra, Yigitcan Colmek</span>
      <span class="paper-progress"><i></i></span>
      <span class="paper-foot"><span>Page 13 / 19</span><span>Resume ↗</span></span>
    </button>
    <div class="important-papers">
      <div class="important-head"><h2>Important papers</h2><span><kbd>J</kbd> <kbd>K</kbd> to select</span></div>
      <button type="button" data-paper-index="1"><span class="paper-number">01</span><span class="star">★</span><span class="important-title">Toward Explainable Offline Reinforcement Learning</span><time>7d ago</time></button>
      <button type="button" data-paper-index="2"><span class="paper-number">02</span><span class="star">★</span><span class="important-title">Looped Transformers as Programmable Computers</span><time>10d ago</time></button>
      <button type="button" data-paper-index="3"><span class="paper-number">03</span><span class="star">★</span><span class="important-title">PrunePath: Towards High Efficiency Inference</span><time>13d ago</time></button>
    </div>
  </div>
  <div class="desk-stats" data-stats hidden>
    <div><strong>28.4<span>h</span></strong><small>Time read</small><span>This week +3.2h</span></div>
    <div><strong>6<span>d</span></strong><small>Reading streak</small><span>Best 12d</span></div>
    <div><strong>42</strong><small>Active days</small><span>Across your library</span></div>
  </div>
</section>`

const shortcuts = () => `<div class="shortcut-line" aria-label="Keyboard shortcuts"><span><kbd>/</kbd> Focus</span><span><kbd>T</kbd> Reading / Stats</span><span><kbd>J</kbd><kbd>K</kbd> Papers</span><button type="button" data-help-open><kbd>?</kbd> All shortcuts</button></div>`

const help = () => `<div class="help-backdrop" data-help hidden><section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><div class="help-head"><h2 id="help-title">Keyboard shortcuts</h2><button type="button" data-help-close aria-label="Close shortcuts">Esc</button></div><dl><div><dt>Focus the bar</dt><dd>/ or Ctrl/⌘ K</dd></div><div><dt>Search / Open / Add / Upload</dt><dd>S / O / A / U</dd></div><div><dt>Reading / Stats</dt><dd>T</dd></div><div><dt>Move between papers</dt><dd>J / K or ↑ / ↓</dd></div><div><dt>Open selected paper</dt><dd>Enter</dd></div><div><dt>Clear or close</dt><dd>Esc</dd></div></dl><p>Shortcuts pause while you type in an input. These mappings are proposals for the design study.</p></section></div>`

function page(study) {
  const bar = study.bar === 'task' ? taskBar() : directBar()
  const content = study.id === '03' ? `${bar}${greeting()}${desk()}` : `${greeting()}${bar}${desk()}`
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${study.id} ${study.name} · ReadXiv</title><link rel="stylesheet" href="v2.css"></head>
<body class="${study.className}">
  <div class="app-top"><a class="brand" href="../index.html">ReadXiv<span>.</span></a>${nav(study.id)}<span class="study-name">${study.name}</span></div>
  <main class="home"><div class="composition">${content}</div>${shortcuts()}</main>
  <input type="file" data-file-input accept=".pdf,application/pdf" hidden>
  <div class="notice" role="status" aria-live="polite"></div>
  ${help()}
  <script src="v2.js"></script>
</body></html>`
}

for (const study of studies) await writeFile(join(root, `${study.id}-${study.slug}.html`), page(study))
