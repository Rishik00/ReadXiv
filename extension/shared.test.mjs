import test from 'node:test';
import assert from 'node:assert/strict';
import './shared.js';

const { getArxivId, paperUrl, resultCopy } = globalThis.ReadXivExtension;

test('extracts a canonical id from abstract and PDF URLs', () => {
  assert.equal(getArxivId('https://arxiv.org/abs/2301.07041v2'), '2301.07041');
  assert.equal(getArxivId('https://arxiv.org/pdf/2406.12345.pdf'), '2406.12345');
});

test('rejects tabs that are not arXiv papers', () => {
  assert.equal(getArxivId('https://example.com/paper/2301.07041'), null);
  assert.equal(paperUrl('chrome://extensions'), null);
});

test('normalizes captured URLs before sending them to ReadXiv', () => {
  assert.equal(
    paperUrl('https://arxiv.org/pdf/2301.07041v3.pdf?download=1'),
    'https://arxiv.org/abs/2301.07041'
  );
});

test('uses explicit copy for duplicate papers', () => {
  assert.deepEqual(resultCopy({ alreadyExists: true }), {
    kind: 'exists',
    title: 'Already in your library',
    message: 'This paper has already been added.',
  });
});
