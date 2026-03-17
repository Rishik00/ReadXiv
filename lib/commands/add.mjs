import axios from 'axios';
import ora from 'ora';
import { extractArxivId } from '../utils/arxiv.mjs';
import { ensureConfig } from '../utils/config.mjs';
import { ensureServerRunning } from '../utils/server-manager.mjs';

export async function addCommand(input) {
  if (!input) {
    throw new Error('Missing arXiv input. Usage: readxiv add:<arxiv_link> or readxiv add <arxiv_link>');
  }

  const arxivId = extractArxivId(input);
  if (!arxivId) {
    throw new Error('Invalid arXiv link or id.');
  }

  const config = await ensureConfig();
  await ensureServerRunning(config.serverPort, config.autoStartServer);

  const spinner = ora(`Adding arXiv:${arxivId}...`).start();
  try {
    const response = await axios.post(`http://127.0.0.1:${config.serverPort}/api/arxiv/add`, {
      input: arxivId,
    });
    const paper = response.data;
    spinner.succeed(`Added: ${paper.title || arxivId}`);
    if (paper.authors) console.log(`Authors: ${paper.authors}`);
    if (paper.alreadyExists) console.log('Paper already existed in your database.');
  } catch (error) {
    spinner.fail('Failed to add paper');
    throw new Error(error.response?.data?.error || error.message);
  }
}
