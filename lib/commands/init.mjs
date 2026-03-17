import path from 'path';
import { spawn } from 'child_process';
import { ensureConfig, ensurePapyrusDirs } from '../utils/config.mjs';
import { PACKAGE_ROOT, PAPYRUS_DIR } from '../utils/paths.mjs';

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed with code ${code}`));
    });
    child.on('error', reject);
  });
}

export async function initCommand() {
  await ensurePapyrusDirs();
  const config = await ensureConfig();

  const { initDB } = await import('../../server/db.js');
  await initDB();

  console.log('Installing client dependencies...');
  await runCommand('npm', ['install'], path.join(PACKAGE_ROOT, 'client'));

  console.log('Installing server dependencies...');
  await runCommand('npm', ['install'], path.join(PACKAGE_ROOT, 'server'));

  console.log('Initialization complete.');
  console.log(`Data directory: ${config ? PAPYRUS_DIR : '~/.papyrus'}`);
  console.log('Next step: readxiv start:client');
}
