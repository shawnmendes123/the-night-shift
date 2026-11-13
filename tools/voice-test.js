// Voice chat test (dev only): two browsers with fake microphones talk peer to peer through the game.
//   NODE_PATH=<global node_modules> node tools/voice-test.js
import { createRequire } from 'module';
import { startServer } from '../server/index.js';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = await startServer(0, { debug: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${new URL('./fixtures/speech.wav', import.meta.url).pathname}`, '--autoplay-policy=no-user-gesture-required'] });
const errors = []; let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n} ${c ? '' : x}`); };
async function client(name) {
  const ctx = await browser.newContext({ viewport: { width: 480, height: 270 } });
  await ctx.grantPermissions(['microphone']);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  await page.goto(`http://localhost:${srv.port}/?nolock&q=low`);
  await page.waitForFunction(() => window.NS && window.NS.ready, null, { timeout: 60000 });
  await page.fill('#name', name); return page;
}
const ev = (p, fn, a) => p.evaluate(fn, a);
// loudest level heard from the other player over a few seconds (the fake mic beeps about once a second)
const heard = (p, other, ms = 3000) => ev(p, async ([other, ms]) => { let mx = 0; const t0 = performance.now(), v = window.NS.voice; while (performance.now() - t0 < ms) { const q = v.peers.get(other); if (q && q.an) mx = Math.max(mx, v.rms(q.an)); await new Promise((r) => setTimeout(r, 30)); } return mx; }, [other, ms]);
const route = (p, other) => ev(p, (other) => { const q = window.NS.voice.peers.get(other); return q && q.flat ? { flat: +q.flat.gain.value.toFixed(2), pan: +q.panG.gain.value.toFixed(2), lp: Math.round(q.lp.frequency.value), g: +q.g.gain.value.toFixed(2), px: +q.pan.positionX.value.toFixed(1) } : null; }, other);
try {
  const a = await client('Asha');
  await a.click('#btnHost'); await a.waitForSelector('#lobby:not(.hidden)');
  const code = await a.textContent('#lobbyCode');
  const b = await client('Ben');
  await b.fill('#code', code); await b.click('#btnJoin'); await b.waitForSelector('#lobby:not(.hidden)');
  await a.click('#voiceModes button[data-v="open"]'); await b.click('#voiceModes button[data-v="open"]');
  await a.waitForFunction(() => window.NS.voice.mode === 'open'); await b.waitForFunction(() => window.NS.voice.mode === 'open');
  const ida = await ev(a, () => window.NS.S.id), idb = await ev(b, () => window.NS.S.id);
  await a.waitForFunction((o) => window.NS.voice.connected(o), idb, { timeout: 20000 }).catch(() => {});
  await b.waitForFunction((o) => window.NS.voice.connected(o), ida, { timeout: 20000 }).catch(() => {});
  ok(await ev(a, (o) => window.NS.voice.connected(o), idb) && await ev(b, (o) => window.NS.voice.connected(o), ida), 'the two browsers connect peer to peer');
  await sleep(1200);
  ok((await a.locator('#roster .tag.mic').count()) === 2, 'the sign-in sheet shows both nurses have a mic on');
  const la = await heard(a, idb), lb = await heard(b, ida);
  if (process.env.VDEBUG && 0) for (const [p, o, n] of [[a, idb, 'A'], [b, ida, 'B']]) console.log(n, JSON.stringify(await ev(p, async (o) => { const q = window.NS.voice.peers.get(o); const st = await q.pc.getStats(); let rx = 0, tx = 0; st.forEach((r) => { if (r.type === 'inbound-rtp' && r.kind === 'audio') rx = r.bytesReceived; if (r.type === 'outbound-rtp' && r.kind === 'audio') tx = r.bytesSent; }); return { init: q.init, sid: q.sid, txs: q.pc.getTransceivers().length, sender: q.tx && q.tx.sender.track ? q.tx.sender.track.readyState + '/' + q.tx.sender.track.enabled : null, txIsCur: q.pc.getTransceivers().includes(q.tx), dir: q.tx && q.tx.currentDirection, rx, tx, trackMuted: q.stream && q.stream.getAudioTracks()[0].muted, ctx: window.NS.voice.ctx && window.NS.voice.ctx.state }; }, o)));
  ok(la > 0.01 && lb > 0.01, 'each hears the other\'s microphone', `levels ${la.toFixed(3)} ${lb.toFixed(3)}`);
  const r0 = await route(a, idb);
  ok(r0 && r0.flat === 1 && r0.pan === 0, 'on the sign-in sheet voices are heard at full volume, not placed in space', JSON.stringify(r0));

  await a.click('#btnStart'); await a.waitForSelector('#hud:not(.hidden)'); await b.waitForSelector('#hud:not(.hidden)');
  await a.waitForFunction(() => window.NS.S.snap); await b.waitForFunction(() => window.NS.S.snap);
  await ev(a, () => window.NS.send({ t: 'debug', cmd: 'freeze', on: true }));
  const place = (p, x, z, ry) => ev(p, ([x, z, ry]) => { window.NS.send({ t: 'debug', cmd: 'tp', x, z }); const m = window.NS.S.me; m.x = x; m.z = z; m.ry = ry; }, [x, z, ry]);
  // same corridor, in plain view
  await place(a, 10, 11.5, Math.PI / 2); await place(b, 14, 11.5, -Math.PI / 2); await sleep(1500);
  const r1 = await route(a, idb);
  ok(r1 && r1.pan === 1 && r1.flat === 0 && r1.lp > 15000 && Math.abs(r1.px - 14) < 1, 'in the hospital a voice comes from where that nurse stands', JSON.stringify(r1));
  // other side of a wall
  await place(b, 17.5, 5, 0); await sleep(1500);
  const r2 = await route(a, idb);
  ok(r2 && r2.pan === 1 && r2.lp < 1000 && r2.g < 1, 'through a wall the voice is muffled and quieter', JSON.stringify(r2));
  // she hears talking: Ben's open mic makes noise the ghost picks up
  const room = [...srv.rooms.values()][0], pb = room.players.get(idb);
  await sleep(2500);
  ok(pb.lastTalk !== undefined && room.elapsed - pb.lastTalk < 3, 'the ghost can hear a nurse who is talking', `lastTalk ${pb.lastTalk} elapsed ${room.elapsed}`);
  // push to talk: silent until V is held
  await b.click('#voiceModes button[data-v="ptt"]').catch(() => {});
  await ev(b, () => window.NS.voice.setMode('ptt')); await sleep(400);
  const muted = await ev(b, () => window.NS.voice.track.enabled);
  await b.keyboard.down('KeyV'); await sleep(300);
  const live = await ev(b, () => window.NS.voice.track.enabled);
  await b.keyboard.up('KeyV');
  ok(muted === false && live === true, 'push to talk only sends while V is held', `${muted} ${live}`);
  // taken nurses cannot be heard by the living
  await ev(b, () => window.NS.voice.setMode('open'));
  room.eliminate(pb); await sleep(1500);
  const r3 = await route(a, idb);
  ok(r3 && r3.flat === 0 && r3.pan === 0, 'a taken nurse can no longer be heard by the living', JSON.stringify(r3));
  const r4 = await route(b, ida);
  ok(r4 && (r4.pan === 1 || r4.flat === 1), 'the taken nurse can still hear the living', JSON.stringify(r4));
} catch (e) { fail++; console.log('  FAIL exception', e.message.slice(0, 500)); }
console.log(errors.length ? errors.join('\n') : '\nno browser console errors');
console.log(`${pass} passed, ${fail} failed`);
await browser.close(); srv.close(); process.exit(fail ? 1 : 0);
