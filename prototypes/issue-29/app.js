// Self-contained interaction data for issue #29 design review. No app API calls are made.
const papers = [
  { title: 'Attention Drift: What Autoregressive Speculative Decoding Models Learn', meta: '2026 · Doğaç Eldenk, Payal Mohapatra', id: '2608.08423' },
  { title: 'Looped Transformers as Programmable Computers', meta: '2025 · Laurent, Schwarz', id: '2501.01234' },
  { title: 'Toward Explainable Offline Reinforcement Learning', meta: '2024 · Research notes', id: '2408.08423' },
  { title: 'PrunePath: Towards High Efficiency Inference', meta: '2025 · Research notes', id: '2502.04567' },
]
const body = document.body
const variant = body.dataset.variant
const input = document.querySelector('[data-main-input]')
const results = document.querySelector('[data-results]')
const fileInput = document.querySelector('[data-file]')
const toast = document.querySelector('.toast')
const main = document.querySelector('main')
let currentMode = variant === 'workspace' ? 'search' : variant === 'composer' ? 'add' : 'smart'
let selected = 0
let resultActions = []
let toastTimer

// Keep the existing reading desk visible in every Home study.
main.insertAdjacentHTML('afterend', `<section class="reading-desk" aria-label="Reading desk">
  <div class="desk-head"><div class="desk-tabs" role="tablist" aria-label="Desk view"><button type="button" role="tab" aria-selected="true" data-desk-tab="reading">Reading</button><button type="button" role="tab" aria-selected="false" data-desk-tab="stats">Stats</button></div></div>
  <div class="desk-panel" data-desk-reading><button type="button" class="desk-current" data-paper="Attention Drift: What Autoregressive Speculative Decoding Models Learn"><span class="desk-title">Attention Drift: What Autoregressive Speculative Decoding Models Learn</span><span class="desk-meta">2026 · Doğaç Eldenk, Payal Mohapatra, Yigitcan Colmek</span><span class="desk-progress"><i></i></span><span class="desk-current-foot"><span>page 13 / 19</span><span>Resume →</span></span></button><div class="desk-important"><h2>Important papers</h2><button type="button" data-paper="Toward Explainable Offline Reinforcement Learning"><span>01</span><b>★</b><strong>Toward Explainable Offline Reinforcement Learning</strong><time>7d ago</time></button><button type="button" data-paper="Looped Transformers as Programmable Computers"><span>02</span><b>★</b><strong>Looped Transformers as Programmable Computers</strong><time>10d ago</time></button><button type="button" data-paper="PrunePath: Towards High Efficiency Inference"><span>03</span><b>★</b><strong>PrunePath: Towards High Efficiency Inference</strong><time>13d ago</time></button></div></div>
  <div class="desk-panel desk-stats" data-desk-stats hidden><div><strong>28.4<span>h</span></strong><small>Time read</small></div><div><strong>6<span>d</span></strong><small>Streak</small></div><div><strong>42</strong><small>Active days</small></div></div>
</section>`)
document.querySelectorAll('[data-desk-tab]').forEach(tab => tab.addEventListener('click', () => {
  const reading = tab.dataset.deskTab === 'reading'
  document.querySelectorAll('[data-desk-tab]').forEach(item => item.setAttribute('aria-selected', String(item === tab)))
  document.querySelector('[data-desk-reading]').hidden = !reading
  document.querySelector('[data-desk-stats]').hidden = reading
}))

