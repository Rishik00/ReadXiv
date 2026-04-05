import axios from 'axios';
import { getSemanticScholarApiKey } from './todoistConfig.js';

const S2_BASE = 'https://api.semanticscholar.org/graph/v1';

function s2Headers() {
  const key = getSemanticScholarApiKey();
  return key ? { 'x-api-key': key } : {};
}

function stripTrailingArxivVersion(id) {
  return String(id)
    .replace(/\.pdf$/i, '')
    .replace(/v\d+$/i, '')
    .trim();
}

/** Map a ReadXiv paper row to a Semantic Scholar paper id string (e.g. ARXIV:..., DOI:..., URL:...). */
export function resolveSemanticScholarLookupId(paper) {
  if (!paper) return null;
  const tryUrls = [paper.url, paper.pdf_url].filter((u) => typeof u === 'string' && u.trim());

  for (const u of tryUrls) {
    const doiMatch = u.match(/doi\.org\/(10\.\d{4,9}\/[^?\s#]+)/i);
    if (doiMatch) {
      return `DOI:${decodeURIComponent(doiMatch[1])}`;
    }
    const arxMatch = u.match(/arxiv\.org\/(?:abs|pdf)\/([\w.-]+)/i);
    if (arxMatch) {
      const raw = stripTrailingArxivVersion(arxMatch[1]);
      if (/^\d{4}\.\d{4,5}$/.test(raw)) return `ARXIV:${raw}`;
      return `ARXIV:${raw}`;
    }
    if (
      /^https?:\/\//i.test(u) &&
      /(semanticscholar\.org|arxiv\.org|aclweb\.org|acm\.org|biorxiv\.org)/i.test(u)
    ) {
      return `URL:${u}`;
    }
  }

  const id = paper.id && String(paper.id).trim();
  if (id) {
    if (/^\d{4}\.\d{4,5}(?:v\d+)?$/i.test(id)) {
      return `ARXIV:${stripTrailingArxivVersion(id)}`;
    }
    if (/^10\.\d{4,9}\//i.test(id)) {
      return `DOI:${id}`;
    }
  }

  return null;
}

function normalizeArxivForShelf(ext) {
  const raw = ext?.ArXiv ?? ext?.Arxiv ?? ext?.arxiv;
  if (raw == null) return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/i);
  return m ? m[1] : null;
}

/**
 * Fetches bibliography references from Semantic Scholar (remote API).
 * Returns [] if the paper is unknown to S2, on errors, or when lookup id cannot be resolved.
 */
export async function fetchReferencesFromSemanticScholar(paper) {
  const lookupId = resolveSemanticScholarLookupId(paper);
  if (!lookupId) return [];

  const encoded = encodeURIComponent(lookupId);
  const fields =
    'citedPaper.paperId,citedPaper.title,citedPaper.authors,citedPaper.year,citedPaper.externalIds';
  const headers = s2Headers();
  const out = [];
  const seen = new Set();
  let offset = 0;

  try {
    for (let page = 0; page < 40; page++) {
      const url = `${S2_BASE}/paper/${encoded}/references?offset=${offset}&limit=500&fields=${encodeURIComponent(fields)}`;
      const { status, data } = await axios.get(url, {
        timeout: 60000,
        headers,
        validateStatus: () => true,
      });

      if (status === 404) {
        return page === 0 ? [] : out;
      }
      if (status === 429) {
        console.warn('[semantic-scholar] rate limited on references');
        return out.length ? out : [];
      }
      if (status !== 200 || !data || !Array.isArray(data.data)) {
        break;
      }

      for (const row of data.data) {
        const cp = row?.citedPaper;
        if (!cp) continue;
        const pid = cp.paperId;
        if (pid) {
          if (seen.has(pid)) continue;
          seen.add(pid);
        }

        const ext = cp.externalIds || {};
        const authors = Array.isArray(cp.authors)
          ? cp.authors.map((a) => a?.name).filter(Boolean).join(', ')
          : null;

        out.push({
          title: cp.title || 'Reference',
          authors,
          doi: ext.DOI || null,
          arxivId: normalizeArxivForShelf(ext),
          label: pid || null,
        });
      }

      if (data.next == null || data.next === offset) break;
      offset = data.next;
    }
  } catch (err) {
    console.warn('[semantic-scholar] references:', err?.message || err);
    return [];
  }

  return out;
}
