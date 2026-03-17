import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
  PAPYRUS_DIR,
  PDFS_DIR,
  NOTES_DIR,
  CANVAS_DIR,
  PROJECTS_DIR,
  CONFIG_PATH,
} from './paths.mjs';

const DEFAULT_CONFIG = {
  serverPort: 7474,
  clientPort: 5173,
  autoStartServer: true,
  defaultBrowser: 'system',
  exportDir: path.join(os.homedir(), 'Downloads'),
};

export async function ensurePapyrusDirs() {
  await fs.ensureDir(PAPYRUS_DIR);
  await fs.ensureDir(PDFS_DIR);
  await fs.ensureDir(NOTES_DIR);
  await fs.ensureDir(CANVAS_DIR);
  await fs.ensureDir(PROJECTS_DIR);
}

export async function getConfig() {
  if (!(await fs.pathExists(CONFIG_PATH))) {
    return { ...DEFAULT_CONFIG };
  }

  const fileConfig = await fs.readJson(CONFIG_PATH);
  return { ...DEFAULT_CONFIG, ...fileConfig };
}

export async function saveConfig(config) {
  await fs.ensureDir(PAPYRUS_DIR);
  await fs.writeJson(CONFIG_PATH, config, { spaces: 2 });
}

export async function ensureConfig() {
  await ensurePapyrusDirs();
  const config = await getConfig();
  await saveConfig(config);
  return config;
}
