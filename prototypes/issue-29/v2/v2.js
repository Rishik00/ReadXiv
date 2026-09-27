// Interaction prototype for issue #29. It uses sample data and never changes the library.
const papers = [
  { title: 'Attention Drift: What Autoregressive Speculative Decoding Models Learn', detail: '2026 · Doğaç Eldenk, Payal Mohapatra', id: '2608.08423' },
  { title: 'Toward Explainable Offline Reinforcement Learning', detail: '2025 · Important paper', id: '2507.11820' },
  { title: 'Looped Transformers as Programmable Computers', detail: '2025 · Important paper', id: '2501.01234' },
  { title: 'PrunePath: Towards High Efficiency Inference', detail: '2025 · Important paper', id: '2502.04567' },
]

const input = document.querySelector('[data-command-input]')
const form = document.querySelector('[data-command-form]')
const results = document.querySelector('[data-results]')
const paperButtons = [...document.querySelectorAll('[data-paper-index]')]
const modeButtons = [...document.querySelectorAll('[data-mode]')]
const viewButtons = [...document.querySelectorAll('[data-view]')]
const fileInput = document.querySelector('[data-file-input]')
const notice = document.querySelector('.notice')
const help = document.querySelector('[data-help]')
const isTaskBar = Boolean(document.querySelector('.command-task'))
let mode = 'search'
let selectedPaper = -1
let selectedResult = 0
let resultActions = []
let noticeTimer
let previousFocus

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character])
}
function announce(message) {
  notice.textContent = message
  notice.classList.add('visible')
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => notice.classList.remove('visible'), 3500)
}
function isPaperLink(value) {
  return /^(?:https:\/\/\S+|\d{4}\.\d{4,5}(?:v\d+)?)$/i.test(value.trim())
}
function row(title, detail, action, symbol = '↗') {
  const index = resultActions.push(action) - 1
  return `<button type="button" class="result-row" role="option" aria-selected="${index === selectedResult}" data-result-index="${index}"><span aria-hidden="true">${symbol}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></span></button>`
}
function renderResults() {
  const query = input.value.trim()
  resultActions = []
  selectedResult = 0
  if (!query) {
    results.hidden = true
    results.innerHTML = ''
    input.setAttribute('aria-expanded', 'false')
    return
  }
  let html
  if (isPaperLink(query) && (mode !== 'search' || !isTaskBar)) {
    html = '<div class="result-heading">Paper link recognized</div>'
    if (mode === 'open') html += row(query, 'Open the resolved paper', () => announce('Prototype: opening the resolved paper.'), '↗')
    else html += row(query, 'Review paper metadata before adding', () => announce('Prototype: this paper would open in a review step.'), '＋')
  } else if (mode === 'add') {
    html = '<div class="result-heading">Add a paper</div><div class="result-empty">Use an arXiv ID, arXiv URL, or HTTPS PDF link. Search your library with S.</div>'
  } else {
    const matches = papers.filter(paper =>
      `${paper.title} ${paper.detail} ${paper.id}`.toLowerCase().includes(query.toLowerCase()))
    html = '<div class="result-heading">Library matches</div>'
    html += matches.length
      ? matches.map(paper => row(paper.title, `${paper.detail} · ${paper.id}`, () => announce(`Prototype: opening “${paper.title}”`))).join('')
      : '<div class="result-empty">No matching paper. Try another title or switch to Add with A.</div>'
  }
  results.innerHTML = html
  results.hidden = false
  input.setAttribute('aria-expanded', 'true')
}
function selectResult(index) {
  const rows = [...results.querySelectorAll('[data-result-index]')]
  if (!rows.length) return
  selectedResult = Math.max(0, Math.min(index, rows.length - 1))
  rows.forEach((item, position) => item.setAttribute('aria-selected', String(position === selectedResult)))
  rows[selectedResult].scrollIntoView({ block: 'nearest' })
}
function setMode(next, focus = true) {
  mode = next
  modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mode === next)))
  const copy = {
    search: ['Search your library', 'Search papers or paste an arXiv link…', 'Search library'],
    open: ['Open a paper', 'Find a saved paper to open…', 'Open paper'],
    add: ['Add a paper', 'Paste an arXiv ID or paper link…', 'Add paper'],
  }[next]
  document.querySelector('[data-mode-label]')?.replaceChildren(document.createTextNode(copy[0]))
  input.placeholder = copy[1]
  input.setAttribute('aria-label', copy[2])
  input.value = ''
  renderResults()
  if (focus) input.focus()
}
function setView(next) {
  const reading = next === 'reading'
  viewButtons.forEach(button => button.setAttribute('aria-selected', String(button.dataset.view === next)))
  document.querySelector('[data-reading]').hidden = !reading
  document.querySelector('[data-stats]').hidden = reading
  document.querySelector('[data-desk-context]').textContent = reading ? 'At your desk' : 'Your library, in numbers'
}
function toggleView() {
  setView(document.querySelector('[data-reading]').hidden ? 'reading' : 'stats')
}
function selectPaper(index) {
  setView('reading')
  selectedPaper = Math.max(0, Math.min(index, paperButtons.length - 1))
  paperButtons.forEach(button => button.dataset.selected = String(Number(button.dataset.paperIndex) === selectedPaper))
  paperButtons[selectedPaper].scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}
