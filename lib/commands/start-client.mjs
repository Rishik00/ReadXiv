import { spawn } from 'child_process';
import open from 'open';
import { ensureConfig } from '../utils/config.mjs';
import { PACKAGE_ROOT } from '../utils/paths.mjs';

export async function startClientCommand() {
  const config = await ensureConfig();
  const clientUrl = `http://localhost:${config.clientPort}`;

  console.log('Starting ReadXiv web client and server...');
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'dev'], {
    cwd: PACKAGE_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  setTimeout(() => {
    open(clientUrl).catch(() => {});
  }, 1800);

  child.on('exit', (code) => process.exit(code ?? 0));
}
