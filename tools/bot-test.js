// Automated multiplayer tests. Real WebSocket clients ("bots") play against a real server instance.
// Run: npm test
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { Room } from '../server/room.js';
import * as M from '../shared/map.js';
import { DIFF } from '../shared/config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + ' ' + extra); } };

class Bot {
  constructor(port, name) { this.port = port; this.name = name; this.evs = []; this.x = 0; this.z = 0; this.ry = 0; this.mode = 'still'; this.flash = true; }
  connect(code = '') {
    return new Promise((res) => {
      this.ws = new WebSocket(`ws://localhost:${this.port}`);
      this.ws.on('open', () => this.send({ t: 'join', name: this.name, code }));
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        if (m.t === 'welcome') { this.id = m.id; this.code = m.code; this.key = m.key; this.resumed = !!m.resumed; res(this); }
        else if (m.t === 'err') { this.err = m.msg; res(this); }
        else if (m.t === 'lobby') this.lobby = m;
        else if (m.t === 'start') { this.world = m.world; this.x = m.you.x; this.z = m.you.z; this.started = true; this.ended = null; }
        else if (m.t === 'world') this.world = m.world;
        else if (m.t === 's') { if (process.env.TRACE && this.name === 'Bot1' && m.g.s !== this._ls) { this._ls = m.g.s; console.log('     >', m.g.s, m.g.x, m.g.z, JSON.stringify(m.p.map((p) => [p[1], p[2], p[5], p[7]]))); } this.snap = m; }
        else if (m.t === 'ev') { this.evs.push(m); if (m.k === 'tp') { this.x = m.x; this.z = m.z; } }
        else if (m.t === 'end') this.ended = m;
        else if (m.t === 'debug') this.dbg = m;
      });
    });
  }
  send(m) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  pos(x, z, mode = 'still', ry = this.ry) { this.x = x; this.z = z; this.mode = mode; this.ry = ry; this.send({ t: 'pos', x, z, ry, rx: 0, m: mode, f: this.flash }); }
  use(kind, id) { this.send({ t: 'use', kind, id }); }
  me() { return this.snap && this.snap.p.find((p) => p[0] === this.id); }
  item(k) { return this.world.items.find((i) => i.k === k); }
  had(k, since = 0) { return this.evs.slice(since).find((e) => e.k === k); }
  async until(fn, ms = 4000, label = '') { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(30); } return false; }
  async debug(cmd, data = {}) { this.send({ t: 'debug', cmd, ...data }); await sleep(90); }
  async state() { this.dbg = null; this.send({ t: 'debug', cmd: 'state' }); await this.until(() => this.dbg); return this.dbg; }
  close() { this.ws.close(); }
}

async function party(port, n, diff = 'medium') {
  const bots = [await new Bot(port, 'Bot1').connect()];
  for (let i = 1; i < n; i++) bots.push(await new Bot(port, 'Bot' + (i + 1)).connect(bots[0].code));
  bots[0].send({ t: 'diff', diff });
  await sleep(60);
  bots[0].send({ t: 'start', seed: 1234, kind: 'mother' });
  await bots[0].until(() => bots.every((b) => b.started && b.snap));
  return bots;
}
const closeAll = async (bots) => { bots.forEach((b) => b.close()); await sleep(120); };

