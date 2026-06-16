import express from 'express';
import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { getDB, saveDB, PAPYRUS_DIR } from '../db.js';
import { getSemanticScholarApiKey } from '../todoistConfig.js';

const router = express.Router();

const ARXIV_UA =
  'ReadXiv/1.0 (arxiv metadata; +https://github.com/readxiv; contact: local-app)';
const METADATA_CACHE_TTL_MS = 30 * 60 * 1000;
const ARXIV_API_MIN_INTERVAL_MS = 6000;
const ARXIV_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const METADATA_CACHE_MAX_ENTRIES = 100;
const S2_BASE = 'https://api.semanticscholar.org/graph/v1';
const metadataCache = new Map();
const metadataRequests = new Map();
let lastArxivApiRequestAt = 0;
let arxivRateLimitedUntil = 0;
let arxivApiQueue = Promise.resolve();

class ArxivRateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ArxivRateLimitError';
    this.status = 429;
  }
}

function isRetryableArxivError(error) {
  if (!error) return false;
  if (error.code === 'ECONNABORTED' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
    return true;
  }
  if (error.response) {
    const s = error.response.status;
    return s === 502 || s === 503 || s === 504;
  }
  return Boolean(error.request);
}

function isArxivRateLimitError(error) {
  return error?.status === 429 || error?.response?.status === 429;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSerializedArxivApiRequest(fn) {
  const run = arxivApiQueue
    .catch(() => {})
    .then(async () => {
      if (Date.now() < arxivRateLimitedUntil) {
        throw new ArxivRateLimitError('arXiv rate limit cooldown is active.');
      }
      const elapsed = Date.now() - lastArxivApiRequestAt;
      if (elapsed < ARXIV_API_MIN_INTERVAL_MS) {
        await sleep(ARXIV_API_MIN_INTERVAL_MS - elapsed);
      }
      lastArxivApiRequestAt = Date.now();
      return fn();
    });
  arxivApiQueue = run.catch(() => {});
  return run;
}

function normalizeSemanticScholarMetadata(data, arxivId) {
  if (!data || typeof data !== 'object') return null;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) return null;
  const authors = Array.isArray(data.authors)
    ? data.authors
        .map((author) => (typeof author?.name === 'string' ? author.name.trim() : ''))
        .filter(Boolean)
        .join(', ')
    : '';
  return {
    title,
    authors: authors || 'Unknown',
    abstract: typeof data.abstract === 'string' ? data.abstract.trim() : '',
    year: Number.isFinite(data.year) ? data.year : null,
    arxivId,
  };
}

async function fetchFallbackMetadata(arxivId, cause) {
  try {
    const fallback = await fetchSemanticScholarMetadata(arxivId);
    if (fallback) return fallback;
  } catch (fallbackError) {
    console.warn(
      `${cause} Semantic Scholar metadata fallback failed:`,
      fallbackError?.response?.status || fallbackError?.message || fallbackError
    );
  }
  return null;
}

async function fetchSemanticScholarMetadata(arxivId) {
  const fields = 'title,abstract,authors,year,externalIds';
  const headers = {};
  const apiKey = getSemanticScholarApiKey();
  if (apiKey) headers['x-api-key'] = apiKey;
  const response = await axios.get(
    `${S2_BASE}/paper/${encodeURIComponent(`ARXIV:${arxivId}`)}`,
    {
      params: { fields },
      headers,
      timeout: 18000,
      maxRedirects: 5,
    }
  );
  return normalizeSemanticScholarMetadata(response.data, arxivId);
}

// Extract arxiv ID from URL or string
export function extractArxivId(input) {
  // Match arxiv.org URLs
  const urlMatch = input.match(/arxiv\.org\/(?:abs|pdf)\/(\d{4}\.\d{4,5})(?:v\d+)?/);
  if (urlMatch) return urlMatch[1];
  
  // Match bare arxiv ID (e.g., 2301.07041)
  const idMatch = input.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/);
  if (idMatch) return idMatch[1];
  
  return null;
}

