// One lobby + round. The server is authoritative for everything except player movement.
import { DIFF, LOUD, MAX_PLAYERS, REACH } from '../shared/config.js';
import * as M from '../shared/map.js';
import { Nav } from './nav.js';
import { Ghost } from './ghost.js';

const TICK = 1 / 20;
const SURNAMES = ['Marrow', 'Quill', 'Feld', 'Calder', 'Voss', 'Hale', 'Brandt', 'Lowe'];
const FIRST = ['Ilse', 'Edda', 'Nora', 'Ruth', 'Agnes', 'Mabel'];
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const d2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);

export class Room {
  constructor(code, opts = {}) {
    this.code = code; this.players = new Map(); this.phase = 'lobby'; this.diff = 'medium';
    this.nextId = 1; this.hostId = null; this.debug = !!opts.debug; this.grace = opts.grace; this.timer = null; this.onEmpty = opts.onEmpty;
  }
  send(p, msg) { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg)); }
  broadcast(msg) { const s = JSON.stringify(msg); for (const p of this.players.values()) if (p.ws && p.ws.readyState === 1) p.ws.send(s); }
  ev(e) { this.broadcast({ t: 'ev', ...e }); }
  toast(text, p) { const m = { t: 'ev', k: 'toast', text }; p ? this.send(p, m) : this.broadcast(m); }

  add(ws, name) {
    if (this.phase !== 'lobby') return { err: 'A round is in progress. Wait for it to end, then join.' };
    if (this.players.size >= MAX_PLAYERS) return { err: 'This shift is full (5 players).' };
    const p = { id: this.nextId++, ws, key: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), name: String(name || 'Nurse').slice(0, 16).trim() || 'Nurse', x: 0, z: 0, ry: 0, rx: 0, mode: 'still', flash: true, alive: true, offline: false };
    this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    this.send(p, { t: 'welcome', id: p.id, key: p.key, code: this.code, debug: this.debug });
    this.sendLobby();
    return { p };
  }
  // The connection dropped. Keep the player (and their place in the round) for a while so they can reconnect.
  dropped(p) {
    if (this.players.get(p.id) !== p) return;
    p.offline = true; p.mode = 'still'; p.holdBreath = false;
    clearTimeout(p.dropTimer);
    p.dropTimer = setTimeout(() => { if (p.offline && this.players.get(p.id) === p) this.remove(p); }, this.grace ?? (this.phase === 'playing' ? 75000 : 12000));
    clearTimeout(p.sayTimer); p.said = false;
    p.sayTimer = setTimeout(() => { if (p.offline && this.phase === 'playing' && p.alive && !p.escaped) { p.said = true; this.toast(`${p.name} lost connection. Waiting for them to come back.`); } }, 4000); // ignore quick blips
    this.sendLobby();
  }
  // Same player, new connection: put them back exactly where they were.
  reattach(ws, p) {
    clearTimeout(p.dropTimer); clearTimeout(p.sayTimer);
    if (p.ws && p.ws !== ws) { try { p.ws.terminate ? p.ws.terminate() : p.ws.close(); } catch {} }
    const was = p.offline; p.ws = ws; p.offline = false;
    this.send(p, { t: 'welcome', id: p.id, key: p.key, code: this.code, debug: this.debug, resumed: true });
    this.sendLobby();
    if (this.phase === 'playing') {
      this.send(p, { t: 'start', resume: true, diff: this.diff, cfg: { breath: this.cfg.breath, rescue: this.cfg.rescue, time: this.cfg.time }, you: { x: p.x, z: p.z, ry: p.ry }, world: this.world() });
      if (was && p.said && p.alive && !p.escaped) this.toast(`${p.name} is back.`);
    } else if (this.phase === 'ended' && this.lastEnd) this.send(p, this.lastEnd);
  }
  remove(p) {
    clearTimeout(p.dropTimer);
    this.players.delete(p.id);
    if (this.phase === 'playing' && p.alive && !p.escaped) {
      this.dropItem(p, false);
      if (this.ghost.victim === p.id) this.ghost.victim = null;
      this.toast(`${p.name} left the building.`);
    }
    if (this.hostId === p.id) this.hostId = this.players.keys().next().value ?? null;
    if (!this.players.size) { this.stop(); this.onEmpty && this.onEmpty(this); return; }
    this.sendLobby();
    if (this.phase === 'playing') this.checkEnd();
  }
  sendLobby() {
    this.broadcast({ t: 'lobby', phase: this.phase, diff: this.diff, host: this.hostId, players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, offline: !!p.offline })) });
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  // ---------------------------------------------------------------- round setup
  startRound(seed = (Math.random() * 2 ** 31) | 0) {
    const rng = (this.rng = mulberry32(seed));
    const cfg = (this.cfg = DIFF[this.diff]);
    const pick = (arr) => arr[(rng() * arr.length) | 0];
    const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
    this.nav = new Nav();
    this.doors = {};
    for (const d of M.DOORS) { this.doors[d.id] = { open: !!d.open || !!d.arch, locked: !!d.lock }; if (d.lock) this.nav.setLocked(d.id, true); }
    const names = shuffle(SURNAMES).slice(0, 5);
    this.ghostName = { first: pick(FIRST), last: names[0] };
    this.drawers = shuffle(names); // index -> surname
    this.correctDrawer = this.drawers.indexOf(names[0]) + 1;
    this.tried = new Set();
    this.chartBed = 1 + ((rng() * 6) | 0);
    this.items = [];
    let iid = 1;
    const addItem = (k, s) => this.items.push({ id: 'i' + iid++, k, x: s[0], z: s[1], y: s[2], h: null });
    for (const k of ['key', 'fuse', 'chart', 'doll']) addItem(k, M.ITEM_SPAWNS[k]);
    addItem('meds', pick(M.ITEM_SPAWNS.meds));
    for (const s of M.ITEM_SPAWNS.bottle) addItem('bottle', s);
    this.tasks = [
      { id: 'key', label: 'Find the basement key and unlock the stairwell' },
      { id: 'fuse', label: 'Fetch the spare fuse from the boiler room' },
      { id: 'power', label: 'Fit the fuse at the Storage breaker to restore power' },
      { id: 'chart', label: 'Deliver the patient chart to the right bed' },
      { id: 'meds', label: 'Return the medicine case to the Treatment cabinet' },
      { id: 'call', label: 'Answer the call light in Room 3' },
    ].map((t) => ({ ...t, done: false }));
    this.quota = cfg.quota; this.timeLeft = cfg.time; this.elapsed = 0;
    this.power = false; this.fuseFitted = false; this.callOn = true;
    this.clues = []; this.mystery = false; this.exitOpen = false; this.escapeT = null;
    const hides = shuffle(M.HIDES);
    this.jammed = new Set(hides.slice(0, Math.floor(hides.length * cfg.jammed)).map((h) => h.id));
    const spawns = shuffle(M.SPAWNS);
    let i = 0;
    for (const p of this.players.values()) {
      Object.assign(p, { x: spawns[i][0], z: spawns[i][1], ry: Math.PI, rx: 0, mode: 'still', flash: true, alive: true, escaped: false, captured: false,
        hidden: null, holdBreath: false, breath: cfg.breath, gasp: 0, item: null, rescuedUsed: false, stepT: 0, workT: 0 });
      i++;
    }
    this.ghost = new Ghost(this);
    this.scareT = 25 + rng() * 25; this.lastScare = null; this.wv = 0;
    this.phase = 'playing';
    for (const p of this.players.values()) this.send(p, { t: 'start', seed, diff: this.diff, cfg: { breath: cfg.breath, rescue: cfg.rescue, time: cfg.time }, you: { x: p.x, z: p.z, ry: p.ry }, world: this.world() });
    this.sendLobby();
    this.stop();
    this.timer = setInterval(() => { try { this.tick(TICK); } catch (e) { console.error('tick error (round continues)', e); } }, TICK * 1000);
  }

  world() {
    return {
      v: ++this.wv, doors: Object.fromEntries(Object.entries(this.doors).map(([k, d]) => [k, [d.open ? 1 : 0, d.locked ? 1 : 0]])),
      items: this.items.map((i) => ({ id: i.id, k: i.k, x: i.x, y: i.y, z: i.z, h: i.h, txt: i.k === 'chart' ? `Ward A - Bed ${this.chartBed}` : undefined })),
      tasks: this.tasks, quota: this.quota, done: this.tasks.filter((t) => t.done).length, power: this.power, fuseFitted: this.fuseFitted, callOn: this.callOn,
      clues: this.clues, mystery: this.mystery, exitOpen: this.exitOpen, jammed: [...this.jammed], drawers: this.drawers, tried: [...this.tried],
      escapeT: this.escapeT,
    };
  }
  sync() { this.broadcast({ t: 'world', world: this.world() }); }

  // ---------------------------------------------------------------- helpers
  noise(x, z, loud, p) { if (!p || (p.alive && !p.captured && !p.escaped)) this.ghost.stim.push({ x, z, loud }); }
  setDoor(id, open, by) {
    const d = this.doors[id]; if (d.open === open) return;
    d.open = open;
    const c = M.doorPos(M.doorById(id));
    this.ev({ k: 'door', id, open, x: c.x, z: c.z, by });
    this.sync();
  }
  setPower(on, byGhost) {
    this.power = on;
    this.ev({ k: 'power', on, byGhost: !!byGhost });
    this.sync();
  }
  finish(id, p) {
    const t = this.tasks.find((t) => t.id === id);
    if (!t || t.done) return;
    t.done = true;
    this.ev({ k: 'task', id, by: p ? p.name : null, label: t.label });
    this.updateExit();
  }
  updateExit() {
    const done = this.tasks.filter((t) => t.done).length;
    if (!this.exitOpen && this.mystery && done >= this.quota) {
      this.exitOpen = true; this.doors.exit.locked = false; this.nav.setLocked('exit', false);
      this.ev({ k: 'exitOpen' });
    }
    this.sync();
  }
  clue(id, p) {
    const text = this.clueText(id);
    if (p) this.send(p, { t: 'ev', k: 'note', id, ...text });
    if (!this.clues.find((c) => c.id === id)) { this.clues.push({ id, title: text.title, short: text.short }); this.ev({ k: 'clue', id, by: p ? p.name : null, title: text.title }); this.sync(); }
  }
  clueText(id) {
    const g = this.ghostName, N = g.last.toUpperCase();
    return {
      clue_log: { title: 'Night log, nurses\' station', body: `14 Nov - 02:40\nRoom 3 has rung all night again. Matron says leave it.\nShe never asks for anything but the doll.`, short: 'The patient in Room 3 kept calling for a doll.' },
      clue_orders: { title: 'Standing orders, treatment room', body: `ROOM 3 - sedate when she asks for the child.\nDo NOT answer the call light after midnight.\nBelongings to stay locked away.`, short: 'Staff were ordered to ignore Room 3 and keep her belongings from her.' },
      clue_file: { title: 'Admission file, records office', body: `${N}, ${g.first} - Room 3\nInfant: stillborn. Patient not to be informed.\nDeceased 14 Nov, 03:12. Body unclaimed - held in morgue.`, short: `Room 3 was ${g.first} ${g.last}. She died at 03:12; her body is still in the morgue.` },
      call: { title: 'Call panel, Room 3', body: `BED 3 - CALL ACTIVE\nFirst raised 03:12 - 14 NOV\nNever answered.`, short: 'The Room 3 call light has been ringing, unanswered, since 03:12.' },
      doll: { title: 'Wrist tag tied to the doll', body: `"for my girl"\nProperty of patient, Rm 3 - WITHHELD`, short: 'The doll in the ward cot belonged to the patient in Room 3.' },
    }[id];
  }
  dropItem(p, makeNoise = true) {
    const it = this.items.find((i) => i.h === p.id);
    if (!it) return;
    it.h = null; it.x = p.x; it.z = p.z; it.y = 0; p.item = null;
    if (makeNoise) { this.noise(p.x, p.z, it.k === 'bottle' ? LOUD.bottleDrop : LOUD.drop, p); this.ev({ k: 'drop', x: p.x, z: p.z, item: it.k }); }
    this.sync();
  }
  capture(p) {
    this.dropItem(p, false);
    const spot = p.hidden;
    p.hidden = null; p.captured = true; p.holdBreath = false;
    this.ev({ k: 'grab', pid: p.id, spot, x: p.x, z: p.z });
  }
  eliminate(p) {
    p.alive = false; p.captured = false;
    this.quota = Math.max(2, this.quota - 1);
    this.timeLeft += 90;
    this.ev({ k: 'taken', pid: p.id, name: p.name, quota: this.quota });
    this.updateExit();
    this.checkEnd();
  }
  active() { return [...this.players.values()].filter((p) => p.alive && !p.escaped); }
  checkEnd() {
    if (this.phase !== 'playing') return;
    const ps = [...this.players.values()];
    const escaped = ps.filter((p) => p.escaped).length, inside = this.active().length;
    if (inside === 0) this.end(escaped > 0, escaped > 0 ? 'escaped' : 'dead');
  }
  end(win, reason) {
    this.phase = 'ended'; this.stop();
    this.lastEnd = { t: 'end', win, reason, ghost: `${this.ghostName.first} ${this.ghostName.last}`, elapsed: Math.round(this.elapsed), duties: this.tasks.filter((t) => t.done).length, quota: this.quota, mystery: this.mystery,
      players: [...this.players.values()].map((p) => ({ name: p.name, status: p.escaped ? 'Clocked out' : p.alive ? 'Left behind' : 'Taken' })) };
    this.broadcast(this.lastEnd);
    this.sendLobby();
  }

  // ---------------------------------------------------------------- tick
  tick(dt) {
    if (this.phase !== 'playing') return;
    this.elapsed += dt; this.timeLeft -= dt;
    const g = this.ghost, cfg = this.cfg;
    for (const p of this.players.values()) {
      if (!p.alive || p.escaped || p.captured) continue;
      if (!p.hidden) {
        p.stepT -= dt;
        if (p.stepT <= 0 && (p.mode === 'run' || p.mode === 'walk')) { p.stepT = p.mode === 'run' ? 0.33 : 0.5; this.noise(p.x, p.z, p.mode === 'run' ? LOUD.run : LOUD.walk, p); }
        if (this.exitOpen && p.x > M.EXIT_ZONE.x0 && p.x < M.EXIT_ZONE.x1 && p.z > M.EXIT_ZONE.z0) {
          p.escaped = true; this.dropItem(p, false);
          this.ev({ k: 'escaped', pid: p.id, name: p.name });
          if (this.escapeT === null && this.active().length) { this.escapeT = 75; this.sync(); }
        }
      }
      p.gasp = Math.max(0, p.gasp - dt);
      if (p.hidden && p.holdBreath && p.gasp <= 0) {
        p.breath -= dt;
        if (p.breath <= 0) { p.breath = 0; p.holdBreath = false; p.gasp = 3; this.noise(p.x, p.z, LOUD.gasp, p); this.ev({ k: 'gasp', pid: p.id, x: p.x, z: p.z }); }
      } else { p.holdBreath = p.holdBreath && !!p.hidden && p.gasp <= 0; if (!p.holdBreath) p.breath = Math.min(cfg.breath, p.breath + dt * 0.7); }
    }
    g.update(dt);
    this.director(dt);
    if (this.escapeT !== null) { this.escapeT -= dt; if (this.escapeT <= 0) return this.end(true, 'escaped'); }
    if (this.timeLeft <= 0) return this.end([...this.players.values()].some((p) => p.escaped), 'time');
    this.checkEnd();
    if (this.phase !== 'playing') return;
    this.broadcast({
      t: 's', st: Date.now(), tl: Math.ceil(this.timeLeft),
      g: { x: +g.x.toFixed(2), z: +g.z.toFixed(2), ry: +g.ry.toFixed(2), a: g.anim(), v: +g.vis.toFixed(2), s: g.state, vic: g.victim, spot: g.spot && ['toSpot', 'listen', 'open'].includes(g.state) ? g.spot : null },
      p: [...this.players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.ry.toFixed(2), +p.rx.toFixed(2), p.mode, p.flash ? 1 : 0,
        p.escaped ? 'e' : !p.alive ? 'd' : p.captured ? 'c' : p.hidden ? 'h' : 'a', p.hidden, +p.breath.toFixed(1), p.holdBreath ? 1 : 0, p.rescuedUsed ? 1 : 0, p.pt || 0, p.offline ? 1 : 0]),
    });
  }

  // Ambient, non-lethal scares. The director never feeds positions to the ghost's hunting logic.
  director(dt) {
    this.scareT -= dt;
    if (this.scareT > 0) return;
    const live = this.active().filter((p) => !p.captured);
    this.scareT = (35 + this.rng() * 50) * (this.cfg.special[0] / 28 * 0.5 + 0.5);
    if (!live.length || ['grab', 'drag', 'take', 'chase', 'notice'].includes(this.ghost.state)) return;
    const p = live[(this.rng() * live.length) | 0];
    const room = M.roomAt(p.x, p.z);
    let opts = ['flicker', 'knock', 'whisper', 'slam', 'bell', 'steps'].filter((o) => o !== this.lastScare);
    const o = opts[(this.rng() * opts.length) | 0];
    this.lastScare = o;
    const ang = this.rng() * Math.PI * 2, r = 5 + this.rng() * 5;
    if (o === 'slam') {
      const ds = M.DOORS.filter((d) => !d.arch && this.doors[d.id].open && !this.doors[d.id].locked).map((d) => ({ d, c: M.doorPos(d) }))
        .filter(({ c }) => live.every((q) => d2(q, c.x, c.z) > 4) && d2(p, c.x, c.z) < 18);
      if (ds.length) { const { d } = ds[(this.rng() * ds.length) | 0]; this.doors[d.id].open = false; const c = M.doorPos(d); this.ev({ k: 'door', id: d.id, open: false, x: c.x, z: c.z, slam: true }); this.sync(); return; }
    }
    this.ev({ k: 'scare', kind: o === 'slam' ? 'knock' : o, room: room ? room.id : null, x: p.x + Math.sin(ang) * r, z: p.z + Math.cos(ang) * r, pid: p.id });
  }

  // ---------------------------------------------------------------- messages
  onMessage(p, m) {
    if (m.t === 'ping') return this.send(p, { t: 'pong', n: m.n });
    if (this.phase === 'lobby') {
      if (m.t === 'diff' && p.id === this.hostId && DIFF[m.diff]) { this.diff = m.diff; this.sendLobby(); }
      else if (m.t === 'name') { p.name = String(m.name || '').slice(0, 16).trim() || p.name; this.sendLobby(); }
      else if (m.t === 'start' && p.id === this.hostId) this.startRound(m.seed);
      return;
    }
    if (this.phase === 'ended') { if (m.t === 'lobby' && p.id === this.hostId) { this.phase = 'lobby'; this.sendLobby(); } return; }
    if (m.t === 'debug' && this.debug) return this.onDebug(p, m);
    if (!p.alive || p.escaped || p.captured) return;
    const g = this.ghost;
    switch (m.t) {
      case 'pos':
        if (!p.hidden) { if (isFinite(m.x) && isFinite(m.z)) { p.x = m.x; p.z = m.z; } p.mode = m.m; p.pt = Date.now(); }
        p.ry = +m.ry || 0; p.rx = +m.rx || 0; p.flash = !!m.f;
        break;
      case 'breath': p.holdBreath = !!m.h && !!p.hidden && p.gasp <= 0 && p.breath > 0.2; break;
      case 'noise': if (!p.hidden && this.elapsed - p.workT > 0.6) { p.workT = this.elapsed; this.noise(p.x, p.z, LOUD.work, p); } break;
      case 'drop': if (!p.hidden) this.dropItem(p); break;
      case 'throw': {
        const it = this.items.find((i) => i.h === p.id);
        if (!it || it.k !== 'bottle' || p.hidden) break;
        const dx = Math.sin(p.ry), dz = Math.cos(p.ry), want = Math.max(3, Math.min(15, 9 + (+m.pitch || 0) * 9));
        let range = want;
        for (let d = 0.5; d <= want; d += 0.25) if (!M.lineOfSight(p.x, p.z, p.x + dx * d, p.z + dz * d, this.doors)) { range = d - 0.3; break; }
        const tx = p.x + dx * range, tz = p.z + dz * range, fly = 0.25 + range / 13;
        this.items.splice(this.items.indexOf(it), 1); p.item = null;
        this.ev({ k: 'throw', pid: p.id, x: p.x, z: p.z, tx, tz, fly });
        this.sync();
        setTimeout(() => { if (this.phase === 'playing') { this.noise(tx, tz, LOUD.shatter); this.ev({ k: 'shatter', x: tx, z: tz }); } }, fly * 1000);
        break;
      }
      case 'unhide': if (p.hidden) { const h = M.hideById(p.hidden); p.hidden = null; p.holdBreath = false; p.x = h.ex; p.z = h.ez; this.noise(p.x, p.z, LOUD.hide, p); this.ev({ k: 'unhide', pid: p.id, spot: h.id, x: h.ex, z: h.ez }); } break;
      case 'rescue': {
        const v = this.players.get(m.pid);
        if (v && v.captured && g.victim === v.id && g.state === 'drag' && !p.hidden && d2(p, v.x, v.z) < 3.4) {
          v.captured = false; v.rescuedUsed = true; g.rescued();
          this.ev({ k: 'rescued', pid: v.id, by: p.id, name: v.name, byName: p.name, x: v.x, z: v.z });
        }
        break;
      }
      case 'use': if (!p.hidden) this.use(p, m); break;
    }
  }

  use(p, m) {
    const held = this.items.find((i) => i.h === p.id);
    if (m.kind === 'door') {
      const def = M.doorById(m.id), d = this.doors[m.id];
      if (!def || def.arch) return;
      const c = M.doorPos(def);
      if (d2(p, c.x, c.z) > REACH + 0.6) return;
      if (d.locked) {
        if (def.lock === 'key' && held && held.k === 'key') {
          d.locked = false; this.nav.setLocked(m.id, false);
          this.items.splice(this.items.indexOf(held), 1); p.item = null;
          this.ev({ k: 'unlock', id: m.id, x: c.x, z: c.z });
          this.finish('key', p);
          this.setDoor(m.id, true, p.id);
          this.noise(c.x, c.z, LOUD.door, p);
        } else this.send(p, { t: 'ev', k: 'locked', id: m.id, x: c.x, z: c.z, why: def.lock });
        return;
      }
      this.setDoor(m.id, !d.open, p.id);
      this.noise(c.x, c.z, LOUD.door, p);
    } else if (m.kind === 'item') {
      const it = this.items.find((i) => i.id === m.id);
      if (!it || it.h || d2(p, it.x, it.z) > REACH + 0.6) return;
      if (held) this.dropItem(p, false);
      it.h = p.id; p.item = it.id;
      this.noise(p.x, p.z, LOUD.pickup, p);
      this.ev({ k: 'pickup', pid: p.id, item: it.k });
      if (it.k === 'fuse') this.finish('fuse', p);
      if (it.k === 'doll') this.clue('doll', p);
      this.sync();
    } else if (m.kind === 'hide') {
      const h = M.hideById(m.id);
      if (!h || this.jammed.has(h.id) || d2(p, h.ex, h.ez) > REACH + 0.5) return;
      if ([...this.players.values()].some((q) => q.hidden === h.id)) return this.toast('Someone is already hiding there.', p);
      this.ghost.onHide(p, h.id);
      p.hidden = h.id; p.x = h.x; p.z = h.z; p.mode = 'still';
      this.noise(h.x, h.z, LOUD.hide, p);
      this.ev({ k: 'hide', pid: p.id, spot: h.id, x: h.x, z: h.z });
    } else if (m.kind === 'station') {
      const s = M.stationById(m.id);
      if (!s || d2(p, s.x, s.z) > REACH + 0.7) return;
      if (s.k === 'clue') return this.clue(s.id, p);
      if (s.k === 'call') {
        if (!this.callOn) return this.clue('call', p);
        this.callOn = false; this.noise(s.x, s.z, LOUD.call, p);
        this.ev({ k: 'callOff', x: s.x, z: s.z });
        this.clue('call', p); this.finish('call', p);
        if (this.doors.room3.open) setTimeout(() => { if (this.phase === 'playing' && this.doors.room3.open) { this.doors.room3.open = false; this.ev({ k: 'door', id: 'room3', open: false, x: 17.5, z: 10, slam: true }); this.sync(); } }, 1800);
      } else if (s.k === 'breaker') {
        if (this.power) return this.toast('The breaker is already on.', p);
        if (!this.fuseFitted) {
          if (!held || held.k !== 'fuse') return this.toast('The breaker has no fuse. There should be a spare in the boiler room.', p);
          this.items.splice(this.items.indexOf(held), 1); p.item = null; this.fuseFitted = true;
        }
        this.noise(s.x, s.z, LOUD.breaker, p);
        this.setPower(true);
        this.finish('power', p);
      } else if (s.k === 'medcab') {
        if (!held || held.k !== 'meds') return this.toast('The medicine case belongs in here. It was left somewhere on the floor.', p);
        this.items.splice(this.items.indexOf(held), 1); p.item = null;
        this.noise(s.x, s.z, LOUD.door, p);
        this.finish('meds', p);
      } else if (s.k === 'slot') {
        if (!held || held.k !== 'chart') return;
        if (s.n !== this.chartBed) return this.toast(`Wrong bed. The chart says Bed ${this.chartBed}.`, p);
        this.items.splice(this.items.indexOf(held), 1); p.item = null;
        this.finish('chart', p);
      } else if (s.k === 'drawer') {
        if (this.mystery) return;
        if (!held || held.k !== 'doll') return this.send(p, { t: 'ev', k: 'note', id: s.id, title: `Morgue drawer ${s.n}`, body: `${this.drawers[s.n - 1].toUpperCase()}\n${this.tried.has(s.n) ? 'The drawer is empty.' : 'Unclaimed.'}` });
        if (this.tried.has(s.n)) return this.toast('Not this one.', p);
        if (s.n === this.correctDrawer) {
          this.items.splice(this.items.indexOf(held), 1); p.item = null;
          this.mystery = true;
          this.ghost.enraged = true;
          if (!['grab', 'drag', 'take', 'chase', 'notice'].includes(this.ghost.state)) this.ghost.relocate();
          this.ev({ k: 'mystery', by: p.name, name: `${this.ghostName.first} ${this.ghostName.last}` });
          this.updateExit();
        } else {
          this.tried.add(s.n);
          this.noise(s.x, s.z, LOUD.wrong); // she always hears this
          this.ev({ k: 'wrong', x: s.x, z: s.z, n: s.n });
          this.sync();
        }
      }
    }
  }

  onDebug(p, m) {
    const g = this.ghost;
    if (m.cmd === 'freeze') g.frozen = !!m.on;
    else if (m.cmd === 'deaf') g.deaf = !!m.on;
    else if (m.cmd === 'holdgrab') g.holdGrab = !!m.on;
    else if (m.cmd === 'ghost') { g.x = m.x; g.z = m.z; if (m.ry !== undefined) g.ry = m.ry; g.path = []; g.vis = 1; g.set(m.state || 'idle', { idleFor: m.idleFor ?? 999, ...(m.data || {}) }); }
    else if (m.cmd === 'tp') { p.x = m.x; p.z = m.z; this.send(p, { t: 'ev', k: 'tp', x: m.x, z: m.z }); }
    else if (m.cmd === 'time') this.timeLeft = m.v;
    else if (m.cmd === 'power') this.setPower(true);
    else if (m.cmd === 'state') this.send(p, { t: 'debug', ghost: { state: g.state, x: g.x, z: g.z, target: g.target, victim: g.victim, spot: g.spot, queue: g.queue, trips: g.trips },
      correctDrawer: this.correctDrawer, chartBed: this.chartBed, quota: this.quota, timeLeft: this.timeLeft, jammed: [...this.jammed] });
    else if (m.cmd === 'scare') { this.scareT = 0; }
  }
}
