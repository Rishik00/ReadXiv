importScripts('shared.js');

const API_URL = 'http://localhost:7474/api/arxiv/add';

async function addPaper(url) {
  const input = ReadXivExtension.paperUrl(url);
  if (!input) {
    throw new Error('Open an arXiv abstract or PDF page first.');
  }

  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  } catch (_error) {
    throw new Error('ReadXiv is not reachable. Start the local server and try again.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `ReadXiv returned status ${response.status}.`);
  }

  return data;
}

async function notify(copy) {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon.svg'),
    title: copy.title,
    message: copy.message,
    priority: 1,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ADD_PAPER') return false;

  addPaper(message.url)
    .then(async (paper) => {
      const copy = ReadXivExtension.resultCopy(paper);
      await notify(copy).catch(() => {});
      sendResponse({ ok: true, paper, copy });
    })
    .catch(async (error) => {
      const copy = {
        kind: 'error',
        title: 'Paper not added',
        message: error.message,
      };
      await notify(copy).catch(() => {});
      sendResponse({ ok: false, error: error.message, copy });
    });

  return true;
});