function submit() {
  const query = input.value.trim()
  if (!query) return announce('Enter a title, arXiv ID, or paper link.')
  if (resultActions[selectedResult]) return resultActions[selectedResult]()
  if (isPaperLink(query)) return announce('Prototype: this paper would open in a review step.')
  announce(mode === 'add' ? 'Use an arXiv ID or supported paper link.' : 'No saved paper matches that query.')
}
function openHelp() {
  previousFocus = document.activeElement
  help.hidden = false
  help.querySelector('[data-help-close]').focus()
}
function closeHelp() {
  help.hidden = true
  previousFocus?.focus()
}

input.addEventListener('input', renderResults)
input.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' && !results.hidden) { event.preventDefault(); selectResult(selectedResult + 1) }
  if (event.key === 'ArrowUp' && !results.hidden) { event.preventDefault(); selectResult(selectedResult - 1) }
  if (event.key === 'Escape') {
    event.preventDefault()
    input.value = ''
    renderResults()
    input.blur()
  }
})
form.addEventListener('submit', event => { event.preventDefault(); submit() })
results.addEventListener('click', event => {
  const button = event.target.closest('[data-result-index]')
  if (button) resultActions[Number(button.dataset.resultIndex)]?.()
})
modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)))
viewButtons.forEach(button => button.addEventListener('click', () => setView(button.dataset.view)))
paperButtons.forEach(button => button.addEventListener('click', () => {
  const index = Number(button.dataset.paperIndex)
  selectPaper(index)
  announce(`Prototype: opening “${papers[index].title}”`)
}))
document.querySelectorAll('[data-upload]').forEach(button => button.addEventListener('click', () => fileInput.click()))
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) announce(`Prototype: “${fileInput.files[0].name}” is ready to import.`)
  fileInput.value = ''
})
document.querySelector('[data-help-open]').addEventListener('click', openHelp)
document.querySelector('[data-help-close]').addEventListener('click', closeHelp)
help.addEventListener('click', event => { if (event.target === help) closeHelp() })
document.addEventListener('keydown', event => {
  if (!help.hidden) {
    if (event.key === 'Escape') { event.preventDefault(); closeHelp() }
    if (event.key === 'Tab') { event.preventDefault(); help.querySelector('[data-help-close]').focus() }
    return
  }
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable
  if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') || (event.key === '/' && !typing)) {
    event.preventDefault()
    input.focus()
    return
  }
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 't') { event.preventDefault(); toggleView() }
  else if (key === 's' || key === 'o' || key === 'a') {
    event.preventDefault()
    setMode({ s: 'search', o: 'open', a: 'add' }[key])
  }
  else if (key === 'u') { event.preventDefault(); fileInput.click() }
  else if (key === 'j' || event.key === 'ArrowDown') {
    event.preventDefault()
    selectPaper(selectedPaper < 0 ? 0 : selectedPaper + 1)
  }
  else if (key === 'k' || event.key === 'ArrowUp') {
    event.preventDefault()
    selectPaper(selectedPaper < 0 ? 0 : selectedPaper - 1)
  }
  else if (event.key === 'Enter' && selectedPaper >= 0) {
    event.preventDefault()
    announce(`Prototype: opening “${papers[selectedPaper].title}”`)
  }
  else if (event.key === '?') { event.preventDefault(); openHelp() }
})

if (document.body.classList.contains('v5')) {
  const syncScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 200)
  window.addEventListener('scroll', syncScroll, { passive: true })
  syncScroll()
}