async function main() {
  const srv = await startServer(0, { debug: true, grace: 400 }); // short reconnect window so tests run fast
  const port = srv.port;

  console.log('\n[1] Lobby and joining');
  {
    const host = await new Bot(port, 'Asha').connect();
    ok(host.id && /^[A-Z]{4}$/.test(host.code), 'host creates a room with a 4-letter code');
    const others = [];
    for (let i = 0; i < 4; i++) others.push(await new Bot(port, 'P' + i).connect(host.code));
    await sleep(100);
    ok(host.lobby.players.length === 5, '5 players in the lobby', JSON.stringify(host.lobby.players));
    const sixth = await new Bot(port, 'Late').connect(host.code);
    ok(sixth.err && /full/.test(sixth.err), 'a 6th player is refused');
    const bad = await new Bot(port, 'X').connect('ZZZZ');
    ok(bad.err, 'unknown room code is refused');
    others[0].send({ t: 'diff', diff: 'extreme' }); await sleep(80);
    ok(host.lobby.diff === 'medium', 'only the host can change difficulty');
    host.send({ t: 'diff', diff: 'hard' }); await sleep(80);
    ok(others[2].lobby.diff === 'hard', 'difficulty change reaches everyone');
    others[1].send({ t: 'name', name: 'Renamed' }); await sleep(80);
    ok(host.lobby.players.some((p) => p.name === 'Renamed'), 'display names sync');
    others[0].send({ t: 'start' }); await sleep(120);
    ok(!host.started, 'non-host cannot start');
    host.send({ t: 'start', seed: 7, kind: 'mother' });
    await host.until(() => [host, ...others].every((b) => b.started && b.snap));
    ok([host, ...others].every((b) => b.started), 'round starts for all 5');
    const late = await new Bot(port, 'Mid').connect(host.code);
    ok(late.err && /progress/.test(late.err), 'joining mid-round is refused with a message');
    console.log('\n[2] Movement sync');
    others[3].pos(5.5, 11.5, 'walk', 1.2);
    const seen = await host.until(() => { const p = host.snap.p.find((p) => p[0] === others[3].id); return p && Math.abs(p[1] - 5.5) < 0.01 && Math.abs(p[2] - 11.5) < 0.01 && p[5] === 'walk' && p; });
    ok(seen, 'other clients receive a player\'s position, facing and movement mode');
    ok(host.snap.g && typeof host.snap.g.x === 'number', 'ghost state is broadcast');
    console.log('\n[3] Disconnects');
    host.close(); await sleep(700);
    ok(others[0].lobby.host === others[0].id, 'host role passes on when the host leaves');
    ok(others[0].snap.p.length === 4, 'the round continues with the remaining players');
    await closeAll([...others, sixth, bad, late]); await sleep(600);
    ok(srv.rooms.size === 0, 'empty rooms are cleaned up');
  }

  console.log('\n[4] Full round: duties, mystery, exit (ghost frozen)');
  {
    const [a, b] = await party(port, 2, 'medium');
    await a.debug('freeze', { on: true });
    const st = await a.state();
    ok(a.world.quota === 4 && a.world.tasks.length === 6, 'medium: quota of 4 duties from a list of 6');
    ok(a.world.doors.stairs[1] === 1 && a.world.doors.exit[1] === 1, 'basement and exit start locked');
    // locked door feedback
    a.pos(38, 12.3); a.use('door', 'stairs');
    ok(await a.until(() => a.had('locked')), 'locked door reports locked');
    // key
    const key = a.item('key');
    a.pos(29.5, 20.4); a.use('item', key.id);
    ok(await a.until(() => a.item('key') && a.item('key').h === a.id), 'pick up the basement key');
    ok(await b.until(() => b.item('key').h === a.id), 'teammate sees who carries it');
    a.pos(38, 12.3); a.use('door', 'stairs');
    ok(await b.until(() => b.world.doors.stairs[1] === 0 && b.world.doors.stairs[0] === 1), 'key unlocks and opens the stairwell for everyone');
    ok(b.world.tasks.find((t) => t.id === 'key').done, 'duty "key" ticked on the shared checklist');
    // item swap + drop
    const bottle = b.world.items.find((i) => i.k === 'bottle');
    b.pos(bottle.x + 0.5, bottle.z + 0.5); b.use('item', bottle.id);
    await b.until(() => b.world.items.find((i) => i.id === bottle.id).h === b.id);
    b.pos(10, 11.5); b.send({ t: 'drop' });
    ok(await a.until(() => { const i = a.world.items.find((i) => i.id === bottle.id); return i && !i.h && Math.abs(i.x - 10) < 0.01; }), 'dropped items land where the player stands, for everyone');
    // fuse + power
    a.pos(39.1, 2.2); a.use('station', 'breaker');
    ok(await a.until(() => a.evs.find((e) => e.k === 'toast' && /no fuse/.test(e.text))), 'breaker refuses without a fuse');
    const fuse = a.item('fuse');
    a.pos(21.5, 23.3); a.use('item', fuse.id);
    ok(await a.until(() => a.world.tasks.find((t) => t.id === 'fuse').done), 'duty "fuse" done on pickup');
    a.pos(39.1, 2.2); a.use('station', 'breaker');
    ok(await b.until(() => b.world.power && b.world.tasks.find((t) => t.id === 'power').done), 'fuse restores power for everyone');
    // chart
    const chart = b.item('chart');
    b.pos(16.5, 12.6); b.use('item', chart.id);
    await b.until(() => b.item('chart').h === b.id);
    const wrong = st.chartBed === 1 ? 2 : 1, slot = (n) => M.stationById('slot' + n);
    b.pos(slot(wrong).x - 0.9, slot(wrong).z + 0.6); b.use('station', 'slot' + wrong);
    ok(await b.until(() => b.evs.find((e) => e.k === 'toast' && /Wrong bed/.test(e.text))), 'wrong bed is rejected with a hint');
    b.pos(slot(st.chartBed).x - 0.9, slot(st.chartBed).z + 0.6); b.use('station', 'slot' + st.chartBed);
    ok(await a.until(() => a.world.tasks.find((t) => t.id === 'chart').done), 'chart delivered to the right bed');
    ok(a.world.done === 4 && !a.world.exitOpen, 'quota met, but exit stays locked until the mystery is solved');
    // meds + call
    const meds = a.item('meds');
    a.pos(meds.x, meds.z + 0.9); a.use('item', meds.id);
    await a.until(() => a.item('meds').h === a.id);
    a.pos(24, 1.4); a.use('station', 'medcab');
    ok(await a.until(() => a.world.tasks.find((t) => t.id === 'meds').done), 'medicine case returned');
    b.pos(16.6, 1); b.use('station', 'call');
    ok(await a.until(() => a.world.tasks.find((t) => t.id === 'call').done && !a.world.callOn), 'call light answered');
    ok(b.had('note') && /03:12/.test(b.had('note').body), 'answering the call shows the call-panel evidence');
    // clues
    for (const [id, x, z] of [['clue_log', 12.5, 12.6], ['clue_file', 34, 14.5], ['clue_orders', 28.5, 1.4]]) { a.pos(x, z); a.use('station', id); await sleep(60); }
    ok(await b.until(() => b.world.clues.length === 4), 'evidence found by one player is shared with the team', JSON.stringify(b.world.clues.map((c) => c.id)));
    // doll + drawers
    const doll = a.item('doll');
    a.pos(12.6, 7.2); a.use('item', doll.id);
    ok(await a.until(() => a.world.clues.find((c) => c.id === 'relic')), 'picking up the doll reveals its tag');
    const wrongD = st.correctDrawer === 1 ? 2 : 1, dr = (n) => M.stationById('drawer' + n);
    const mark = a.evs.length;
    a.pos(dr(wrongD).x, 32.3); a.use('station', 'drawer' + wrongD);
    ok(await a.until(() => a.had('wrong', mark) && a.world.tried.includes(wrongD)), 'wrong morgue drawer is rejected and remembered');
    ok(a.item('doll').h === a.id, 'the doll stays with the player after a wrong guess');
    a.pos(dr(st.correctDrawer).x, 32.3); a.use('station', 'drawer' + st.correctDrawer);
    ok(await b.until(() => b.world.mystery && b.world.exitOpen && b.world.doors.exit[1] === 0), 'correct drawer solves the mystery and unlocks the exit');
    // exit
    a.pos(4, 21.2); a.use('door', 'exit'); await sleep(100);
    a.pos(4, 23.5);
    ok(await b.until(() => b.had('escaped') && b.world.escapeT !== null), 'first escape starts the countdown for the rest');
    ok(!a.ended, 'round continues while a teammate is still inside');
    b.pos(4, 23.5);
    ok(await a.until(() => a.ended && a.ended.win), 'everyone out: the team wins');
    ok(a.ended.players.every((p) => p.status === 'Clocked out'), 'end screen data lists both as clocked out');
    a.send({ t: 'lobby' });
    ok(await b.until(() => b.lobby.phase === 'lobby'), 'host returns the room to the lobby for another round');
    await closeAll([a, b]);
  }

  console.log('\n[5] Ghost senses');
  {
    const [a, b] = await party(port, 2, 'medium');
    b.pos(4, 17, 'still');
    // hearing: ghost idle in corridor facing east; A runs out of sight in the ward
    a.pos(11, 9.2, 'still'); a.use('door', 'ward_e'); await sleep(150);
    await a.debug('ghost', { x: 10, z: 11.5, ry: Math.PI / 2 });
    a.pos(7, 5, 'still'); await sleep(900);
    let s = await a.state();
    ok(s.ghost.state === 'idle', 'a silent, unseen player does not alert the ghost', s.ghost.state);
    for (let i = 0; i < 6; i++) { a.pos(7 + i * 0.05, 5, 'run'); await sleep(70); }
    a.pos(1, 18, 'still');
    ok(await a.until(() => a.snap.g.s === 'investigate'), 'running noise makes her investigate');
    ok(await a.until(() => Math.hypot(a.snap.g.x - 7.5, a.snap.g.z - 5) < 2.5, 12000), 'she walks to where the noise was, not to where the player went', JSON.stringify(a.snap.g));
    ok(await a.until(() => ['look', 'toSpot', 'listen'].includes(a.snap.g.s), 4000), 'then she searches the area');
    // doors she opens are heard
    ok(a.evs.some((e) => e.k === 'door' && e.by === 'ghost'), 'she opens doors on her way (broadcast for audio)');
    // thrown bottle
    await a.debug('ghost', { x: 33, z: 11.5, ry: Math.PI / 2 });
    const bottle = a.world.items.find((i) => i.k === 'bottle');
    a.pos(bottle.x, bottle.z + 0.6); a.use('item', bottle.id);
    await a.until(() => a.world.items.find((i) => i.id === bottle.id)?.h === a.id);
    a.pos(6, 11.5, 'crouch', Math.PI / 2); await sleep(120);
    const mark = a.evs.length;
    a.send({ t: 'throw', pitch: 0.4 });
    const sh = await a.until(() => a.had('shatter', mark), 3000);
    ok(sh && sh.x > 14, 'thrown bottle shatters at its landing point', JSON.stringify(sh));
    a.pos(1.2, 14.2, 'crouch');
    ok(await a.until(() => a.snap.g.s === 'investigate', 2000), 'the shatter draws her');
    ok(await a.until(() => Math.hypot(a.snap.g.x - sh.x, a.snap.g.z - sh.z) < 2.2, 15000), 'she goes to the impact point', JSON.stringify(a.snap.g));
    // two noises: nearer/louder one wins
    await a.debug('ghost', { x: 20, z: 11.5, ry: 0 });
    await sleep(200);
    for (let i = 0; i < 6; i++) { a.pos(3, 11.5, 'walk'); b.pos(25 + i * 0.05, 11.5, 'run'); await sleep(70); }
    await a.until(() => a.snap.g.s !== 'idle', 1500);
    s = await a.state();
    ok(s.ghost.state === 'notice' || s.ghost.state === 'chase' || a.snap.g.x > 20, 'with two noise sources she turns to the louder, closer one', JSON.stringify(s.ghost));
    await closeAll([a, b]);
  }

  console.log('\n[6] Sight, chase, capture, rescue, elimination, loss');
  {
    const [a, b] = await party(port, 2, 'medium');
    await a.debug('deaf', { on: true });
    b.pos(4, 20, 'still');
    await a.debug('ghost', { x: 30, z: 11.5, ry: -Math.PI / 2 });
    a.pos(12, 11.5, 'still'); // 18 m: beyond sight range
    await sleep(700);
    ok(a.snap.g.s === 'idle', 'beyond her sight range she does not react');
    a.pos(23, 11.5, 'still');
    const first = await a.until(() => ['notice', 'stalk'].includes(a.snap.g.s) && a.snap.g.s, 2500);
    ok(first, 'in range and in view: she reacts (warning phase first)', a.snap.g.s);
    ok(await a.until(() => a.snap.g.s === 'chase', 9000), 'then she gives chase');
    ok(await a.until(() => a.me()[7] === 'c', 9000), 'she catches a player who does not flee');
    ok(await b.until(() => b.had('grab')), 'teammates are told about the grab');
    ok(await a.until(() => a.snap.g.s === 'drag', 3000), 'she starts dragging the victim away');
    const dragStart = { x: a.snap.g.x, z: a.snap.g.z };
    await sleep(700);
    b.pos(a.snap.p.find((p) => p[0] === a.id)[1] + 0.5, a.snap.p.find((p) => p[0] === a.id)[2], 'run');
    await sleep(100);
    b.send({ t: 'rescue', pid: a.id });
    ok(await a.until(() => a.had('rescued') && a.me()[7] === 'a'), 'a teammate in reach pulls the victim free');
    ok(await a.until(() => a.snap.g.s === 'gone', 3000), 'she recoils and withdraws after a rescue');
    ok(a.me()[11] === 1, 'the rescued player is marked (one rescue each)');
    // second capture of A: no rescue window now
    b.pos(4, 20, 'still');
    const me = a.snap.p.find((p) => p[0] === a.id);
    a.pos(me[1], me[2], 'still');
    const q0 = a.world.quota, st0 = await a.state();
    await a.debug('ghost', { x: me[1] + 3, z: me[2], ry: -Math.PI / 2, idleFor: 999 });
    ok(await a.until(() => a.me()[7] === 'c', 8000), 'she captures the same player again');
    ok(await a.until(() => a.had('taken') && a.me()[7] === 'd', 8000), 'no second rescue: the player is taken and eliminated');
    const st1 = await a.state();
    ok(a.world.quota === q0 - 1, 'duty quota drops by one for the survivors', `${q0} -> ${a.world.quota}`);
    ok(st1.timeLeft > st0.timeLeft + 60, 'survivors get extra time');
    ok(!a.ended, 'round continues with one survivor');
    a.pos(20, 5); await sleep(200);
    ok(b.snap.p.find((p) => p[0] === a.id)[1] !== 20, 'eliminated players can no longer move or act in the world');
    await a.until(() => a.snap.g.s === 'gone', 3000);
    await a.debug('ghost', { x: 4.5, z: 15, ry: 0 });
    await sleep(100); b.pos(4.5, 20, 'still');
    ok(await b.until(() => b.ended && !b.ended.win && b.ended.reason === 'dead', 15000), 'last player taken: the team loses');
    await closeAll([a, b]);
  }

  console.log('\n[7] Hiding and searching');
  {
    const [a, b] = await party(port, 2, 'easy');
    await a.debug('freeze', { on: true });
    b.pos(4, 20, 'still');
    const h = M.HIDES.find((h) => h.type === 'wardrobe' && h.room === 'ward');
    a.pos(h.ex, h.ez); a.use('hide', h.id);
    ok(await b.until(() => b.snap.p.find((p) => p[0] === a.id)[7] === 'h'), 'hiding is visible to the server and teammates');
    b.pos(h.ex, h.ez); b.use('hide', h.id);
    ok(await b.until(() => b.evs.find((e) => e.k === 'toast' && /already/.test(e.text))), 'one player per hiding spot');
    b.pos(4, 20, 'still');
    // unseen hider holding breath survives a search
    await a.debug('freeze', { on: false }); await a.debug('deaf', { on: true });
    a.send({ t: 'breath', h: true });
    let mark = a.evs.length;
    await a.debug('ghost', { x: h.ex, z: h.ez, state: 'toSpot', data: { spot: h.id, certain: false } });
    ok(await a.until(() => a.had('listen', mark), 2000), 'she stops and listens at the hiding spot (warning event sent)');
    await a.until(() => a.snap.g.s !== 'listen' && a.snap.g.s !== 'toSpot', 6000);
    ok(a.me()[7] === 'h' && a.snap.g.s !== 'open' && a.snap.g.s !== 'grab', 'holding your breath: she moves on', a.snap.g.s);
    a.send({ t: 'breath', h: false });
    // breathing hider is found
    await a.debug('freeze', { on: true }); await sleep(2500); await a.debug('freeze', { on: false });
    await a.debug('ghost', { x: h.ex, z: h.ez, state: 'toSpot', data: { spot: h.id, certain: false } });
    ok(await a.until(() => a.me()[7] === 'c', 7000), 'breathing while she listens: she opens the door and grabs you');
    b.send({ t: 'rescue', pid: a.id }); await sleep(200);
    ok(a.me()[7] === 'c', 'a teammate out of reach cannot rescue');
    await a.until(() => a.me()[7] === 'd', 12000);
    // breath runs out
    await b.debug('freeze', { on: true });
    const h2 = M.HIDES.find((h) => h.type === 'table' && h.room === 'entrance');
    b.pos(h2.ex, h2.ez); b.use('hide', h2.id);
    await b.until(() => b.me()[7] === 'h');
    b.send({ t: 'breath', h: true });
    ok(await b.until(() => b.had('gasp'), DIFF.easy.breath * 1000 + 3000), 'breath runs out into a noisy gasp');
    b.send({ t: 'unhide' });
    ok(await b.until(() => b.me()[7] === 'a' && Math.abs(b.me()[1] - h2.ex) < 0.01), 'leaving a hiding spot puts you back at its opening');
    // seen entering a spot
    await b.debug('freeze', { on: false }); await b.debug('deaf', { on: true });
    await b.debug('ghost', { x: h2.ex - 4, z: h2.ez + 1.5, ry: Math.PI / 2, state: 'block', data: { blockFor: 99 } });
    b.pos(h2.ex, h2.ez); await sleep(100); b.use('hide', h2.id);
    ok(await b.until(() => b.me()[7] === 'c' || b.me()[7] === 'd', 9000), 'if she watches you hide, hiding does not save you');
    ok(await b.until(() => b.ended && !b.ended.win, 12000), 'round ends in a loss once everyone is taken');
    await closeAll([a, b]);
  }

  console.log('\n[8] Timer, difficulties, power cut');
  {
    for (const d of ['easy', 'medium', 'hard', 'extreme']) {
      const [a, b] = await party(port, 2, d);
      const s = await a.state();
      ok(a.world.quota === DIFF[d].quota && Math.abs(s.timeLeft - DIFF[d].time) < 5 && s.jammed.length === Math.floor(M.HIDES.length * DIFF[d].jammed),
        `${d}: quota ${a.world.quota}, ${Math.round(s.timeLeft / 60)} min, ${s.jammed.length} jammed hiding spots`);
      if (d === 'hard') {
        const j = s.jammed[0], h = M.hideById(j);
        a.pos(h.ex, h.ez); a.use('hide', j); await sleep(200);
        ok(a.me()[7] === 'a', 'jammed hiding spots cannot be used');
      }
      if (d === 'extreme') {
        await a.debug('time', { v: 0.5 });
        ok(await a.until(() => a.ended && !a.ended.win && a.ended.reason === 'time', 3000), 'running out of shift time is a loss');
      }
      await closeAll([a, b]);
    }
  }

  console.log('\n[9] Dropped connections');
  {
    const [a, b] = await party(port, 2, 'medium');
    await a.debug('freeze', { on: true });
    a.pos(12, 11.5, 'walk', 1); await sleep(200);
    const keep = { id: a.id, key: a.key, code: a.code };
    a.ws.terminate(); await sleep(150);
    ok(await b.until(() => { const r = b.snap.p.find((p) => p[0] === keep.id); return r && r[13] === 1; }), 'teammates see the dropped player as "reconnecting"');
    ok(b.snap.p.length === 2 && b.snap.p.find((p) => p[0] === keep.id)[7] === 'a', 'the dropped player keeps their place in the round');
    const a2 = new Bot(port, 'Bot1'); a2.started = false;
    await new Promise((res) => { a2.ws = new WebSocket(`ws://localhost:${port}`); a2.ws.on('open', () => a2.send({ t: 'join', name: 'Bot1', code: keep.code, resume: { id: keep.id, key: keep.key } })); a2.ws.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'welcome') { a2.id = m.id; a2.resumed = m.resumed; } else if (m.t === 'start') { a2.started = m; a2.world = m.world; } else if (m.t === 's') a2.snap = m; else if (m.t === 'err') a2.err = m; if (a2.started && a2.snap) res(); }); setTimeout(res, 4000); });
    ok(a2.resumed && a2.id === keep.id, 'reconnecting with the saved key resumes the same player');
    ok(a2.started && a2.started.resume && Math.abs(a2.started.you.x - 12) < 0.01, 'the resumed player is back in the same round, in the same spot');
    ok(await b.until(() => { const r = b.snap.p.find((p) => p[0] === keep.id); return r && r[13] === 0; }), 'teammates see them come back');
    const bad = await new Promise((res) => { const w = new WebSocket(`ws://localhost:${port}`); w.on('open', () => w.send(JSON.stringify({ t: 'join', name: 'x', code: keep.code, resume: { id: keep.id, key: 'wrong' } }))); w.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'err') { w.close(); res(m); } }); });
    ok(bad.gone, 'a wrong key cannot take over someone else\'s player');
    const gone = await new Promise((res) => { const w = new WebSocket(`ws://localhost:${port}`); w.on('open', () => w.send(JSON.stringify({ t: 'join', name: 'x', code: 'QQQQ', resume: { id: 1, key: 'k' } }))); w.on('message', (raw) => { const m = JSON.parse(raw); if (m.t === 'err') { w.close(); res(m); } }); });
    ok(gone.gone && /ended/.test(gone.msg), 'resuming a shift that no longer exists says so');
    a2.ws.close(); await closeAll([b]);
  }

  srv.close();

  console.log('\n[10] Soak: full rounds simulated at high speed, ghost live, 5 wandering players');
  {
    const fakeWs = () => ({ readyState: 1, send() {} });
    for (const diff of ['easy', 'medium', 'hard', 'extreme']) {
      const stats = { states: {}, captures: 0, rescues: 0, deaths: 0, moved: 0, ended: 0, unfair: 0 };
      for (let seed = 1; seed <= 6; seed++) {
        const room = new Room('TEST', {});
        room.diff = diff;
        const evs = [];
        room.broadcast = (m) => { if (m.t === 'ev') evs.push(m); if (m.t === 'end') stats.ended++; };
        room.send = () => {};
        for (let i = 0; i < 5; i++) room.add(fakeWs(), 'S' + i);
        room.startRound(seed * 977);
        room.stop();
        const ps = [...room.players.values()];
        const brain = ps.map(() => ({ path: [], wait: 0 }));
        let rnd = seed * 31;
        const rng = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
        let lastG = { x: room.ghost.x, z: room.ghost.z }, warned = new Set();
        room.doors.stairs.locked = false; room.nav.setLocked('stairs', false);
        for (let t = 0; t < 15 * 60 * 12 && room.phase === 'playing'; t++) {
          ps.forEach((p, i) => {
            const br = brain[i];
            if (!p.alive || p.captured || p.hidden) { if (p.hidden && rng() < 0.01) room.onMessage(p, { t: 'unhide' }); return; }
            if (br.wait > 0) { br.wait -= 1 / 15; p.mode = 'still'; return; }
            if (!br.path.length) {
              if (rng() < 0.15) { const h = M.HIDES[(rng() * M.HIDES.length) | 0]; if (Math.hypot(h.ex - p.x, h.ez - p.z) < 2) { room.onMessage(p, { t: 'use', kind: 'hide', id: h.id }); return; } }
              const w = M.WAYPOINTS[(rng() * M.WAYPOINTS.length) | 0];
              br.path = room.nav.path(p.x, p.z, w.x, w.z) || []; br.run = rng() < 0.3; br.wait = rng() * 3;
            }
            let left = (br.run ? 5.2 : 2.7) / 15;
            while (br.path.length && left > 0) { const q = br.path[0], d = Math.hypot(q.x - p.x, q.z - p.z); if (d <= left) { p.x = q.x; p.z = q.z; left -= d; br.path.shift(); } else { p.x += ((q.x - p.x) / d) * left; p.z += ((q.z - p.z) / d) * left; left = 0; } }
            p.mode = br.run ? 'run' : 'walk';
            if (p.item == null && rng() < 0.002) { const v = ps.find((q) => q.captured && Math.hypot(q.x - p.x, q.z - p.z) < 3); if (v) room.onMessage(p, { t: 'rescue', pid: v.id }); }
          });
          const before = evs.length;
          room.tick(1 / 15);
          const g = room.ghost;
          stats.states[g.state] = (stats.states[g.state] || 0) + 1;
          stats.moved += Math.hypot(g.x - lastG.x, g.z - lastG.z); lastG = { x: g.x, z: g.z };
          for (const e of evs.slice(before)) {
            if (e.k === 'notice' || e.k === 'search' || e.k === 'listen' || e.k === 'open') warned.add(e.pid ?? 'spot');
            if (e.k === 'grab') { stats.captures++; if (!warned.size) stats.unfair++; warned = new Set(); }
            if (e.k === 'rescued') stats.rescues++;
            if (e.k === 'taken') stats.deaths++;
          }
        }
      }
      const tot = Object.values(stats.states).reduce((a, b) => a + b, 0);
      const pct = Object.entries(stats.states).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((v / tot) * 100)}%`).join(', ');
      console.log(`  ${diff}: ${stats.captures} captures, ${stats.deaths} taken, ${stats.rescues} rescues over 6 rounds; ghost travelled ${Math.round(stats.moved)} m`);
      console.log(`    time in state: ${pct}`);
      ok(stats.moved > 500 && stats.states.patrol && stats.states.chase, `${diff}: ghost patrols and chases without getting stuck`);
      ok(stats.unfair === 0, `${diff}: every capture was preceded by a warning phase`, `${stats.unfair} without`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
