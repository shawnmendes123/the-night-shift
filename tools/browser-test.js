// Browser smoke test + screenshots (dev only). Needs Playwright and Chrome:
//   NODE_PATH=<global node_modules> node tools/browser-test.js
import { createRequire } from 'module';
import { startServer } from '../server/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2];

const srv = await startServer(0, { debug: true });
const HI = process.env.HI === '1';
const url = `http://localhost:${srv.port}/?nolock&q=${HI ? 'high' : 'low'}`;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function client(name, w = HI ? 1280 : 480, h = HI ? 720 : 270) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}\n${e.stack}`));
  await page.goto(url);
  await page.waitForFunction(() => window.NS && window.NS.ready, null, { timeout: 60000 });
  await page.fill('#name', name);
  return page;
}
const ev = (page, fn, arg) => page.evaluate(fn, arg);
const dbg = (page, cmd, data = {}) => ev(page, ([cmd, data]) => window.NS.send({ t: 'debug', cmd, ...data }), [cmd, data]);
const place = async (page, x, z, ry, rx = 0) => { await ev(page, ([x, z, ry, rx]) => { const m = window.NS.S.me; m.x = x; m.z = z; m.ry = ry; m.rx = rx; }, [x, z, ry, rx]); };
const shot = async (page, name, wait = 2500) => { if (!HI) return; await sleep(wait); await page.screenshot({ path: `shots/${name}.png` }); console.log('  shot', name); };
let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n} ${c ? '' : x}`); };