// Fetch paper metadata from arxiv API with retry on rate limit / flaky network
export async function fetchArxivMetadata(arxivId, retries = 4) {
  const cached = metadataCache.get(arxivId);
  if (cached && Date.now() - cached.createdAt < METADATA_CACHE_TTL_MS) {
    return cached.metadata;
  }
  if (cached) metadataCache.delete(arxivId);

  const inFlight = metadataRequests.get(arxivId);
  if (inFlight) return inFlight;

  const request = fetchArxivMetadataUncached(arxivId, retries)
    .then((metadata) => {
      metadataCache.set(arxivId, { metadata, createdAt: Date.now() });
      while (metadataCache.size > METADATA_CACHE_MAX_ENTRIES) {
        metadataCache.delete(metadataCache.keys().next().value);
      }
      return metadata;
    })
    .finally(() => {
      metadataRequests.delete(arxivId);
    });

  metadataRequests.set(arxivId, request);
  return request;
}

async function fetchArxivMetadataUncached(arxivId, retries = 4) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await runSerializedArxivApiRequest(() =>
        axios.get(`https://export.arxiv.org/api/query?id_list=${arxivId}`, {
          headers: {
            Accept: 'application/atom+xml',
            'User-Agent': ARXIV_UA,
          },
          timeout: 28000,
          maxRedirects: 5,
        })
      );
      
      // Parse XML response (simplified - in production use proper XML parser)
      const xml = response.data;
    
    // Extract title (skip the feed title, get the entry title)
    const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
    if (!entryMatch) {
      throw new Error('No entry found in arxiv response');
    }
    
    const entry = entryMatch[1];
    const titleMatch = entry.match(/<title>(.*?)<\/title>/s);
    const summaryMatch = entry.match(/<summary>(.*?)<\/summary>/s);
    const authorMatches = entry.match(/<author>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<\/author>/g) || [];
    const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
    
    const title = titleMatch 
      ? titleMatch[1].replace(/^\s*|\s*$/g, '').replace(/\s+/g, ' ').trim()
      : `arXiv:${arxivId}`;
    const abstract = summaryMatch 
      ? summaryMatch[1].replace(/^\s*|\s*$/g, '').replace(/\s+/g, ' ').trim()
      : '';
    const authors = authorMatches.length > 0
      ? authorMatches.map(m => {
          const nameMatch = m.match(/<name>(.*?)<\/name>/);
          return nameMatch ? nameMatch[1].trim() : '';
        }).filter(Boolean).join(', ')
      : 'Unknown';
    const published = publishedMatch ? publishedMatch[1] : '';
    const year = published ? new Date(published).getFullYear() : null;
    
      return { title, authors, abstract, year, arxivId };
    } catch (error) {
      if (isArxivRateLimitError(error)) {
        arxivRateLimitedUntil = Date.now() + ARXIV_RATE_LIMIT_COOLDOWN_MS;
        const fallback = await fetchFallbackMetadata(arxivId, 'arXiv rate limit.');
        if (fallback) return fallback;
        const retryAfter = error.response?.headers?.['retry-after'];
        const message = retryAfter
          ? `arXiv rate limit exceeded. Try again after ${retryAfter} seconds.`
          : 'arXiv rate limit exceeded. Please wait before trying again.';
        throw new ArxivRateLimitError(message);
      }
      if (attempt < retries - 1 && isRetryableArxivError(error)) {
        const delayMs = Math.min(1500 * Math.pow(2, attempt), 12000);
        console.warn(
          `arXiv metadata request failed (${error.message}), retrying in ${delayMs}ms (${attempt + 1}/${retries})`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      console.error('Error fetching arxiv metadata:', error?.message || error);
      throw new Error(`Failed to fetch arxiv metadata: ${error.message}`);
    }
  }
  throw new Error('Failed to fetch arxiv metadata after retries');
}

