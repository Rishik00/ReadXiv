import fs from 'fs-extra';
import path from 'path';
import initSqlJs from 'sql.js';
import xlsx from 'xlsx';
import { DB_PATH, PAPYRUS_DIR, PDFS_DIR, NOTES_DIR } from './paths.mjs';

let SQL = null;

async function loadSql() {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

async function openDatabase() {
  const Sql = await loadSql();
  if (!(await fs.pathExists(DB_PATH))) {
    throw new Error(`Database not found at ${DB_PATH}. Run "readxiv init" first.`);
  }
  const dbBytes = await fs.readFile(DB_PATH);
  return new Sql.Database(dbBytes);
}

function rowsToObjects(result) {
  if (!result || result.length === 0) return [];
  const { columns, values } = result[0];
  return values.map((row) => Object.fromEntries(columns.map((col, idx) => [col, row[idx]])));
}

async function getDirSize(dirPath) {
  if (!(await fs.pathExists(dirPath))) return 0;
  const entries = await fs.readdir(dirPath);
  let total = 0;
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry);
    const stats = await fs.stat(entryPath);
    if (stats.isDirectory()) total += await getDirSize(entryPath);
    else total += stats.size;
  }
  return total;
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export async function getStats() {
  const db = await openDatabase();
  const totals = rowsToObjects(db.exec('SELECT COUNT(*) AS total FROM papers'));
  const statuses = rowsToObjects(
    db.exec('SELECT status, COUNT(*) AS count FROM papers GROUP BY status ORDER BY count DESC')
  );
  const recent = rowsToObjects(
    db.exec(
      `SELECT id, title, status, COALESCE(last_accessed_at, created_at) AS last_seen
       FROM papers
       ORDER BY COALESCE(last_accessed_at, created_at) DESC
       LIMIT 5`
    )
  );

  const pdfBytes = await getDirSize(PDFS_DIR);
  const notesBytes = await getDirSize(NOTES_DIR);

  db.close();

  return {
    dbPath: DB_PATH,
    dataDir: PAPYRUS_DIR,
    totalPapers: totals[0]?.total ?? 0,
    statuses,
    recent,
    pdfBytes,
    notesBytes,
    totalBytes: pdfBytes + notesBytes,
  };
}

export async function getPaperById(id) {
  const db = await openDatabase();
  const rows = rowsToObjects(db.exec('SELECT * FROM papers WHERE id = ?', [id]));
  db.close();
  return rows[0] ?? null;
}

export async function exportToExcel(outputPath) {
  const db = await openDatabase();
  const papers = rowsToObjects(
    db.exec(
      `SELECT
        id AS ID,
        title AS Title,
        authors AS Authors,
        abstract AS Abstract,
        year AS Year,
        status AS Status,
        tags AS Tags,
        url AS URL,
        created_at AS CreatedAt,
        updated_at AS UpdatedAt,
        last_accessed_at AS LastAccessedAt
      FROM papers
      ORDER BY created_at DESC`
    )
  );
  db.close();

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(papers);
  xlsx.utils.book_append_sheet(wb, ws, 'papers');
  await fs.ensureDir(path.dirname(outputPath));
  xlsx.writeFile(wb, outputPath);

  return { outputPath, rows: papers.length };
}
