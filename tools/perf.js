// Dev only: frame-time and smoothness measurements in headless Chrome.
//   NODE_PATH=<global node_modules> node tools/perf.js [label]
import { createRequire } from 'module';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const label = process.argv[2] || 'run';
const srv = await startServer(0, { debug: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await (await browser.newContext({ viewport: { width: +(process.env.W || 320), height: +(process.env.H || 180) } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`http://localhost:${srv.port}/?nolock&q=${process.env.Q || 'high'}`);
await page.waitForFunction(() => window.NS && window.NS.ready, null, { timeout: 90000 });
await page.fill('#name', 'Perf'); await page.click('#btnHost'); await page.waitForSelector('#lobby:not(.hidden)');
const code = await page.textContent('#lobbyCode');
const bot = new WebSocket(`ws://localhost:${srv.port}`);
bot.on('open', () => bot.send(JSON.stringify({ t: 'join', name: 'Ben', code })));
await sleep(500);
await page.click('#btnStart'); await page.waitForFunction(() => window.NS.S.snap, null, { timeout: 60000 });
const D = (cmd, data = {}) => page.evaluate(([cmd, data]) => window.NS.send({ t: 'debug', cmd, ...data }), [cmd, data]);
await D('freeze', { on: true });
await page.evaluate(() => Object.assign(window.NS.S.me, { x: 6, z: 11.5, ry: Math.PI / 2, rx: 0 }));
await D('ghost', { x: 13, z: 11.5, ry: -Math.PI / 2, state: 'block', data: { blockFor: 999 } }); await D('freeze', { on: true });
// teammate walks back and forth in view at 20 Hz
let tick = 0; const walker = setInterval(() => { tick++; const x = 9 + ((tick % 120) < 60 ? (tick % 120) : 120 - (tick % 120)) * 0.04; bot.send(JSON.stringify({ t: 'pos', x, z: 12.2, ry: Math.PI / 2, rx: 0, m: 'walk', f: 1 })); }, 1000 / (+process.env.SEND || 15));
await sleep(3000);
const frame = await page.evaluate(async () => {
  const r = window.NS.renderer; r.info.autoReset = false; let calls = 0, tris = 0, nf = 0; const t = []; let last = performance.now();
  await new Promise((res) => { const t0 = last; const f = (n) => { t.push(n - last); last = n; calls += r.info.render.calls; tris += r.info.render.triangles; nf++; r.info.reset(); if (n - t0 < 5000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  t.shift(); t.sort((a, b) => a - b); const avg = t.reduce((a, b) => a + b, 0) / t.length;
  return { msAvg: +avg.toFixed(1), p95: +t[Math.floor(t.length * 0.95)].toFixed(1), calls: Math.round(calls / nf), tris: Math.round(tris / nf), px: r.getPixelRatio() };
});
// smoothness: teammate avatar's rendered x each frame (unfrozen ghost walking too)
await D('freeze', { on: false }); await D('deaf', { on: true });
await D('ghost', { x: 22, z: 11.5, ry: -Math.PI / 2, state: 'patrol' });
await page.evaluate(() => window.NS.send({ t: 'debug', cmd: 'ghost', x: 22, z: 11.5, ry: -Math.PI / 2, state: 'idle', idleFor: 999 }));
const smooth = await page.evaluate(async () => {
  const S = window.NS.S; const out = []; let last = performance.now();
  await new Promise((res) => { const t0 = last; const f = (n) => { const a = [...(window.NS.avatars || new Map()).values()][0]; out.push([n - last, a ? a.cur.x : NaN]); last = n; if (n - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  // velocity per frame; jerkiness = mean |dv| relative to mean |v|
  const v = []; for (let i = 1; i < out.length; i++) v.push((out[i][1] - out[i - 1][1]) / (out[i][0] / 1000));
  const dv = []; for (let i = 1; i < v.length; i++) dv.push(Math.abs(v[i] - v[i - 1]));
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const still = v.filter((x) => Math.abs(x) < 0.02).length;
  // second difference of position (acceleration noise), normalised by frame time: low = smooth glide
  const acc = []; for (let i = 2; i < out.length; i++) { const d1 = out[i][1] - out[i - 1][1], d0 = out[i - 1][1] - out[i - 2][1]; acc.push(Math.abs(d1 - d0)); }
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }; return { frames: out.length, fps: +(1000 / mean(out.map((o) => o[0]))).toFixed(1), meanSpeed: +mean(v.map(Math.abs)).toFixed(3), speedWobble: +(sd(v.map(Math.abs)) / mean(v.map(Math.abs))).toFixed(3), stalledFrames: still, stepNoiseMm: +(mean(acc) * 1000).toFixed(2) };
});
// ghost: walking a straight patrol leg
await D('ghost', { x: 3, z: 11.5, ry: Math.PI / 2, state: 'idle', idleFor: 0.01 });
await page.evaluate(() => Object.assign(window.NS.S.me, { x: 2, z: 12.6, ry: Math.PI / 2, rx: 0 }));
await sleep(1500);
const ghostSmooth = await page.evaluate(async () => {
  const S = window.NS.S; const out = []; let last = performance.now();
  await new Promise((res) => { const t0 = last; const f = (n) => { out.push([n - last, S.g.x, S.g.z]); last = n; if (n - t0 < 4000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  const v = []; for (let i = 1; i < out.length; i++) v.push(Math.hypot(out[i][1] - out[i - 1][1], out[i][2] - out[i - 1][2]) / (out[i][0] / 1000));
  const moving = v.filter((x) => x > 0.2 && x < 8); const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length; const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
  return { frames: out.length, movingFrames: moving.length, stalled: v.filter((x) => x < 0.05).length, meanSpeed: +mean(moving).toFixed(2), speedWobble: +(sd(moving) / mean(moving)).toFixed(3) };
});
console.log(label, JSON.stringify({ frame, smooth, ghostSmooth }));
clearInterval(walker); await browser.close(); srv.close(); process.exit(0);
