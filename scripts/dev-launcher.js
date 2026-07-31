// scripts/dev-launcher.js
// Cross-platform dev launcher — npm start runs this.
// For Windows / macOS / Linux desktop, prefer start.cmd or start.sh.
// This script is the fallback for systems where neither shell helper works.

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
require('dotenv').config();

const ROOT = path.join(__dirname, '..');
const procs = [];
const GANACHE_HOST = process.env.GANACHE_HOST || '127.0.0.1';
const GANACHE_PORT = Number(process.env.GANACHE_PORT || 7545);
const GANACHE_NETWORK_ID = Number(process.env.GANACHE_NETWORK_ID || 1337);
const CHAIN_ID = Number(process.env.VITE_CHAIN_ID || process.env.CHAIN_ID || 1337);
const GANACHE_DATABASE_PATH = process.env.GANACHE_DATABASE_PATH
  || path.join(ROOT, 'ganache-data');

function spawnBg(name, cmd, args, cwd) {
  console.log(`[dev-launcher] starting ${name}: ${cmd} ${args.join(' ')}`);
  const p = spawn(cmd, args, { cwd: cwd || ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  procs.push({ name, p });
  return p;
}

function waitForExit(proc, label) {
  return new Promise((resolve, reject) => {
    proc.once('error', reject);
    proc.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

function waitForRpc(attemptsRemaining = 60) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: GANACHE_HOST,
      port: GANACHE_PORT,
      path: '/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, (response) => {
      response.resume();
      if (response.statusCode >= 200 && response.statusCode < 500) {
        resolve();
      } else if (attemptsRemaining > 1) {
        setTimeout(() => resolve(waitForRpc(attemptsRemaining - 1)), 250);
      } else {
        reject(new Error(`Ganache RPC did not become ready on ${GANACHE_HOST}:${GANACHE_PORT}`));
      }
    });

    request.on('error', () => {
      if (attemptsRemaining > 1) {
        setTimeout(() => resolve(waitForRpc(attemptsRemaining - 1)), 250);
      } else {
        reject(new Error(`Ganache RPC did not become ready on ${GANACHE_HOST}:${GANACHE_PORT}`));
      }
    });
    request.end(JSON.stringify({ jsonrpc: '2.0', method: 'eth_chainId', params: [], id: 1 }));
  });
}

async function launch() {
  spawnBg('ganache', 'npx', [
    'ganache',
    '--wallet.deterministic',
    '--server.host',
    GANACHE_HOST,
    '--server.port',
    String(GANACHE_PORT),
    '--chain.chainId',
    String(CHAIN_ID),
    '--chain.networkId',
    String(GANACHE_NETWORK_ID),
    '--chain.asyncRequestProcessing',
    'false',
    '--database.dbPath',
    GANACHE_DATABASE_PATH,
  ], ROOT);

  await waitForRpc();
  await waitForExit(spawnBg('truffle-compile', 'npx', ['truffle', 'compile'], ROOT), 'Truffle compile');
  await waitForExit(
    spawnBg('truffle-migrate', 'npx', ['truffle', 'migrate', '--reset', '--network', 'development'], ROOT),
    'Truffle migration',
  );

  spawnBg('api', 'node', ['server/index.js'], ROOT);
  spawnBg('vite', 'npm', ['run', 'dev'], ROOT);
}

launch().catch((error) => {
  console.error(`[dev-launcher] ${error.message}`);
  procs.forEach(({ p }) => p.kill());
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n[dev-launcher] shutting down...');
  procs.forEach(({ p }) => p.kill());
  process.exit(0);
});
