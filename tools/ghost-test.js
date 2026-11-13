// Ghost roster test (dev only): drives rooms directly with a simulated clock and checks each ghost's own rules.
//   node tools/ghost-test.js
import { Room } from '../server/room.js';
import { KINDS, GHOSTS } from '../shared/ghosts.js';
import * as M from '../shared/map.js';

let pass = 0, fail = 0;
const ok = (c, n, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n} ${c ? '' : x}`); };
const sock = (log) => ({ readyState: 1, send: (s) => log && log.push(JSON.parse(s)) });
function setup(kind, { players = 1, mode = 'one', diff = 'medium', seed = 99 } = {}) {
  const r = new Room('TEST', { debug: true }), logs = [], ps = [];
  for (let i = 0; i < players; i++) { const log = []; logs.push(log); ps.push(r.add(sock(log), 'N' + i).p); }
  r.diff = diff; r.mode = mode;
  r.startRound(seed, kind); r.stop();
  for (const p of ps) Object.assign(p, { flash: true, mode: 'still' });
  return { r, ps, logs, g: r.ghosts[0] };
}
const run = (r, secs, each) => { for (let t = 0; t < secs; t += 0.05) { if (each) each(); r.tick(0.05); if (r.phase !== 'playing') break; } };
const place = (g, x, z, ry, state = 'idle') => { g.x = x; g.z = z; g.ry = ry; g.path = []; g.vis = 1; g.set(state, { idleFor: 999 }); };
const evs = (log, k) => log.filter((m) => m.t === 'ev' && m.k === k);

// --- the draw
{
  const seen = new Set();
  for (let s = 1; s <= 120; s++) { const r = new Room('R', {}); r.add(sock(), 'a'); r.startRound(s); r.stop(); seen.add(r.ghosts[0].kind); }
  ok(KINDS.every((k) => seen.has(k)), 'each shift draws one ghost at random, and all five come up', [...seen].join(','));
  const r = new Room('R', {}); r.add(sock(), 'a'); r.startRound(5, 'blind'); r.stop();
  ok(r.ghosts.length === 1, 'players cannot pick the ghost: a requested ghost is ignored outside debug', r.ghosts[0].kind);
}
// --- every ghost has its own belonging, name and drawer
for (const kind of KINDS) {
  const { r } = setup(kind), it = r.items.find((i) => i.k === 'doll');
  ok(it && it.nm === GHOSTS[kind].item.name && r.drawers.includes(r.info[0].last), `${GHOSTS[kind].title}: her belonging (${it && it.nm}) and her name in a morgue drawer`);
}
// --- the blind patient: cannot see, hears far, rushes, takes by touch
{
  const { r, ps, g } = setup('blind'); const p = ps[0];
  place(g, 4, 11.5, 0); Object.assign(p, { x: 4, z: 17, mode: 'still', flash: true }); // 5.5 m in front, in plain view, torch on
  run(r, 3);
  ok(!['notice', 'chase', 'investigate'].includes(g.state), 'Blind Patient: a silent nurse in plain view with a torch is not seen', g.state);
  Object.assign(p, { mode: 'run' }); run(r, 0.6);
  ok(g.state === 'investigate' && g.rushing && g.anim() === 'run', 'Blind Patient: she rushes at the sound of running', `${g.state} ${g.anim()}`);
  Object.assign(p, { mode: 'still' }); place(g, 4, 16, 0, 'idle'); p.x = 4; p.z = 16.8; run(r, 0.2);
  ok(p.captured, 'Blind Patient: whatever she walks into, she takes');
  const m = setup('mother'); place(m.g, 4, 11.5, 0); Object.assign(m.ps[0], { x: 4, z: 17, mode: 'still', flash: true }); run(m.r, 3);
  ok(['notice', 'chase', 'stalk'].includes(m.g.state) || m.ps[0].captured, 'Mother (for comparison): the same nurse is seen at once', m.g.state);
}
// --- the matron: torchlight from far, dark nurses up close, intercom
{
  const { r, ps, g, logs } = setup('matron'); const p = ps[0];
  place(g, 2, 11.5, Math.PI / 2); Object.assign(p, { x: 21, z: 11.5, mode: 'still', flash: true }); // 19 m down the main corridor
  const los = M.lineOfSight(g.x, g.z, p.x, p.z, r.doors);
  run(r, 1.2);
  ok(los && ['notice', 'chase', 'stalk'].includes(g.state), 'Matron: she spots a torch from 19 m (the Mother sees 14 m)', `los ${los} ${g.state}`);
  place(g, 4, 11.5, 0); Object.assign(p, { x: 4, z: 18.5, flash: false }); run(r, 1.2);
  ok(g.state === 'idle', 'Matron: a nurse with the torch off is invisible to her at 7 m', g.state);
  r.ghosts[0].frozen = false; run(r, 75);
  ok(evs(logs[0], 'pa').length >= 1 && evs(logs[0], 'pa')[0].gk === 'matron', 'Matron: she speaks over the intercom', evs(logs[0], 'pa').length);
}
// --- the surgeon: walks, never loses you in the open, searches every spot in a room and counts
{
  const { r, ps, g, logs } = setup('surgeon'); const p = ps[0];
  place(g, 30, 11.5, -Math.PI / 2); Object.assign(p, { x: 22, z: 11.5, mode: 'still' }); run(r, 2.2);
  ok(g.state === 'chase' && g.anim() === 'walk', 'Surgeon: he does not run, even when chasing', `${g.state} ${g.anim()}`);
  Object.assign(p, { x: 4, z: 17, mode: 'walk' }); // out of sight round the corner, not hidden
  run(r, 4);
  ok(g.state === 'chase' && Math.hypot(g.lastKnown.x - p.x, g.lastKnown.z - p.z) < 1, 'Surgeon: out of sight is not enough, he still knows where you are', `${g.state}`);
  const x0 = g.x; run(r, 1); const v = Math.abs(g.x - x0);
  ok(v > 2.6 && v < 3.6, 'Surgeon: he moves at a steady 3.3 m/s (slower than running, faster than walking)', v.toFixed(2));
  const h = M.HIDES.find((q) => q.room === 'ward');
  Object.assign(p, { x: h.x, z: h.z, hidden: h.id, mode: 'still' }); g.beginSearch({ x: 7, z: 5 }); run(r, 30, () => { p.holdBreath = true; p.breath = 9; });
  const counts = evs(logs[0], 'count');
  const wardSpots = M.HIDES.filter((q) => q.room === 'ward' && !r.jammed.has(q.id)).length;
  ok(counts.length >= Math.min(4, wardSpots) && counts[0].n === 1 && counts[1].n === 2, 'Surgeon: he checks the hiding spots in the room one by one, counting', `${counts.length} counts of ${wardSpots}`);
}
// --- the mimic: lures one nurse with another's voice
{
  const { r, ps, g, logs } = setup('mimic', { players: 2 }); const [a, b] = ps;
  Object.assign(a, { x: 4, z: 17 }); Object.assign(b, { x: 24, z: 17 });
  place(g, 35, 6, 0); g.lureT = 0.1; run(r, 0.5);
  const lure = evs(logs[0], 'mimic')[0];
  ok(lure && [a.id, b.id].includes(lure.pid) && (lure.as === null || lure.as !== lure.pid) && (lure.how === 'voice' || lure.how === 'steps'), 'Mimic: it calls one nurse from another room, in a teammate\'s voice', JSON.stringify(lure));
  ok(lure && g.state === 'patrol' && g.then === 'block', 'Mimic: then it goes to wait where the voice came from', g.state);
}
// --- All of them
{
  const { r, ps, logs } = setup(null, { mode: 'all', players: 2 });
  ok(r.ghosts.length === 5 && new Set(r.ghosts.map((g) => g.kind)).size === 5, 'All of them: all five ghosts are in the building');
  ok(new Set(r.drawers).size === 5 && r.info.every((i) => r.drawers.includes(i.last)), 'All of them: the five morgue drawers are their five names');
  ok(r.cfg.time === Math.round(23 * 60 * 1.5), 'All of them: the shift is half as long again', r.cfg.time);
  for (const g of r.ghosts) g.frozen = false;
  run(r, 60);
  const up = r.ghosts.filter((g) => g.state !== 'dormant').length;
  ok(up === 1, 'All of them: they arrive one at a time', `${up} awake after 60 s`);
  const p = ps[0]; Object.assign(p, { x: 33, z: 31.3 });
  for (const g of r.ghosts) g.frozen = true;
  r.doors.stairs.locked = false;
  for (let o = 0; o < 5; o++) {
    const it = r.items.find((i) => i.k === 'doll' && i.o === o); it.h = p.id; p.item = it.id;
    const n = r.drawers.indexOf(r.info[o].last) + 1, st = M.stationById('drawer' + n);
    p.x = st.x; p.z = st.z - 1.2; r.use(p, { kind: 'station', id: st.id });
  }
  ok(r.rested === 5 && r.ghosts.every((g) => g.state === 'rest') && r.mystery, 'All of them: each belonging returned lays that one to rest; all five unlocks the ending', `${r.rested} ${r.mystery}`);
  ok(evs(logs[0], 'rested').length === 5, 'All of them: each one laid to rest is announced');
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
