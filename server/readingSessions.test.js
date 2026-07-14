import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {
  getReadingTimeTotals,
  normalizeReadingHeartbeat,
  recordReadingHeartbeat,
} from './readingSessions.js';

async function createDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE reading_sessions (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    active_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT,
    updated_at TEXT
  )`);
  return db;
}

test('normalizes and caps reading heartbeats', () => {
  assert.equal(normalizeReadingHeartbeat({
    id: 'read-1', paperId: 'paper-1', sessionId: 'app-1', activeSeconds: 90,
  }).activeSeconds, 60);
  assert.throws(
    () => normalizeReadingHeartbeat({ id: 'read-1', paperId: '', sessionId: 'app-1', activeSeconds: 4 }),
    /Paper id is required/
  );
});

test('accumulates heartbeats without creating duplicate sessions', async () => {
  const db = await createDatabase();
  const input = { id: 'read-1', paperId: 'paper-1', sessionId: 'app-1', activeSeconds: 12 };
  recordReadingHeartbeat(db, input, '2026-07-14T08:00:00.000Z');
  recordReadingHeartbeat(db, { ...input, activeSeconds: 8 }, '2026-07-14T08:01:00.000Z');
  const result = db.exec('SELECT COUNT(*), active_seconds FROM reading_sessions');
  assert.deepEqual(result[0].values[0], [1, 20]);
});

test('returns total and current-week reading time', async () => {
  const db = await createDatabase();
  recordReadingHeartbeat(
    db,
    { id: 'recent', paperId: 'p1', sessionId: 'app', activeSeconds: 30 },
    '2026-07-14T08:00:00.000Z'
  );
  recordReadingHeartbeat(
    db,
    { id: 'old', paperId: 'p2', sessionId: 'app', activeSeconds: 40 },
    '2026-06-01T08:00:00.000Z'
  );
  assert.deepEqual(getReadingTimeTotals(db, '2026-07-14T12:00:00.000Z'), {
    totalSeconds: 70,
    thisWeekSeconds: 30,
  });
});
