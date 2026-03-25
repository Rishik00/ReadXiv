import initSqlJs from 'sql.js';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

// Papyrus data directory: ~/.papyrus/
const PAPYRUS_DIR = path.join(os.homedir(), '.papyrus');
const DB_PATH = path.join(PAPYRUS_DIR, 'papyrus.db');

let db = null;
let SQL = null;

export async function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
}

export async function initDB() {
  // Ensure .papyrus directory exists
  fs.ensureDirSync(PAPYRUS_DIR);
  fs.ensureDirSync(path.join(PAPYRUS_DIR, 'pdfs'));
  fs.ensureDirSync(path.join(PAPYRUS_DIR, 'notes'));
  fs.ensureDirSync(path.join(PAPYRUS_DIR, 'canvas'));

  // Initialize sql.js
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Load existing database or create new one
  let dbData = null;
  if (fs.existsSync(DB_PATH)) {
    dbData = fs.readFileSync(DB_PATH);
  }

  db = new SQL.Database(dbData);

  // Create tables
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
      last_accessed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      paper_id TEXT REFERENCES papers(id),
      page INTEGER,
      text TEXT,
      color TEXT DEFAULT 'yellow',
      rect_json TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
    CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);
    CREATE INDEX IF NOT EXISTS idx_highlights_paper ON highlights(paper_id);
  `);

  // Lightweight migration for existing DBs that were created before
  // `last_accessed_at` existed.
  const tableInfo = db.exec("PRAGMA table_info(papers)");
  const hasLastAccessed =
    tableInfo.length > 0 && tableInfo[0].values.some((row) => row[1] === 'last_accessed_at');

  if (!hasLastAccessed) {
    db.run('ALTER TABLE papers ADD COLUMN last_accessed_at TEXT');
    db.run("UPDATE papers SET last_accessed_at = COALESCE(last_accessed_at, created_at, datetime('now'))");
  }

  db.run('CREATE INDEX IF NOT EXISTS idx_papers_last_accessed ON papers(last_accessed_at)');

  // Migration: deadline, scheduled_date for calendar
  const papersInfo = db.exec('PRAGMA table_info(papers)');
  const papersCols = papersInfo.length > 0 ? papersInfo[0].values.map((r) => r[1]) : [];
  if (!papersCols.includes('deadline')) {
    db.run('ALTER TABLE papers ADD COLUMN deadline TEXT');
  }
  if (!papersCols.includes('scheduled_date')) {
    db.run('ALTER TABLE papers ADD COLUMN scheduled_date TEXT');
  }
  if (!papersCols.includes('citation_count')) {
    db.run('ALTER TABLE papers ADD COLUMN citation_count INTEGER');
  }
  if (!papersCols.includes('page_count')) {
    db.run('ALTER TABLE papers ADD COLUMN page_count INTEGER');
  }

  // Reading queue: ordered subset of papers to read next
  db.run(`
    CREATE TABLE IF NOT EXISTS reading_queue (
      paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run('CREATE INDEX IF NOT EXISTS idx_reading_queue_position ON reading_queue(position)');

  // Save database
  saveDB();

  console.log(`📦 Database initialized at ${DB_PATH}`);
  return db;
}

export function saveDB() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

export { PAPYRUS_DIR, DB_PATH };