try {
  const a = await client('Asha');
  await shot(a, '01-menu', 3000);
  await a.click('#btnHost');
  await a.waitForSelector('#lobby:not(.hidden)');
  const code = await a.textContent('#lobbyCode');
  const b = await client('Ben');
  await b.fill('#code', code); await b.click('#btnJoin');
  await b.waitForSelector('#lobby:not(.hidden)');
  await sleep(300);
  ok((await a.locator('#roster li').count()) === 2, 'lobby shows both players in each browser');
  await a.click('#diffs button[data-d="easy"]'); await sleep(300);
  ok((await b.locator('#diffs button.on').textContent()) === 'Easy', 'difficulty picked by host shows for the joiner');
  ok(await b.locator('#btnStart').isDisabled(), 'only the host can start');
  await shot(a, '02-lobby', 500);
  await a.click('#btnStart');
  await a.waitForSelector('#hud:not(.hidden)'); await b.waitForSelector('#hud:not(.hidden)');
  await a.waitForFunction(() => window.NS.S.snap); await b.waitForFunction(() => window.NS.S.snap);
  await dbg(a, 'freeze', { on: true });
  ok(true, 'round started in both browsers');
  await a.waitForFunction(() => window.GhostVoice && window.GhostVoice.ready(), null, { timeout: 30000 });
  const voice = await ev(a, async () => { window.NS.herVoice('test... where are you?', 0.01); await new Promise((r) => setTimeout(r, 1500)); return { live: window.NS.voiceLive() }; });
  ok(voice.live, 'her voice engine loads after the round starts and speaks without errors');

  // --- movement with real key presses, seen from the other browser
  await place(a, 4, 15, Math.PI); await place(b, 4, 19, Math.PI); await sleep(600);
  const before = await ev(b, () => window.NS.S.snap.p.map((p) => [p[0], p[1], p[2]]));
  await a.keyboard.down('KeyW'); await sleep(1500); await a.keyboard.up('KeyW'); await sleep(400);
  const after = await ev(b, () => window.NS.S.snap.p.map((p) => [p[0], p[1], p[2]]));
  const moved = Math.hypot(after[0][1] - before[0][1], after[0][2] - before[0][2]);
  ok(moved > 1.5 && moved < 6, 'W key walks; the other browser sees the movement', `moved ${moved.toFixed(2)} m`);
  const av = await ev(b, () => { const a = [...window.NS.S.snap.p][0]; return a[2]; });
  ok(av < 14.5, 'walking north through the archway is not blocked', `z=${av}`);
  await a.keyboard.down('KeyW'); await sleep(2500); await a.keyboard.up('KeyW'); await sleep(300);
  const wall = await ev(a, () => window.NS.S.me.z);
  ok(wall > 10.3, 'the corridor wall stops the player', `z=${wall}`);

  // --- connection drop: the page reconnects by itself and stays in the round
  const idBefore = await ev(b, () => window.NS.S.id);
  await ev(b, () => window.NS.S.ws.close());
  await sleep(300);
  ok(await ev(b, () => document.getElementById('reconnect').classList.contains('hidden') && window.NS.S.phase === 'game'), 'a quick drop reconnects without covering the screen');
  await b.waitForFunction(() => window.NS.S.ws && window.NS.S.ws.readyState === 1 && !window.NS.S.recon, null, { timeout: 15000 });
  ok(await ev(b, () => window.NS.S.phase === 'game' && document.getElementById('reconnect').classList.contains('hidden')), 'it reconnects on its own and stays in the game');
  ok((await ev(b, () => window.NS.S.id)) === idBefore, 'same player after reconnecting');
  await sleep(600);
  ok(await ev(a, (id) => window.NS.S.snap.p.find((p) => p[0] === id)[13] === 0, idBefore), 'the teammate sees them back online');
  // --- scenery screenshots
  await place(a, 3, 11.5, -Math.PI / 2); await place(b, 9, 11.2, -Math.PI / 2 + 0.4);
  await shot(a, '03-corridor-dark');
  await ev(a, () => { const w = window.NS.S; }, null);
  // interact through the real E key: open ward door
  await place(a, 3, 10.9, Math.PI); await sleep(400);
  const tgt = await ev(a, () => { const t = window.NS.target(); return t && t.label; });
  ok(tgt === 'Open door', 'looking at a door offers "Open door"', String(tgt));
  await a.keyboard.press('KeyE'); await sleep(700);
  ok(await ev(b, () => window.NS.S.world.doors.ward_w[0] === 1), 'E opens the door for both players');
  await place(a, 3, 8.5, Math.PI + 0.5); await shot(a, '04-ward');
  // hide with E
  const h = await ev(a, () => { const M = window.NS; return null; });
  await place(a, 1.3, 5.5, Math.PI / 2 + Math.PI); await sleep(400);
  const t2 = await ev(a, () => { const t = window.NS.target(); return t && t.label; });
  ok(/Hide in the wardrobe/.test(t2 || ''), 'next to the wardrobe the prompt offers hiding', String(t2));
  await a.keyboard.press('KeyE'); await sleep(700);
  ok(await ev(a, () => window.NS.S.st === 'h'), 'E hides the player');
  ok(await ev(b, () => window.NS.S.snap.p[0][7] === 'h'), 'teammate browser sees them as hidden');
  await dbg(a, 'ghost', { x: 4.5, z: 5.5, ry: -Math.PI / 2, state: 'block', data: { blockFor: 999 } });
  await dbg(a, 'freeze', { on: true });
  await shot(a, '05-hiding-ghost-outside', 3000);
  await a.keyboard.down('Space'); await sleep(2200);
  const br = await ev(a, () => [window.NS.S.breath, window.NS.S.cfg.breath]);
  ok(br[0] < br[1] - 0.5, 'holding Space drains the breath meter', JSON.stringify(br));
  await a.keyboard.up('Space');
  await a.keyboard.press('KeyE'); await sleep(600);
  ok(await ev(a, () => window.NS.S.st === 'a'), 'E leaves the hiding spot');

  // --- items, notes and throwing through the real controls
  await place(a, 16.5, 12.6, 0); await sleep(500);
  await a.keyboard.press('KeyE'); await sleep(700);
  ok(/Patient chart/.test(await a.textContent('#held')), 'E picks up the chart; HUD shows what you carry', await a.textContent('#held'));
  await place(a, 12.5, 12.6, 0); await sleep(500);
  await a.keyboard.press('KeyE'); await sleep(700);
  ok(await a.locator('#note:not(.hidden)').count() === 1 && /Room 3/.test(await a.textContent('#noteBody')), 'reading the night log shows the note');
  ok(/evidence 1\/5/.test(await b.textContent('#clueCount')), 'the teammate HUD counts the shared evidence', await b.textContent('#clueCount'));
  await a.keyboard.press('KeyE'); await sleep(300);
  ok(await a.locator('#note.hidden').count() === 1, 'E puts the note down');
  await place(a, 15.2, 12.6, 0); await sleep(500);
  await a.keyboard.press('KeyE'); await sleep(700);
  ok(/Glass bottle/.test(await a.textContent('#held')), 'picking up a bottle swaps it for the chart');
  await place(a, 6, 11.5, Math.PI / 2, 0.3); await sleep(400);
  await a.mouse.click(200, 130); await sleep(2500);
  ok((await a.textContent('#held')) === '' && await ev(b, () => window.NS.S.world.items.filter((i) => i.k === 'bottle').length === 11), 'clicking throws the bottle; it is gone for both players');
  // --- ghost close-ups
  await dbg(a, 'ghost', { x: 20, z: 11.5, ry: -Math.PI / 2, state: 'block', data: { blockFor: 999 } });
  await place(a, 14.5, 11.5, -Math.PI / 2 + Math.PI);
  await place(a, 14.5, 11.5, Math.PI / 2);
  await shot(a, '06-ghost-stare', 3000);
  await dbg(a, 'ghost', { x: 17.2, z: 11.5, ry: -Math.PI / 2, state: 'notice' }); await dbg(a, 'freeze', { on: true });
  await shot(a, '07-ghost-scream', 1500);
  await dbg(a, 'ghost', { x: 18.5, z: 11.6, ry: -Math.PI / 2, state: 'patrol' });
  await shot(a, '08-ghost-walk-pose', 1200);
  // power on look
  await ev(a, () => window.NS.send({ t: 'debug', cmd: 'power' }));
  // third-person view of teammate
  await dbg(a, 'ghost', { x: 37, z: 5, ry: 0, state: 'idle' });
  await place(b, 6, 11.5, Math.PI / 2); await place(a, 9.5, 11.6, -Math.PI / 2);
  await shot(a, '09-teammate', 1500);

  // --- capture seen by victim and bystander, then rescue with the real E key (hold)
  await dbg(a, 'freeze', { on: false }); await dbg(a, 'deaf', { on: true });
  await place(a, 12, 11.5, Math.PI / 2); await place(b, 9.5, 12.2, Math.PI / 2 - 0.2);
  await dbg(a, 'ghost', { x: 16, z: 11.5, ry: -Math.PI / 2, idleFor: 999 });
  await a.waitForFunction(() => window.NS.S.st === 'c', null, { timeout: 15000 });
  await shot(a, '10-captured-victim-view', 500);
  await shot(b, '11-capture-bystander-view', 100);
  await b.waitForFunction(() => window.NS.S.g.s === 'drag', null, { timeout: 5000 });
  const vp = await ev(b, () => window.NS.S.snap.p[0]);
  await place(b, vp[1] + 0.6, vp[2], -Math.PI / 2); await sleep(300);
  const t3 = await ev(b, () => { const t = window.NS.target(); return t && t.label; });
  ok(/Pull Asha free/.test(t3 || ''), 'bystander is offered "Pull Asha free"', String(t3));
  await b.keyboard.down('KeyW'); await b.keyboard.down('KeyE'); await sleep(1600); await b.keyboard.up('KeyE'); await b.keyboard.up('KeyW'); await sleep(500);
  ok(await ev(a, () => window.NS.S.st === 'a'), 'walking after them and holding E rescues the caught player');

  // --- second capture -> elimination -> spectate
  await place(b, 3, 19, 0); await sleep(300);
  const ap = await ev(a, () => [window.NS.S.me.x, window.NS.S.me.z]);
  await dbg(a, 'ghost', { x: ap[0] + 3, z: ap[1], ry: -Math.PI / 2, idleFor: 999 });
  await a.waitForFunction(() => window.NS.S.st === 'd', null, { timeout: 25000 });
  await sleep(2500);
  ok(await ev(a, () => window.NS.S.spec !== null), 'eliminated player spectates the survivor');
  await shot(a, '12-spectating', 500);
  // --- survivor escapes via debug-completed objectives? Finish by time-out loss instead, check end screen.
  await dbg(b, 'time', { v: 0.5 });
  await a.waitForSelector('#end:not(.hidden)', { timeout: 6000 });
  ok(/06:00/.test(await a.textContent('#endTitle')), 'end screen shows the result');
  await shot(a, '13-end', 500);
  await a.click('#btnAgain');
  await b.waitForSelector('#lobby:not(.hidden)', { timeout: 4000 });
  ok(true, 'host returns everyone to the lobby');
} catch (e) { fail++; console.log('  FAIL exception', e.message); }
console.log(errors.length ? '\nBROWSER ERRORS:\n' + [...new Set(errors)].join('\n') : '\nno browser console errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close(); srv.close(); process.exit(fail || errors.length ? 1 : 0);
