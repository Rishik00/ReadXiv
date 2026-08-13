import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { PACKAGE_ROOT } from '../utils/paths.mjs';

export async function startAppCommand() {
  console.log('Starting ReadXiv desktop app...');
  const clientBuild = path.join(PACKAGE_ROOT, 'client', 'dist', 'index.html');
  if (!(await fs.pathExists(clientBuild))) {
    throw new Error('Desktop client build is missing. Run "npm run build" once, then retry.');
  }

  const electronCli = path.join(PACKAGE_ROOT, 'node_modules', 'electron', 'cli.js');
  if (!(await fs.pathExists(electronCli))) {
    throw new Error('Electron is missing. Run "npm install" once, then retry.');
  }

  const child = spawn(process.execPath, [electronCli, path.join('electron', 'main.js')], {
    cwd: PACKAGE_ROOT,
    env: { ...process.env, READXIV_USE_BUILT_CLIENT: '1' },
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(`Could not start ReadXiv desktop app: ${error.message}`);
    process.exit(1);
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