// Download PDF from arxiv with retry on rate limit
async function downloadPDF(arxivId, retries = 3) {
  const pdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
  const pdfPath = path.join(PAPYRUS_DIR, 'pdfs', `${arxivId}.pdf`);
  
  for (let attempt = 0; attempt < retries; attempt++) {
    const temporaryPath = `${pdfPath}.download-${randomUUID()}`;
    try {
      const response = await axios.get(pdfUrl, {
        responseType: 'stream',
        timeout: 120000,
        maxRedirects: 5,
        headers: { 'User-Agent': ARXIV_UA },
      });
      await pipeline(response.data, fs.createWriteStream(temporaryPath));
      await fs.move(temporaryPath, pdfPath, { overwrite: true });
      return { pdfPath, pdfUrl };
    } catch (error) {
      await fs.remove(temporaryPath).catch(() => {});
      if (attempt < retries - 1 && (error.response?.status === 429 || isRetryableArxivError(error))) {
        const delayMs = Math.min(2000 * Math.pow(2, attempt), 16000);
        console.warn(`arXiv PDF download retry in ${delayMs}ms (${attempt + 1}/${retries}): ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Failed to download PDF after retries');
}

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

// Preview metadata only (no DB write) - for search bar lip
router.get('/preview', async (req, res) => {
  return res.status(503).json({
    error: 'Metadata preview is disabled because arXiv and fallback metadata APIs are rate-limiting this client.',
    code: 'metadata_disabled',
  });
});

// Add paper from arxiv URL/ID
router.post('/add', async (req, res) => {
  try {
    const { input } = req.body;
    
    if (!input || !input.trim()) {
      return res.status(400).json({ error: 'Input required' });
    }
    
    const arxivId = extractArxivId(input.trim());
    if (!arxivId) {
      return res.status(400).json({ error: 'Invalid arxiv URL or ID' });
    }
    
    const database = await getDB();
    
    // Check if paper already exists
    const existingResult = database.exec('SELECT * FROM papers WHERE id = ?', [arxivId]);
    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      const columns = existingResult[0].columns;
      const existing = Object.fromEntries(columns.map((col, i) => [col, existingResult[0].values[0][i]]));
      return res.json({ ...existing, alreadyExists: true });
    }
    
    const metadata = {
      title: `arXiv:${arxivId}`,
      authors: 'Unknown',
      abstract: '',
      year: Number(`20${arxivId.slice(0, 2)}`),
      arxivId,
    };
    
    // Create notes file
    const notesPath = path.join(PAPYRUS_DIR, 'notes', `${arxivId}.md`);
    await fs.writeFile(notesPath, `# ${metadata.title}\n\n`);
    
    // Insert immediately without metadata lookup. Metadata fetches are rate
    // limited hard enough that they should be explicit, not part of /add.
    const now = new Date().toISOString();
    const plannedPdfPath = path.join(PAPYRUS_DIR, 'pdfs', `${arxivId}.pdf`);
    const plannedPdfUrl = `https://arxiv.org/pdf/${arxivId}.pdf`;
    
    database.run(`
      INSERT INTO papers (id, title, authors, abstract, url, pdf_path, pdf_url, source, year, status, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'arxiv', ?, 'loading', ?, ?, ?)
    `, [
      arxivId,
      metadata.title,
      metadata.authors,
      metadata.abstract,
      `https://arxiv.org/abs/${arxivId}`,
      plannedPdfPath,
      plannedPdfUrl,
      metadata.year,
      now,
      now,
      now
    ]);
    
    saveDB();

    const result = database.exec('SELECT * FROM papers WHERE id = ?', [arxivId]);
    const paper = rowToObject(result[0].values[0], result[0].columns);

    // Fire-and-forget PDF download in the background. Metadata is already
    // committed above, so PDF failures do not corrupt list/search data.
    void (async () => {
      try {
        const { pdfPath, pdfUrl } = await downloadPDF(arxivId);
        const db = await getDB();
        db.run(
          "UPDATE papers SET pdf_path = ?, pdf_url = ?, status = 'queued', updated_at = datetime('now') WHERE id = ?",
          [pdfPath, pdfUrl, arxivId]
        );
        saveDB();
      } catch (downloadError) {
        const db = await getDB();
        db.run(
          "UPDATE papers SET status = 'error', updated_at = datetime('now') WHERE id = ?",
          [arxivId]
        );
        saveDB();
        console.error('Background PDF download failed:', downloadError);
      }
    })();

    res.status(202).json({ ...paper, loadingInBackground: true });
  } catch (error) {
    console.error('Error adding paper:', error);
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