function announce(message) {
  toast.textContent = message
  toast.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4200)
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}
function isPaperLink(value) {
  return /^(?:https:\/\/\S+|\d{4}\.\d{4,5}(?:v\d+)?)$/i.test(value.trim())
}
function resultRow(symbol, title, meta, action, key = '') {
  const index = resultActions.push(action) - 1
  return `<button type="button" class="result-row ${index === selected ? 'selected' : ''}" data-result-index="${index}" role="option" aria-selected="${index === selected}"><span class="symbol" aria-hidden="true">${symbol}</span><span class="result-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(meta)}</small></span><span class="result-key">${key}</span></button>`
}
function renderResults() {
  if (!results) return
  const query = input?.value.trim() || ''
  resultActions = []
  selected = 0
  let markup = ''
  if (variant === 'palette' && !query && currentMode === 'smart') {
    markup = '<div class="result-title">Choose an action</div>'
    markup += resultRow('⌕', 'Search your library', 'Find by title, author, or arXiv ID', () => setMode('search'), 'S')
    markup += resultRow('↗', 'Open a paper', 'Search and select an existing paper', () => setMode('open'), 'O')
    markup += resultRow('＋', 'Add from link', 'arXiv ID, URL, or PDF link', () => setMode('add'), 'A')
    markup += resultRow('⇧', 'Upload PDF', 'Choose a local file', () => fileInput?.click(), 'U')
  } else if (variant === 'palette' && !query && (currentMode === 'search' || currentMode === 'open')) {
    markup = '<div class="result-title">Recent papers</div>'
    markup += papers.slice(0, 3).map(paper => resultRow('↗', paper.title, `${paper.meta} · ${paper.id}`, () => announce(`Prototype: opening “${paper.title}”`), '↵')).join('')
  } else if (variant === 'palette' && !query && currentMode === 'add') {
    markup = '<div class="empty-result">Paste an arXiv ID, arXiv URL, or HTTPS PDF link to review it.</div>'
  } else if (query && isPaperLink(query) && currentMode !== 'search') {
    markup = '<div class="result-title">Recognized paper link</div>'
    markup += resultRow('＋', query, 'Review this paper before adding', () => announce('Prototype: this link would open a paper preview.'), '↵')
  } else if (query && currentMode === 'add') {
    markup = '<div class="result-title">Add a paper</div>'
    markup += resultRow('＋', query, 'Paste an arXiv ID, arXiv URL, or HTTPS PDF link', () => announce('Enter a supported paper link or ID.'), '↵')
  } else if (query) {
    const matches = papers.filter(paper => `${paper.title} ${paper.meta} ${paper.id}`.toLowerCase().includes(query.toLowerCase()))
    markup = '<div class="result-title">Library matches</div>'
    markup += matches.length
      ? matches.map(paper => resultRow('↗', paper.title, `${paper.meta} · ${paper.id}`, () => announce(`Prototype: opening “${paper.title}”`), '↵')).join('')
      : '<div class="empty-result">No papers found. Try another title or paste an arXiv link.</div>'
  } else if (variant === 'workspace' && (currentMode === 'search' || currentMode === 'open')) {
    results.hidden = true
    results.innerHTML = ''
    return
  } else if (variant === 'direct') {
    results.hidden = true
    results.innerHTML = ''
    return
  } else if (variant === 'composer') {
    results.hidden = true
    results.innerHTML = ''
    return
  }
  results.innerHTML = markup
  results.hidden = !markup
}
function setMode(mode) {
  currentMode = mode
  if (variant === 'workspace') {
    const copy = {
      search: ['Search your library', 'Find the paper you need.', 'Search titles, authors, and arXiv IDs. Select a result to open it.', 'Title, author, or arXiv ID', 'Search'],
      open: ['Open a paper', 'Go straight to the source.', 'Find a saved paper, then choose the right match.', 'Search for a paper to open', 'Open'],
      add: ['Add a paper', 'Save it for later.', 'Paste an arXiv ID or supported paper URL to preview it.', 'arXiv ID or paper link', 'Review'],
      upload: ['Upload a PDF', 'Bring in a local file.', 'Select a PDF from your computer. It will join your library.', '', 'Choose PDF'],
    }[mode]
    document.querySelectorAll('[data-task]').forEach(button => button.classList.toggle('active', button.dataset.task === mode))
    document.querySelector('[data-task-label]').textContent = copy[0]
    document.querySelector('[data-task-title]').textContent = copy[1]
    document.querySelector('[data-task-description]').textContent = copy[2]
    input.placeholder = copy[3]
    document.querySelector('.task-form button').innerHTML = `${copy[4]} <span>↗</span>`
    document.querySelector('[data-task-prompt]').hidden = mode !== 'search'
    input.disabled = mode === 'upload'
    input.value = ''
    renderResults()
    if (mode !== 'upload') input.focus()
  } else if (variant === 'direct') {
    const placeholders = { search: 'Search titles, authors, or IDs…', open: 'Find a paper to open…', add: 'Paste an arXiv ID or paper link…' }
    input.placeholder = placeholders[mode] || 'Search papers or paste an arXiv link…'
    input.value = ''
    renderResults()
    input.focus()
  } else if (variant === 'palette') {
    input.value = ''
    input.placeholder = { search: 'Search titles, authors, or IDs…', open: 'Find a paper to open…', add: 'Paste an arXiv ID or paper link…' }[mode] || 'Search papers or choose an action…'
    openPalette()
    renderResults()
  }
}
function submit() {
  if (variant === 'workspace' && currentMode === 'upload') return fileInput?.click()
  const value = input.value.trim()
  if (!value && variant === 'palette' && resultActions[selected]) return resultActions[selected]()
  if (!value) return announce('Enter a title, arXiv ID, or paper link first.')
  if (resultActions[selected] && !isPaperLink(value) && currentMode !== 'add' && variant !== 'composer') return resultActions[selected]()
  if (isPaperLink(value)) return announce('Prototype: this paper would open in a review step before adding.')
  if (currentMode === 'add') return announce('Enter an arXiv ID or supported paper link.')
  announce('Choose a library result to open, or try a different search.')
}
function setSelected(next) {
  const rows = [...results.querySelectorAll('[data-result-index]')]
  if (!rows.length) return
  selected = Math.max(0, Math.min(next, rows.length - 1))
  rows.forEach((row, index) => {
    row.classList.toggle('selected', index === selected)
    row.setAttribute('aria-selected', String(index === selected))
  })
  rows[selected]?.scrollIntoView({ block: 'nearest' })
}
function openPalette() {
  const overlay = document.querySelector('[data-palette-overlay]')
  overlay.hidden = false
  input.focus()
  renderResults()
}
function closePalette() {
  document.querySelector('[data-palette-overlay]').hidden = true
  document.querySelector('[data-palette-open]').focus()
}
input?.addEventListener('input', () => {
  if (variant !== 'composer') renderResults()
})
input?.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' && results && !results.hidden) { event.preventDefault(); setSelected(selected + 1) }
  if (event.key === 'ArrowUp' && results && !results.hidden) { event.preventDefault(); setSelected(selected - 1) }
  if (event.key === 'Escape') {
    if (variant === 'palette') closePalette()
    else { input.value = ''; renderResults(); input.blur() }
  }
})
results?.addEventListener('click', event => {
  const row = event.target.closest('[data-result-index]')
  if (row) resultActions[Number(row.dataset.resultIndex)]?.()
})
document.querySelectorAll('.field-form,.palette-form').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); submit() }))
document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)))
document.querySelectorAll('[data-task]').forEach(button => button.addEventListener('click', () => button.dataset.task === 'upload' ? (setMode('upload'), fileInput?.click()) : setMode(button.dataset.task)))
document.querySelectorAll('[data-upload]').forEach(button => button.addEventListener('click', () => fileInput?.click()))
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.example; input.focus(); renderResults() }))
document.querySelectorAll('[data-paper]').forEach(button => button.addEventListener('click', () => announce(`Prototype: opening “${button.dataset.paper}”`)))
fileInput?.addEventListener('change', () => { if (fileInput.files?.[0]) announce(`Prototype: “${fileInput.files[0].name}” is ready to import.`); fileInput.value = '' })
document.addEventListener('keydown', event => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  if (variant === 'palette' && ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' || event.key === '/' && !typing)) {
    event.preventDefault(); openPalette()
  } else if (variant !== 'palette' && event.key === '/' && !typing) {
    event.preventDefault(); input.focus()
  }
})
if (variant === 'palette') {
  document.querySelector('[data-palette-open]').addEventListener('click', openPalette)
  document.querySelector('[data-palette-close]').addEventListener('click', closePalette)
  document.querySelector('[data-palette-overlay]').addEventListener('click', event => { if (event.target.matches('[data-palette-overlay]')) closePalette() })
  document.querySelectorAll('[data-palette-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.paletteMode)))
}
if (variant === 'composer') {
  const form = document.querySelector('[data-composer-form]')
  const tabs = [...document.querySelectorAll('[data-composer-tab]')]
  const submitButton = document.querySelector('[data-composer-submit]')
  const hint = document.querySelector('[data-composer-hint]')
  tabs.forEach(tab => tab.addEventListener('click', () => {
    currentMode = tab.dataset.composerTab
    tabs.forEach(item => item.setAttribute('aria-selected', String(item === tab)))
    input.value = ''
    input.placeholder = currentMode === 'add' ? 'Paste arXiv IDs or HTTPS PDF links, one per line…' : 'Search titles, authors, or arXiv IDs…'
    submitButton.innerHTML = currentMode === 'add' ? 'Review papers <span>↗</span>' : 'Search <span>↗</span>'
    hint.textContent = currentMode === 'add' ? 'arXiv links, IDs, and PDF URLs' : 'Search only in your saved library'
    results.hidden = true
    input.focus()
  }))
  form.addEventListener('submit', event => {
    event.preventDefault()
    const lines = input.value.split(/[\n\s]+/).map(line => line.trim()).filter(Boolean)
    if (!lines.length) return announce(currentMode === 'add' ? 'Paste at least one paper link or ID.' : 'Enter a search query.')
    if (currentMode === 'search') { renderResults(); return }
    resultActions = []
    selected = 0
    const recognized = lines.filter(isPaperLink)
    results.innerHTML = '<div class="result-title">Review queue · prototype</div>' + (recognized.length
      ? recognized.map(line => resultRow('＋', line, 'Ready for metadata lookup', () => announce('Prototype: this item would be added to your library.'))).join('')
      : '<div class="empty-result">No supported links or IDs found. Use an arXiv ID, arXiv URL, or HTTPS PDF link.</div>')
    results.hidden = false
  })
}
renderResults()
