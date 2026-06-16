import open from 'open';
import { ensureConfig } from '../utils/config.mjs';
import { startServerInBackground } from '../utils/server-manager.mjs';

export async function serveCommand() {
  const config = await ensureConfig();
  const appUrl = `http://localhost:${config.serverPort}`;
  const result = await startServerInBackground(config.serverPort);

  if (result.started) {
    console.log(`ReadXiv is running at ${appUrl}`);
  } else {
    console.log(`ReadXiv is already running at ${appUrl}`);
  }

  await open(appUrl).catch(() => {
    console.log(`Open ${appUrl} in your browser.`);
  });
}
