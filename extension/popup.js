const button = document.querySelector('#add-button');
const buttonLabel = document.querySelector('#button-label');
const visitButton = document.querySelector('#visit-button');
const status = document.querySelector('#status');
const paperTitle = document.querySelector('#paper-title');
const paperNumber = document.querySelector('#paper-number');

let activeUrl = null;
let isAdding = false;
let capturedPaperId = null;

function showStatus(copy) {
  status.hidden = false;
  status.dataset.kind = copy.kind;
  status.textContent = copy.message;
}

function setReady(tab) {
  const id = ReadXivExtension.getArxivId(tab?.url);
  activeUrl = id ? tab.url : null;
  paperNumber.textContent = id || '—';
  paperTitle.textContent = id
    ? (tab.title || `arXiv:${id}`)
    : 'Open an arXiv abstract or PDF page first.';
  button.disabled = !id;
  if (id) button.focus();
}

async function capturePaper() {
  if (!activeUrl || isAdding) return;
  isAdding = true;
  button.disabled = true;
  buttonLabel.textContent = 'Adding…';
  status.hidden = true;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'ADD_PAPER', url: activeUrl });
    showStatus(response.copy);
    capturedPaperId = response.ok ? response.paper?.id : null;
    buttonLabel.textContent = response.ok
      ? (response.copy.kind === 'exists' ? 'Already added' : 'Added')
      : 'Try again';
    button.disabled = response.ok;
    visitButton.hidden = !capturedPaperId;
  } catch (_error) {
    showStatus({ kind: 'error', message: 'The extension could not reach ReadXiv. Reload it and try again.' });
    buttonLabel.textContent = 'Try again';
    button.disabled = false;
  } finally {
    isAdding = false;
  }
}

button.addEventListener('click', capturePaper);
visitButton.addEventListener('click', async () => {
  if (!capturedPaperId) return;
  await chrome.tabs.create({
    url: `http://localhost:7474/p/${encodeURIComponent(capturedPaperId)}`,
  });
  window.close();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !button.disabled) capturePaper();
});

chrome.tabs.query({ active: true, currentWindow: true })
  .then(([tab]) => setReady(tab))
  .catch(() => setReady(null));
