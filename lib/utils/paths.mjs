import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PACKAGE_ROOT = path.resolve(__dirname, '../..');
export const PAPYRUS_DIR = path.join(os.homedir(), '.papyrus');
export const DB_PATH = path.join(PAPYRUS_DIR, 'papyrus.db');
export const PDFS_DIR = path.join(PAPYRUS_DIR, 'pdfs');
export const NOTES_DIR = path.join(PAPYRUS_DIR, 'notes');
export const CANVAS_DIR = path.join(PAPYRUS_DIR, 'canvas');
export const PROJECTS_DIR = path.join(PAPYRUS_DIR, 'projects');
export const CONFIG_PATH = path.join(PAPYRUS_DIR, 'config.json');
export const SERVER_PID_PATH = path.join(PAPYRUS_DIR, '.server.pid');
