import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import ora from 'ora';
import { extractArxivId } from '../utils/arxiv.mjs';
import { ensureConfig } from '../utils/config.mjs';
import { ensureServerRunning } from '../utils/server-manager.mjs';
import { NOTES_DIR, PDFS_DIR } from '../utils/paths.mjs';

export async function removeCommand(input) {
  if (!input) {
    throw new Error('Missing arXiv input. Usage: readxiv remove:<arxiv_link> or readxiv remove <arxiv_link>');
  }

  const arxivId = extractArxivId(input) ?? input.trim();
  const config = await ensureConfig();
  await ensureServerRunning(config.serverPort, config.autoStartServer);

  const spinner = ora(`Removing ${arxivId}...`).start();
  try {
    await axios.delete(`http://127.0.0.1:${config.serverPort}/api/papers/${encodeURIComponent(arxivId)}`);

    const pdfPath = path.join(PDFS_DIR, `${arxivId}.pdf`);
    const notesPath = path.join(NOTES_DIR, `${arxivId}.md`);
    await fs.remove(pdfPath);
    await fs.remove(notesPath);

    spinner.succeed(`Removed: ${arxivId}`);
  } catch (error) {
    spinner.fail('Failed to remove paper');
    throw new Error(error.response?.data?.error || error.message);
  }
}
