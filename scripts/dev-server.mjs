/**
 * Tauri beforeDevCommand: start Vite on 5240 unless something (an editor
 * session, another shell) is already serving it - then just reuse that.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';

const PORT = 5240;

const probe = connect({ port: PORT, host: '127.0.0.1' });
probe.once('connect', () => {
  probe.end();
  console.log(`[dev-server] port ${PORT} already serving - reusing it`);
  // Keep the process alive so `tauri dev` treats the dev server as running.
  setInterval(() => {}, 1 << 30);
});
probe.once('error', () => {
  console.log(`[dev-server] starting vite on ${PORT}`);
  const child = spawn('npx', ['vite'], { stdio: 'inherit' });
  process.on('exit', () => child.kill());
});
