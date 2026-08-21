import initSqlJs from 'sql.js';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';

// Tests and benchmarks can point at an isolated data directory.
const PAPYRUS_DIR = process.env.READXIV_DATA_DIR
  ? path.resolve(process.env.READXIV_DATA_DIR)
  : path.join(os.homedir(), '.papyrus');
const DB_PATH = path.join(PAPYRUS_DIR, 'papyrus.db');
const DB_BACKUP_PATH = `${DB_PATH}.backup`;
const LEGACY_BACKUPS_DIR = path.join(PAPYRUS_DIR, 'backups');
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'ascii');

let db = null;
let SQL = null;
let scheduledSave = null;

function isSQLiteDatabaseFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(descriptor, header, 0, header.length, 0);
    return bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER);
  } finally {
    fs.closeSync(descriptor);
  }
}

function quarantineInvalidDatabase(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const quarantinedPath = `${filePath}.corrupt-${timestamp}`;
  fs.moveSync(filePath, quarantinedPath);
  console.error(`⚠️ Invalid database preserved at ${quarantinedPath}`);
  return quarantinedPath;
}

function findValidBackup() {
  const candidates = [DB_BACKUP_PATH];
  if (fs.existsSync(LEGACY_BACKUPS_DIR)) {
    const datedBackups = fs.readdirSync(LEGACY_BACKUPS_DIR)
      .filter((name) => name.startsWith('papyrus-') && name.endsWith('.db'))
      .sort()
      .reverse()
      .map((name) => path.join(LEGACY_BACKUPS_DIR, name));
    candidates.push(...datedBackups);
  }
  return candidates.find(isSQLiteDatabaseFile) || null;
}

function loadDatabaseData() {
  if (!fs.existsSync(DB_PATH)) return null;
  if (isSQLiteDatabaseFile(DB_PATH)) return fs.readFileSync(DB_PATH);

  quarantineInvalidDatabase(DB_PATH);
  const validBackup = findValidBackup();
  if (validBackup) {
    fs.copyFileSync(validBackup, DB_PATH);
    console.warn(`♻️ Restored database from ${validBackup}`);
    return fs.readFileSync(DB_PATH);
  }

  console.warn('Creating a new database because no valid backup was available.');
  return null;
}

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
  fs.ensureDirSync(path.join(PAPYRUS_DIR, 'offline'));
  fs.ensureDirSync(path.join(PAPYRUS_DIR, 'notes'));

  // Initialize sql.js
  if (!SQL) {
    SQL = await initSqlJs();
  }

  // Load existing database or create new one
  const dbData = loadDatabaseData();

  db = new SQL.Database(dbData);
  db.run('PRAGMA foreign_keys = ON');

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
      important INTEGER DEFAULT 0,
      important_at TEXT,
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

    CREATE TABLE IF NOT EXISTS analytics_events (
      id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      route TEXT,
      paper_id TEXT,
      paper_title TEXT,
      session_id TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reading_sessions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES papers(id),
      session_id TEXT NOT NULL,
      active_seconds INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS paper_collections (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (paper_id, collection_id)
    );

    CREATE INDEX IF NOT EXISTS idx_papers_status ON papers(status);
    CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);
    CREATE INDEX IF NOT EXISTS idx_highlights_paper ON highlights(paper_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_event_name ON analytics_events(event_name);
    CREATE INDEX IF NOT EXISTS idx_analytics_route ON analytics_events(route);
    CREATE INDEX IF NOT EXISTS idx_analytics_paper ON analytics_events(paper_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_reading_sessions_paper ON reading_sessions(paper_id);
    CREATE INDEX IF NOT EXISTS idx_reading_sessions_updated ON reading_sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_paper_collections_collection ON paper_collections(collection_id);
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
  if (!papersCols.includes('important')) {
    db.run('ALTER TABLE papers ADD COLUMN important INTEGER DEFAULT 0');
  }
  if (!papersCols.includes('important_at')) {
    db.run('ALTER TABLE papers ADD COLUMN important_at TEXT');
  }
  if (!papersCols.includes('citation_count')) {
    db.run('ALTER TABLE papers ADD COLUMN citation_count INTEGER');
  }
  if (!papersCols.includes('current_page')) {
    db.run('ALTER TABLE papers ADD COLUMN current_page INTEGER DEFAULT 1');
  }
  if (!papersCols.includes('total_pages')) {
    db.run('ALTER TABLE papers ADD COLUMN total_pages INTEGER');
  }
  if (!papersCols.includes('last_read_at')) {
    db.run('ALTER TABLE papers ADD COLUMN last_read_at TEXT');
  }
  if (!papersCols.includes('note_file_path')) {
    db.run('ALTER TABLE papers ADD COLUMN note_file_path TEXT');
  }
  if (!papersCols.includes('published_at')) {
    db.run('ALTER TABLE papers ADD COLUMN published_at TEXT');
  }
  if (!papersCols.includes('published_url')) {
    db.run('ALTER TABLE papers ADD COLUMN published_url TEXT');
  }
  if (!papersCols.includes('published_hash')) {
    db.run('ALTER TABLE papers ADD COLUMN published_hash TEXT');
  }
  if (!papersCols.includes('page_count')) {
    db.run('ALTER TABLE papers ADD COLUMN page_count INTEGER');
  }
  if (!papersCols.includes('offline_pinned')) {
    db.run('ALTER TABLE papers ADD COLUMN offline_pinned INTEGER DEFAULT 0');
  }

  const papersColsFinal = db.exec('PRAGMA table_info(papers)');
  const colNames =
    papersColsFinal.length > 0 ? papersColsFinal[0].values.map((r) => r[1]) : [];
  if (!colNames.includes('todoist_task_id')) {
    db.run('ALTER TABLE papers ADD COLUMN todoist_task_id TEXT');
  }

  const collectionsInfo = db.exec('PRAGMA table_info(collections)');
  const collectionCols = collectionsInfo.length > 0 ? collectionsInfo[0].values.map((r) => r[1]) : [];
  if (!collectionCols.includes('description')) db.run('ALTER TABLE collections ADD COLUMN description TEXT');

  db.run('CREATE INDEX IF NOT EXISTS idx_papers_important ON papers(important, important_at)');
  db.run('DELETE FROM paper_collections WHERE paper_id NOT IN (SELECT id FROM papers) OR collection_id NOT IN (SELECT id FROM collections)');

  db.run('DROP TABLE IF EXISTS reading_queue');

  // Save database
  saveDB();

  console.log(`📦 Database initialized at ${DB_PATH}`);
  return db;
}

export function saveDB() {
  if (db) {
    if (scheduledSave) {
      clearTimeout(scheduledSave);
      scheduledSave = null;
    }
    const data = db.export();
    const temporaryPath = `${DB_PATH}.tmp-${process.pid}`;
    const descriptor = fs.openSync(temporaryPath, 'w');
    try {
      fs.writeFileSync(descriptor, data);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }

    try {
      if (isSQLiteDatabaseFile(DB_PATH)) {
        fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
      }
      fs.moveSync(temporaryPath, DB_PATH, { overwrite: true });
    } finally {
      fs.removeSync(temporaryPath);
    }
  }
}

export function scheduleSaveDB(delayMs = 1000) {
  if (!db || scheduledSave) return;
  scheduledSave = setTimeout(() => {
    scheduledSave = null;
    saveDB();
  }, delayMs);
  scheduledSave.unref?.();
}

export { PAPYRUS_DIR, DB_PATH, DB_BACKUP_PATH };
