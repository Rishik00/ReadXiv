/**
 * One-shot DB recovery script.
 * Scans ~/.papyrus/pdfs/ and ~/.papyrus/notes/ for arXiv IDs,
 * fetches metadata from arXiv in batches, and re-inserts missing papers.
 *
 * Usage: node server/recover-db.js
 */

import initSqlJs from 'sql.js';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import axios from 'axios';

const PAPYRUS_DIR = path.join(os.homedir(), '.papyrus');
const DB_PATH = path.join(PAPYRUS_DIR, 'papyrus.db');
const PDFS_DIR = path.join(PAPYRUS_DIR, 'pdfs');
const NOTES_DIR = path.join(PAPYRUS_DIR, 'notes');

const ARXIV_UA = 'ReadXiv/1.0 (db-recovery; local-app)';
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 7000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArxivXml(xml) {
  const entries = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    const entry = match[1];
    const idMatch = entry.match(/<id>.*?\/abs\/(\d{4}\.\d{4,5}|\d{7})(?:v\d+)?<\/id>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = entry.match(/<summary>([\s\S]*?)<\/summary>/);
    const authorMatches = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)];
    const publishedMatch = entry.match(/<published>([\s\S]*?)<\/published>/);

    if (!idMatch) continue;

    const arxivId = idMatch[1];
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : `arXiv:${arxivId}`;
    const abstract = summaryMatch ? summaryMatch[1].replace(/\s+/g, ' ').trim() : '';
    const authors = authorMatches.length
      ? authorMatches.map((m) => m[1].trim()).filter(Boolean).join(', ')
      : 'Unknown';
    const year = publishedMatch ? new Date(publishedMatch[1]).getFullYear() : null;

    entries.push({ arxivId, title, authors, abstract, year });
  }
  return entries;
}

async function fetchBatch(ids) {
  const url = `https://export.arxiv.org/api/query?id_list=${ids.join(',')}&max_results=${ids.length}`;
  const response = await axios.get(url, {
    headers: { Accept: 'application/atom+xml', 'User-Agent': ARXIV_UA },
    timeout: 30000,
  });
  return parseArxivXml(response.data);
}

async function main() {
  // Load DB
  const SQL = await initSqlJs();
  const dbData = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db = new SQL.Database(dbData);

  // Ensure table exists (in case DB is brand new)
  db.run(`
    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      authors TEXT,
      abstract TEXT,
      url TEXT,
      pdf_path TEXT,
      pdf_url TEXT,
      source TEXT DEFAULT 'arxiv',
      status TEXT DEFAULT 'queued',
      tags TEXT DEFAULT '[]',
      year INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      last_accessed_at TEXT DEFAULT (datetime('now')),
      deadline TEXT,
      scheduled_date TEXT,
      citation_count INTEGER,
      page_count INTEGER,
      offline_pinned INTEGER DEFAULT 0,
      todoist_task_id TEXT
    )
  `);

  // Collect all arXiv IDs from pdfs + notes
  const idSet = new Set();
  const idRegex = /^(\d{4}\.\d{4,5}|\d{7})(v\d+)?\.(?:pdf|md)$/;

  for (const dir of [PDFS_DIR, NOTES_DIR]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const m = file.match(idRegex);
      if (m) idSet.add(m[1]);
    }
  }

  // Find which IDs are already in the DB
  const existing = new Set();
  const rows = db.exec('SELECT id FROM papers');
  if (rows.length) {
    for (const [id] of rows[0].values) existing.add(id);
  }

  const missing = [...idSet].filter((id) => !existing.has(id));
  console.log(`Found ${idSet.size} IDs on disk, ${existing.size} already in DB, ${missing.length} to recover.`);

  if (missing.length === 0) {
    console.log('Nothing to recover.');
    process.exit(0);
  }

  // Process in batches
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < missing.length; i += BATCH_SIZE) {
    const batch = missing.slice(i, i + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(missing.length / BATCH_SIZE)}: fetching ${batch.join(', ')}`);

    let entries = [];
    try {
      entries = await fetchBatch(batch);
    } catch (err) {
      console.error(`  Batch fetch failed: ${err.message}. Inserting stubs for these IDs.`);
      // Fall through — entries stays empty, stubs will be inserted below
    }

    const fetchedIds = new Set(entries.map((e) => e.arxivId));

    // Insert fetched entries
    for (const { arxivId, title, authors, abstract, year } of entries) {
      const pdfPath = path.join(PDFS_DIR, `${arxivId}.pdf`);
      const pdfExists = fs.existsSync(pdfPath);
      try {
        db.run(
          `INSERT OR IGNORE INTO papers
             (id, title, authors, abstract, url, pdf_path, pdf_url, source, year, status, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'arxiv', ?, ?, '[]')`,
          [
            arxivId,
            title,
            authors,
            abstract,
            `https://arxiv.org/abs/${arxivId}`,
            pdfExists ? pdfPath : null,
            `https://arxiv.org/pdf/${arxivId}.pdf`,
            year,
            pdfExists ? 'queued' : 'loading',
          ]
        );
        console.log(`  ✓ ${arxivId}: ${title.slice(0, 60)}`);
        inserted++;
      } catch (e) {
        console.error(`  ✗ ${arxivId}: insert failed — ${e.message}`);
        failed++;
      }
    }

    // Insert stubs for IDs that arXiv didn't return
    for (const arxivId of batch) {
      if (fetchedIds.has(arxivId)) continue;
      const pdfPath = path.join(PDFS_DIR, `${arxivId}.pdf`);
      const pdfExists = fs.existsSync(pdfPath);
      const yearGuess = arxivId.length >= 4 ? Number(`20${arxivId.slice(0, 2)}`) : null;
      try {
        db.run(
          `INSERT OR IGNORE INTO papers
             (id, title, authors, abstract, url, pdf_path, pdf_url, source, year, status, tags)
           VALUES (?, ?, 'Unknown', '', ?, ?, ?, 'arxiv', ?, ?, '[]')`,
          [
            arxivId,
            `arXiv:${arxivId}`,
            `https://arxiv.org/abs/${arxivId}`,
            pdfExists ? pdfPath : null,
            `https://arxiv.org/pdf/${arxivId}.pdf`,
            yearGuess,
            pdfExists ? 'queued' : 'loading',
          ]
        );
        console.log(`  ~ ${arxivId}: inserted stub (metadata unavailable)`);
        inserted++;
      } catch (e) {
        console.error(`  ✗ ${arxivId}: stub insert failed — ${e.message}`);
        failed++;
      }
    }

    // Save after every batch
    fs.writeFileSync(DB_PATH, db.export());
    console.log(`  Saved. Progress: ${inserted} inserted, ${failed} failed.`);

    if (i + BATCH_SIZE < missing.length) {
      console.log(`  Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Final save
  fs.writeFileSync(DB_PATH, db.export());
  console.log(`\nDone. ${inserted} papers recovered, ${failed} failed.`);

  const finalCount = db.exec('SELECT COUNT(*) FROM papers')[0].values[0][0];
  console.log(`DB now has ${finalCount} papers.`);
}

main().catch((err) => {
  console.error('Recovery failed:', err);
  process.exit(1);
});
