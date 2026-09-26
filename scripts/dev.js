// Development runner: starts Vite, then launches Electron pointed at it.
const { spawn } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const bin = (n) => path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${n}.cmd` : n);
const url = 'http://localhost:5173';

const vite = spawn(bin('vite'), [], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });

async function waitForVite() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Vite did not start');
}

waitForVite().then(() => {
  const electron = spawn(bin('electron'), ['.'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, RPOS_DEV_SERVER: url },
  });
  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code || 0);
  });
});
