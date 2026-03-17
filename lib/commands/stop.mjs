import { stopServer } from '../utils/server-manager.mjs';

export async function stopCommand() {
  const result = await stopServer();
  if (result.stopped) {
    console.log(`Stopped server process ${result.pid}`);
    return;
  }
  if (result.reason === 'no-pid-file') {
    console.log('No background server PID file found.');
    return;
  }
  console.log('Background server was not running.');
}
