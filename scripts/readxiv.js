#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');

const cliPath = path.resolve(__dirname, '..', 'bin', 'readxiv.mjs');
const child = spawn(process.execPath, [cliPath, ...process.argv.slice(2)], {
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
