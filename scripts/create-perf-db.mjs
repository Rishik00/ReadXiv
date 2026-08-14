import fs from 'fs-extra';
import initSqlJs from 'sql.js';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(os.homedir(), '.papyrus');
const sourceDbPath = path.join(sourceDir, 'papyrus.db');
const outputDir = path.join(root, '.perf', 'data');
const outputDbPath = path.join(outputDir, 'papyrus.db');
const sampleSize = 55;

if (!(await fs.pathExists(sourceDbPath))) {
  throw new Error(`ReadXiv database not found at ${sourceDbPath}`);
}

await fs.ensureDir(outputDir);
await fs.emptyDir(outputDir);
for (const name of ['pdfs', 'notes', 'offline', 'canvas']) {
  await fs.ensureDir(path.join(outputDir, name));
}

const SQL = await initSqlJs();
const db = new SQL.Database(await fs.readFile(sourceDbPath));

function objects(sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const rows = [];
  while (statement.step()) rows.push(statement.getAsObject());
  statement.free();
  return rows;
}

const sample = objects(
  `SELECT *
   FROM papers
   ORDER BY
     CASE status WHEN 'reading' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
     COALESCE(last_accessed_at, updated_at, created_at) DESC
   LIMIT ?`,
  [sampleSize]
);
const ids = sample.map((paper) => paper.id);

if (ids.length < 50) {
  throw new Error(`Expected at least 50 papers, found ${ids.length}`);
}

const placeholders = ids.map(() => '?').join(',');
db.run(`DELETE FROM papers WHERE id NOT IN (${placeholders})`, ids);
db.run(
  `DELETE FROM analytics_events
   WHERE paper_id IS NOT NULL AND paper_id NOT IN (${placeholders})`,
  ids
);
db.run(`DELETE FROM reading_sessions WHERE paper_id NOT IN (${placeholders})`, ids);
db.run(`DELETE FROM highlights WHERE paper_id NOT IN (${placeholders})`, ids);

// Copy notes for the sample and a few PDFs so Reader measurements stay realistic
// without duplicating the entire library.
let copiedNotes = 0;
let copiedPdfs = 0;
for (const paper of sample) {
  const sourceNote = path.join(sourceDir, 'notes', `${paper.id}.md`);
  if (await fs.pathExists(sourceNote)) {
    await fs.copy(sourceNote, path.join(outputDir, 'notes', `${paper.id}.md`));
    copiedNotes += 1;
  }

  if (copiedPdfs < 3) {
    const candidates = [
      paper.pdf_path,
      path.join(sourceDir, 'pdfs', `${paper.id}.pdf`),
    ].filter(Boolean);
    const sourcePdf = candidates.find((candidate) => fs.existsSync(candidate));
    if (sourcePdf) {
      const targetPdf = path.join(outputDir, 'pdfs', `${paper.id}.pdf`);
      await fs.copy(sourcePdf, targetPdf);
      db.run('UPDATE papers SET pdf_path = ? WHERE id = ?', [targetPdf, paper.id]);
      copiedPdfs += 1;
      continue;
    }
  }
  db.run('UPDATE papers SET pdf_path = NULL WHERE id = ?', [paper.id]);
}

db.run('VACUUM');
await fs.writeFile(outputDbPath, Buffer.from(db.export()));

const statusCounts = objects(
  'SELECT status, COUNT(*) AS count FROM papers GROUP BY status ORDER BY count DESC'
);
const analyticsCount = objects('SELECT COUNT(*) AS count FROM analytics_events')[0].count;
const outputSize = (await fs.stat(outputDbPath)).size;
db.close();

const manifest = {
  createdAt: new Date().toISOString(),
  sourceDbPath,
  outputDbPath,
  papers: ids.length,
  statusCounts,
  analyticsEvents: analyticsCount,
  copiedNotes,
  copiedPdfs,
  databaseBytes: outputSize,
  paperIds: ids,
};
await fs.writeJson(path.join(root, '.perf', 'sample.json'), manifest, { spaces: 2 });

console.log(JSON.stringify(manifest, null, 2));
