// Dev only: high-quality screenshots of key scenes. NODE_PATH=<global node_modules> node tools/shots.js [names...]
import { createRequire } from 'module';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const srv = await startServer(0, { debug: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text()); });
await page.goto(`http://localhost:${srv.port}/?nolock&nodyn&q=high`);
await page.waitForFunction(() => window.NS && window.NS.ready, null, { timeout: 90000 });
await page.fill('#name', 'Asha'); await page.click('#btnHost'); await page.waitForSelector('#lobby:not(.hidden)');
const code = await page.textContent('#lobbyCode');
const bot = new WebSocket(`ws://localhost:${srv.port}`); let botId;
bot.on('open', () => bot.send(JSON.stringify({ t: 'join', name: 'Ben', code })));
bot.on('message', (r) => { const m = JSON.parse(r); if (m.t === 'welcome') botId = m.id; });
await sleep(500);
await page.click('#diffs button[data-d="easy"]'); await sleep(300); await page.click('#btnStart'); await page.waitForFunction(() => window.NS.S.snap, null, { timeout: 60000 });
const D = (cmd, data = {}) => page.evaluate(([cmd, data]) => window.NS.send({ t: 'debug', cmd, ...data }), [cmd, data]);
const me = (x, z, ry, rx = 0, extra = {}) => page.evaluate(([x, z, ry, rx, extra]) => Object.assign(window.NS.S.me, { x, z, ry, rx }, extra), [x, z, ry, rx, extra]);
const botPos = (x, z, ry, m = 'still') => bot.send(JSON.stringify({ t: 'pos', x, z, ry, rx: 0, m, f: 1 }));
const shot = async (name, wait = 3500) => { await sleep(wait); await page.screenshot({ path: `shots/${name}.png` }); console.log('shot', name); };
const far = () => D('ghost', { x: 37, z: 31, ry: 0, state: 'idle' });
await D('freeze', { on: true }); await far(); botPos(4, 20, 0);
const lab = async (anim, state, data = {}) => {
  await D('ghost', { x: 24.5, z: 4.9, ry: Math.PI, state, data }); await D('freeze', { on: true });
  await me(24.5, 2.3, 0, 0.0); await shot('lab-' + anim + '-front', 1800);
  await me(22.8, 4.9, -Math.PI / 2, 0.0); await shot('lab-' + anim + '-side', 1500);
};
const scenes = {
  lab: async () => {
    await page.evaluate(() => { const { scene, THREE } = window.NS; scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2.2)); scene.fog.density = 0.01; });
    await D('ghost', { x: 30, z: 5, ry: 0, state: 'idle' });
    await page.evaluate(() => { const w = window.NS.S.world; });
    for (const [a, st, d] of [['stare', 'block', { blockFor: 999 }], ['walk', 'patrol'], ['run', 'chase'], ['listen', 'listen'], ['scream', 'notice'], ['idle', 'idle']]) if (!process.env.ANIMS || process.env.ANIMS.includes(a)) await lab(a, st, d);
  },
  corridor: async () => { await me(2.5, 11.4, -Math.PI / 2 + Math.PI * 0); await me(2.5, 11.4, Math.PI / 2); await shot('corridor-dark'); },
  ghostfar: async () => { await D('ghost', { x: 17, z: 11.5, ry: -Math.PI / 2, state: 'block', data: { blockFor: 999 } }); await D('freeze', { on: true }); await me(8, 11.5, Math.PI / 2); await shot('ghost-distance'); },
  ghostnear: async () => { await D('ghost', { x: 12.2, z: 11.5, ry: -Math.PI / 2, state: 'block', data: { blockFor: 999 } }); await D('freeze', { on: true }); await me(9.6, 11.5, Math.PI / 2, 0.12); await shot('ghost-near'); },
  scream: async () => { await D('ghost', { x: 12, z: 11.5, ry: -Math.PI / 2, state: 'notice' }); await D('freeze', { on: true }); await me(9.2, 11.5, Math.PI / 2, 0.1); await shot('ghost-scream', 2500); },
  run: async () => { await D('ghost', { x: 12.5, z: 11.2, ry: -Math.PI / 2 - 0.5, state: 'chase' }); await D('freeze', { on: true }); await me(9.5, 12.2, Math.PI / 2 - 0.3, 0.02); await shot('ghost-run-side', 2500); },
  listen: async () => { await D('ghost', { x: 1.3, z: 5.5, ry: -Math.PI / 2, state: 'listen' }); await D('freeze', { on: true }); await me(4.2, 7.2, -Math.PI / 2 - 0.55, -0.05); await shot('ghost-listening-at-wardrobe', 2500); },
  ward: async () => { await far(); await me(12.5, 8.6, Math.PI + 0.9, -0.1); await shot('ward'); },
  power: async () => { await D('power'); await me(2.5, 11.4, Math.PI / 2); botPos(8, 11.9, -Math.PI / 2); await shot('corridor-powered-teammate'); },
  station: async () => { await me(11, 11.2, 0.5, -0.15); await shot('nurses-station'); },
  room3: async () => { await me(15.5, 8.5, Math.PI - 0.4, -0.05); await shot('room3'); },
  morgue: async () => { await me(33, 28.5, 0, -0.05); await shot('morgue'); },
  boiler: async () => { await me(24.5, 25, -Math.PI / 2, 0); await shot('boiler'); },
  stairs: async () => { await me(38, 14, 0, -0.35); await shot('stairs'); },
  hide: async () => { await me(1.3, 5.5, -Math.PI / 2); await sleep(600); await page.keyboard.press('KeyE'); await D('ghost', { x: 3.6, z: 5.3, ry: -Math.PI / 2, state: 'block', data: { blockFor: 999 } }); await D('freeze', { on: true }); await shot('hiding-in-wardrobe'); await page.keyboard.press('KeyE'); await sleep(500); },
  capture: async () => { await D('holdgrab', { on: true }); await D('freeze', { on: false }); await D('deaf', { on: true }); await me(12, 11.5, Math.PI / 2); await D('ghost', { x: 14.5, z: 11.5, ry: -Math.PI / 2, idleFor: 999 }); await page.waitForFunction(() => window.NS.S.st === 'c', null, { timeout: 60000 }); await sleep(1200); await page.screenshot({ path: 'shots/captured.png' }); await sleep(1500); await page.screenshot({ path: 'shots/captured2.png' }); console.log(await page.evaluate(() => [window.NS.S.g.a, window.NS.S.capT])); await D('freeze', { on: false }); },
};
for (const [k, fn] of Object.entries(scenes)) if (!want.length || want.includes(k)) { try { await fn(); } catch (e) { console.log('scene failed', k, e.message); } }
await browser.close(); srv.close(); process.exit(0);
