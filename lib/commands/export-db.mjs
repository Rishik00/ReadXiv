import path from 'path';
import os from 'os';
import ora from 'ora';
import { exportToExcel } from '../utils/db-utils.mjs';
import { ensureConfig } from '../utils/config.mjs';

export async function exportDbCommand(customPath) {
  const config = await ensureConfig();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const defaultPath = path.join(config.exportDir || path.join(os.homedir(), 'Downloads'), `readxiv-export-${stamp}.xlsx`);
  const targetPath = customPath ? path.resolve(customPath) : defaultPath;

  const spinner = ora('Exporting database to Excel...').start();
  try {
    const result = await exportToExcel(targetPath);
    spinner.succeed(`Exported ${result.rows} papers`);
    console.log(`File: ${result.outputPath}`);
  } catch (error) {
    spinner.fail('Export failed');
    throw error;
  }
}
