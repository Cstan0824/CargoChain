// scripts/dev-launcher.js
// Cross-platform dev launcher — npm start runs this.
// For Windows / macOS / Linux desktop, prefer start.cmd or start.sh.
// This script is the fallback for systems where neither shell helper works.

const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const procs = [];

function spawnBg(name, cmd, args, cwd) {
  console.log(`[dev-launcher] starting ${name}: ${cmd} ${args.join(' ')}`);
  const p = spawn(cmd, args, { cwd: cwd || ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  procs.push({ name, p });
  return p;
}

// 1. Ganache (assumes installed globally)
try {
  spawnBg('ganache', 'ganache', ['--deterministic']);
} catch (e) {
  console.warn('[dev-launcher] ganache CLI not found; please start Ganache GUI manually.');
}

// 2. Truffle compile + migrate (foreground — we need it before the frontend can connect)
const truffle = spawnBg('truffle', 'npx', ['truffle', 'compile'], ROOT);
truffle.on('exit', (code) => {
  if (code !== 0) {
    console.error('[dev-launcher] truffle compile failed');
    process.exit(1);
  }
  spawnBg('truffle-migrate', 'npx', ['truffle', 'migrate', '--reset', '--network', 'development']);
  // 3. Upload server
  spawnBg('upload-server', 'node', ['server/upload-server.js']);
  // 4. Vite dev server (port 5173)
  spawnBg('vite', 'npm', ['run', 'dev'], ROOT);
});

process.on('SIGINT', () => {
  console.log('\n[dev-launcher] shutting down...');
  procs.forEach(({ p }) => p.kill());
  process.exit(0);
});
