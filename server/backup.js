import path from 'path';
import fs from 'fs-extra';
import { DB_PATH, PAPYRUS_DIR } from './db.js';

const BACKUPS_DIR = path.join(PAPYRUS_DIR, 'backups');
const STATE_PATH = path.join(PAPYRUS_DIR, 'backup-state.json');
const MAX_BACKUPS = 20;

function readState() {
  try {
    if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {}
  return { lastBackupAt: null, intervalDays: 7 };
}

function writeState(patch) {
  const state = { ...readState(), ...patch };
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return state;
}

export function getBackupState() {
  const state = readState();
  fs.ensureDirSync(BACKUPS_DIR);
  const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('papyrus-') && f.endsWith('.db')).sort().reverse();
  return {
    lastBackupAt: state.lastBackupAt || null,
    intervalDays: state.intervalDays ?? 7,
    backupCount: files.length,
    backupsDir: BACKUPS_DIR,
    recentBackups: files.slice(0, 5).map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { filename: f, size: stat.size, createdAt: stat.mtime.toISOString() };
    }),
  };
}

export function setBackupInterval(days) {
  writeState({ intervalDays: days });
}

export async function performBackup() {
  fs.ensureDirSync(BACKUPS_DIR);

  if (!fs.existsSync(DB_PATH)) throw new Error('Database file not found — nothing to back up.');

  const now = new Date();
  const ts = now.toISOString().replace(/T/, '_').replace(/:/g, '-').slice(0, 19);
  const dest = path.join(BACKUPS_DIR, `papyrus-${ts}.db`);

  await fs.copy(DB_PATH, dest);

  // Rotate: keep newest MAX_BACKUPS
  const all = fs.readdirSync(BACKUPS_DIR)
    .filter((f) => f.startsWith('papyrus-') && f.endsWith('.db'))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - MAX_BACKUPS))) {
    await fs.remove(path.join(BACKUPS_DIR, old));
  }

  writeState({ lastBackupAt: now.toISOString() });

  const stat = fs.statSync(dest);
  console.log(`📦 Backup saved: ${dest} (${(stat.size / 1024).toFixed(1)} KB)`);
  return { path: dest, size: stat.size, timestamp: now.toISOString() };
}

export function checkScheduledBackup() {
  const state = readState();
  const intervalDays = state.intervalDays ?? 7;
  if (intervalDays <= 0) return; // disabled

  const shouldBackup = !state.lastBackupAt
    || (Date.now() - new Date(state.lastBackupAt).getTime()) / 86400000 >= intervalDays;

  if (shouldBackup) {
    performBackup()
      .then(() => console.log('📦 Scheduled backup complete.'))
      .catch((err) => console.error('📦 Scheduled backup failed:', err.message));
  }
}
