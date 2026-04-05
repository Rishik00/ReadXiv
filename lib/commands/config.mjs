import { ensureConfig, getConfig, saveConfig } from '../utils/config.mjs';

const ALLOWED_KEYS = new Set([
  'serverPort',
  'clientPort',
  'autoStartServer',
  'defaultBrowser',
  'exportDir',
]);

function castValue(value) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
  return value;
}

export async function configCommand(action, key, value) {
  await ensureConfig();
  const config = await getConfig();

  if (action === 'get') {
    if (!key) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    console.log(config[key]);
    return;
  }

  if (action === 'set') {
    if (!key || value == null) {
      throw new Error('Usage: readxiv config set <key> <value>');
    }
    if (!ALLOWED_KEYS.has(key)) {
      throw new Error(`Unsupported config key: ${key}`);
    }
    config[key] = castValue(value);
    await saveConfig(config);
    console.log(`Updated config: ${key}=${config[key]}`);
    return;
  }

  throw new Error('Usage: readxiv config <get|set> [key] [value]');
}
