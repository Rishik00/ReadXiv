#!/usr/bin/env node
import { initCommand } from '../lib/commands/init.mjs';
import { startClientCommand } from '../lib/commands/start-client.mjs';
import { addCommand } from '../lib/commands/add.mjs';
import { removeCommand } from '../lib/commands/remove.mjs';
import { exportDbCommand } from '../lib/commands/export-db.mjs';
import { stopCommand } from '../lib/commands/stop.mjs';

function printHelp() {
  console.log(`
readxiv - research CLI

Usage:
  readxiv init
  readxiv start:client
  readxiv add:<arxiv_link_or_id>
  readxiv add <arxiv_link_or_id>
  readxiv remove:<arxiv_link_or_id>
  readxiv remove <arxiv_link_or_id>
  readxiv exportdb [output_path]
  readxiv stop
`);
}

function parseColonSyntax(token) {
  const firstColon = token.indexOf(':');
  if (firstColon === -1) return null;
  return {
    head: token.slice(0, firstColon),
    tail: token.slice(firstColon + 1),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    printHelp();
    return;
  }

  const first = args[0];
  const colon = parseColonSyntax(first);

  if (first === 'init') return initCommand();
  if (first === 'exportdb') return exportDbCommand(args[1]);
  if (first === 'stop') return stopCommand();
  if (first === 'add') return addCommand(args[1]);
  if (first === 'remove') return removeCommand(args[1]);

  if (colon?.head === 'start' && colon.tail === 'client') return startClientCommand();
  if (colon?.head === 'add') return addCommand(colon.tail);
  if (colon?.head === 'remove') return removeCommand(colon.tail);

  throw new Error(`Unknown command: ${first}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
