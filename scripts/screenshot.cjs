'use strict';

/**
 * 用 Edge headless + CDP 截图（无需第三方依赖）
 * 用法：node scripts/screenshot.cjs <url> <输出文件> [等待毫秒] [页面内执行的JS]
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [url, out, waitMs = '8000', script = ''] = process.argv.slice(2);
if (!url || !out) {
  console.error('用法：node scripts/screenshot.cjs <url> <out.png> [waitMs] [js]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9333;
const profile = path.join(os.tmpdir(), 'edge-shot-' + Date.now());
const W = Number(process.env.SHOT_W || 1520);
const H = Number(process.env.SHOT_H || 1000);

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--disable-extensions', '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  `--window-size=${W},${H}`, 'about:blank'
], { stdio: 'ignore' });

async function json(pathname, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, { method });
  return res.json();
}

async function main() {
  let version = null;
  for (let i = 0; i < 40; i++) {
    try { version = await json('/json/version'); break; } catch { await sleep(250); }
  }
  if (!version) throw new Error('无法连接 Edge 调试端口');

  const target = await json('/json/new?about:blank', 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });

  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(Number(waitMs));

  if (script) {
    await send('Runtime.evaluate', { expression: script, awaitPromise: true });
    await sleep(Number(waitMs));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('已保存：' + out + '（' + fs.statSync(out).size + ' bytes）');

  ws.close();
}

main()
  .catch((e) => { console.error('截图失败：' + e.message); process.exitCode = 1; })
  .finally(async () => {
    await sleep(300);
    try { proc.kill(); } catch {}
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
    process.exit();
  });
