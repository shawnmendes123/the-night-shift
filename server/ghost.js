// The ghost. Authored rules, chosen situationally. She only ever learns where a player is by
// SEEING them (range, view cone, line of sight) or HEARING a noise. Player positions are otherwise
// used only for fairness checks (never materialise on top of / in view of someone).
import { HIDES, hideById, VOIDS, WAYPOINTS, CHOKES, lineOfSight, floorY, DOORS, doorPos, BREAKER_STAND, roomAt } from '../shared/map.js';
import { GHOSTS } from '../shared/ghosts.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const TASK_ROOM = { key: 'records', fuse: 'boiler', power: 'storage', chart: 'ward', meds: 'treatment', call: 'room3' };

export class Ghost {
  constructor(room, kind = 'mother', i = 0, arrive) {
    this.r = room; this.cfg = room.cfg; this.rng = room.rng;
    this.kind = kind; this.K = GHOSTS[kind]; this.i = i; this.arrive = arrive ?? this.cfg.grace; this.rest = false;
    this.paT = this.K.pa ? this.rand(...this.K.pa) * 0.6 : 0; this.lureT = this.K.lure ? this.rand(...this.K.lure) * 0.7 : 0; this.counted = 0;
    this.x = 37; this.z = 5; this.ry = 0;
    this.vis = 0; this.state = 'dormant'; this.st = 0;
    this.path = []; this.stim = []; this.target = null; this.lastKnown = null;
    this.victim = null; this.queue = []; this.spot = null; this.knownSpot = null;
    this.specialT = this.rand(...this.cfg.special); this.trips = this.cfg.trips + (this.K.trips || 0);
    this.stalkCd = 0; this.enraged = false; this.frozen = false; this.deaf = false; this.visited = {};
    this.then = null;
  }
  rand(a, b) { return a + this.rng() * (b - a); }
  // every event says which ghost it came from and where she is, so each client can voice and place it
  ev(e) { this.r.ev({ ...e, gi: this.i, gk: this.kind, gx: +this.x.toFixed(2), gz: +this.z.toFixed(2) }); }
  get walkSpeed() { return this.cfg.walk * this.K.walk * (this.enraged ? 1.12 : 1); }
  get chaseSpeed() { return this.K.chaseAbs ?? this.cfg.chase * this.K.chase * (this.enraged ? 1.06 : 1); }
  set(state, data) { this.state = state; this.st = 0; if (data) Object.assign(this, data); }
  goTo(x, z) { this.path = this.r.nav.path(this.x, this.z, x, z) || []; return this.path.length > 0; }
  basementOpen() { return !this.r.doors.stairs.locked; }
  face(x, z) { if (Math.hypot(x - this.x, z - this.z) > 0.05) this.ry = Math.atan2(x - this.x, z - this.z); }

  // Moves along the current path. Returns true on arrival.
  follow(dt, speed) {
    let left = speed * dt;
    while (this.path.length && left > 0) {
      const p = this.path[0], d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d <= left) { this.x = p.x; this.z = p.z; left -= d; this.path.shift(); }
      else { this.face(p.x, p.z); this.x += ((p.x - this.x) / d) * left; this.z += ((p.z - this.z) / d) * left; left = 0; }
    }
    for (const d of DOORS) { // she opens doors in her way - players hear it
      const s = this.r.doors[d.id];
      if (d.arch || s.open || s.locked) continue;
      const c = doorPos(d);
      if (Math.hypot(c.x - this.x, c.z - this.z) < 0.95) this.r.setDoor(d.id, true, 'ghost');
    }
    return this.path.length === 0;
  }

  canSee(p) {
    if (!p.alive || p.captured || p.escaped || p.hidden) return false;
    const dx = p.x - this.x, dz = p.z - this.z, d = Math.hypot(dx, dz);
    if (this.K.touch) return d < this.K.touch && lineOfSight(this.x, this.z, p.x, p.z, this.r.doors); // blind: only what she walks into
    let range = this.cfg.sight * this.K.sight;
    if (p.mode === 'crouch') range *= 0.65;
    if (this.K.torch) range *= p.flash ? this.K.torch * (this.r.power ? 1 : 1.25) : this.K.dark; // matron: torchlight
    else if (!p.flash && p.mode !== 'run') range *= 0.75;
    if (d > range) return false;
    if (Math.abs(floorY(p.x, p.z) - floorY(this.x, this.z)) > 1.6 && d > 5) return false;
    if (d > 2.2) {
      let a = Math.atan2(dx, dz) - this.ry;
      while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI;
      if (Math.abs(a) > 1.05) return false; // 120 degree view cone
    }
    return lineOfSight(this.x, this.z, p.x, p.z, this.r.doors);
  }

  hearBest() {
    let best = null;
    for (const s of this.stim) {
      const d = Math.hypot(s.x - this.x, s.z - this.z);
      const eff = s.loud * this.cfg.hear * this.K.hear * (lineOfSight(this.x, this.z, s.x, s.z, this.r.doors) ? 1 : 0.7);
      if (d > eff) continue;
      const sal = (eff / (d + 2)) * this.rand(0.8, 1.2);
      if (!best || sal > best.sal) best = { x: s.x, z: s.z, sal };
    }
    this.stim.length = 0;
    return this.deaf ? null : best;
  }

  // Called by the room when a player enters a hiding spot.
  onHide(p, spotId) {
    const chasingThem = this.state === 'chase' && this.target === p.id && this.loseT < 0.6;
    if (chasingThem || (['patrol', 'idle', 'investigate', 'stalk', 'notice', 'block', 'look', 'toSpot', 'listen'].includes(this.state) && this.canSeeIgnoringHide(p))) {
      this.knownSpot = spotId;
      if (this.state !== 'chase') { this.target = p.id; this.set('chase', { loseT: 1, repathT: 0 }); this.lastKnown = { x: p.x, z: p.z }; }
    }
  }
  canSeeIgnoringHide(p) { const h = p.hidden; p.hidden = null; const v = this.canSee(p); p.hidden = h; return v; }

  awayFromPlayers(x, z, min) {
    for (const p of this.r.players.values()) {
      if (!p.alive || p.escaped) continue;
      if (Math.hypot(p.x - x, p.z - z) < min) return false;
      if (Math.hypot(p.x - x, p.z - z) < 22 && lineOfSight(p.x, p.z, x, z, this.r.doors)) return false;
    }
    return true;
  }
  pickFarPoint(min = 12) {
    const pts = WAYPOINTS.filter((w) => (!w.b || this.basementOpen()) && w.room !== 'entrance');
    for (let m = min; m >= 0; m -= 4) {
      const ok = pts.filter((w) => this.awayFromPlayers(w.x, w.z, m));
      if (ok.length) return ok[(this.rng() * ok.length) | 0];
    }
    return pts[(this.rng() * pts.length) | 0];
  }
  respawn() { const w = this.pickFarPoint(14); this.x = w.x; this.z = w.z; this.path = []; this.set('appear', { then: 'idle' }); this.ev({ k: 'appear' }); }
  relocate() { this.set('vanish', { vanishTo: this.pickFarPoint(10) }); this.ev({ k: 'vanish' }); }

  pickPatrol() {
    const active = new Set(this.r.tasks.filter((t) => !t.done).map((t) => TASK_ROOM[t.id]));
    if (!this.r.mystery && this.basementOpen()) active.add('morgue');
    if (this.enraged) { active.add('corridor'); active.add('entrance'); active.add('station'); }
    let pts = WAYPOINTS.filter((w) => (!w.b || this.basementOpen()) && Math.hypot(w.x - this.x, w.z - this.z) > 3);
    let tot = 0;
    const ws = pts.map((w) => { const age = this.r.elapsed - (this.visited[w.room] ?? -60); const v = (active.has(w.room) ? 3 : 1) * Math.min(1, age / 60 + 0.1); tot += v; return v; });
    let pick = this.rng() * tot, w = pts[0];
    for (let i = 0; i < pts.length; i++) { pick -= ws[i]; if (pick <= 0) { w = pts[i]; break; } }
    this.visited[w.room] = this.r.elapsed;
    if (!this.goTo(w.x, w.z)) { this.set('idle', { idleFor: 1 }); return; }
    this.set('patrol', { then: null });
  }

  special() {
    this.specialT = this.rand(...this.cfg.special);
    const opts = ['block', 'relocate'];
    if (this.r.power && this.trips > 0) for (let k = 0; k < 2 * (this.K.tripBias || 1); k++) opts.push('trip');
    const o = opts[(this.rng() * opts.length) | 0];
    if (o === 'relocate') return this.relocate();
    if (o === 'trip') { if (this.goTo(BREAKER_STAND.x, BREAKER_STAND.z)) return this.set('patrol', { then: 'trip' }); return; }
    const cs = CHOKES.filter((c) => !c.b || this.basementOpen());
    const c = cs[(this.rng() * cs.length) | 0];
    if (this.goTo(c.x, c.z)) this.set('patrol', { then: 'block' });
  }

  onSight(p, allowStalk = true) {
    const d = dist(this, p);
    this.target = p.id; this.lastKnown = { x: p.x, z: p.z }; this.face(p.x, p.z);
    if (allowStalk && d > 7.5 && this.stalkCd <= 0 && this.rng() < this.cfg.stalk * this.K.stalk) {
      this.stalkCd = this.rand(30, 60);
      this.set('stalk', { stalkFor: this.rand(2.5, 5), unseenT: 0 });
      this.ev({ k: 'stalk' });
    } else this.notice(p);
  }
  notice(p) { this.target = p.id; this.face(p.x, p.z); this.path = []; this.set('notice'); this.ev({ k: 'notice', pid: p.id }); }
  investigate(s) { if (this.goTo(s.x, s.z)) { this.set('investigate', { suspect: { x: s.x, z: s.z }, sal: s.sal, rushing: !!this.K.rush }); this.ev({ k: this.K.rush ? 'rush' : 'alert' }); } }

  beginSearch(pt) {
    const y = floorY(pt.x, pt.z);
    this.counted = 0;
    if (this.K.searchAll) {
      const rm = roomAt(pt.x, pt.z), id = rm && rm.id;
      this.queue = HIDES.filter((h) => !this.r.jammed.has(h.id) && (id ? h.room === id : Math.hypot(h.x - pt.x, h.z - pt.z) < 8) && Math.abs(floorY(h.ex, h.ez) - y) < 1.5)
        .sort((a, b) => Math.hypot(a.x - pt.x, a.z - pt.z) - Math.hypot(b.x - pt.x, b.z - pt.z)).map((h) => h.id);
      this.path = []; this.set('look', { lookFor: this.rand(1.2, 2) }); return;
    }
    this.queue = HIDES.filter((h) => !this.r.jammed.has(h.id) && Math.hypot(h.x - pt.x, h.z - pt.z) < 8 && Math.abs(floorY(h.ex, h.ez) - y) < 1.5)
      .map((h) => ({ h, d: Math.hypot(h.x - pt.x, h.z - pt.z) + this.rng() * 3 })).sort((a, b) => a.d - b.d).slice(0, this.cfg.searchSpots).map((o) => o.h.id);
    this.path = [];
    this.set('look', { lookFor: this.rand(1.5, 2.6) });
  }
  nextSearch() {
    while (this.queue.length) {
      const h = hideById(this.queue.shift());
      if (this.goTo(h.ex, h.ez)) { this.set('toSpot', { spot: h.id, certain: false }); this.ev({ k: 'search', spot: h.id }); if (this.K.searchAll) this.ev({ k: 'count', n: ++this.counted, spot: h.id }); return; }
    }
    this.pickPatrol();
  }

  // Mimic: pick a nurse, call them in a teammate's voice from a room they cannot see into, then go and wait there.
  lure() {
    const live = [...this.r.players.values()].filter((p) => p.alive && !p.captured && !p.escaped && !p.hidden);
    if (!live.length) return false;
    const p = live[(this.rng() * live.length) | 0];
    const pts = WAYPOINTS.filter((w) => (!w.b || this.basementOpen()) && Math.hypot(w.x - p.x, w.z - p.z) > 6 && Math.hypot(w.x - p.x, w.z - p.z) < 17 && !lineOfSight(p.x, p.z, w.x, w.z, this.r.doors));
    if (!pts.length) return false;
    const w = pts[(this.rng() * pts.length) | 0];
    const mates = live.filter((q) => q.id !== p.id && Math.hypot(q.x - w.x, q.z - w.z) > 6);
    const as = mates.length ? mates[(this.rng() * mates.length) | 0] : null;
    if (!this.goTo(w.x, w.z)) return false;
    this.ev({ k: 'mimic', pid: p.id, as: as ? as.id : null, x: w.x, z: w.z, how: this.rng() < 0.75 ? 'voice' : 'steps' });
    this.set('patrol', { then: 'block' });
    return true;
  }
  layToRest() { this.victim = null; this.path = []; this.queue = []; this.set('rest'); this.vis = 0; this.ev({ k: 'rest' }); }

  grab(p) {
    this.victim = p.id; this.path = []; this.knownSpot = null; this.queue = [];
    this.face(p.x, p.z);
    this.r.capture(p);
    this.set('grab');
  }
  rescued() { this.victim = null; this.path = []; this.set('recoil'); }

  update(dt) {
    this.st += dt; this.stalkCd -= dt;
    const S = this.state, r = this.r, cfg = this.cfg;
    const wantVis = S === 'dormant' || S === 'gone' || S === 'vanish' || S === 'take' ? 0 : 1;
    this.vis += Math.max(-dt / 0.9, Math.min(dt / 0.9, wantVis - this.vis));
    if (this.frozen) { this.stim.length = 0; return; }
    if (S === 'rest') { this.stim.length = 0; return; } // laid to rest: gone for good
    if (S === 'dormant') { this.stim.length = 0; if (r.elapsed > this.arrive) this.respawn(); return; }
    if (S === 'gone') { this.stim.length = 0; if (this.st > this.goneFor) this.respawn(); return; }
    if (S === 'vanish') { this.stim.length = 0; if (this.st > 1.1) { this.x = this.vanishTo.x; this.z = this.vanishTo.z; this.path = []; this.set('appear', { then: 'idle' }); this.ev({ k: 'appear' }); } return; }
    if (S === 'appear') { if (this.st > 1.3) this.set('idle', { idleFor: this.rand(1.5, 4) }); this.stim.length = 0; return; }

    // --- capture sequence ---
    const v = this.victim && r.players.get(this.victim);
    if (S === 'grab' || S === 'drag' || S === 'take') {
      this.stim.length = 0;
      if (!v || !v.alive) { this.victim = null; this.set('gone', { goneFor: 8 }); return; }
      if (S === 'grab') {
        if (this.st > 1.3 && !this.holdGrab) {
          const rescuers = [...r.players.values()].some((p) => p.alive && !p.captured && !p.escaped && p.id !== v.id);
          const y = floorY(this.x, this.z);
          let best = null;
          for (const vd of VOIDS) { if ((vd.lvl === 'b') !== (y < -1.3)) continue; const l = r.nav.pathLen(this.x, this.z, vd.x, vd.z); if (!best || l < best.l) best = { vd, l }; }
          if (!best) best = { vd: VOIDS[0] };
          this.goTo(best.vd.x, best.vd.z);
          this.set('drag', { dragFor: rescuers && !v.rescuedUsed ? cfg.rescue : 1.2 });
          this.ev({ k: 'drag', pid: v.id, win: this.dragFor });
        }
      } else if (S === 'drag') {
        this.follow(dt, 1.5);
        if (this.st > this.dragFor) { this.set('take'); this.ev({ k: 'take', pid: v.id }); }
      } else {
        this.follow(dt, 4);
        if (this.st > 1.2) { this.victim = null; r.eliminate(v); this.set('gone', { goneFor: 8 + this.rand(...cfg.special) * 0.5 }); }
      }
      if (this.victim) { const k = this.state === 'grab' ? 0.7 : -0.9; v.x = this.x + Math.sin(this.ry) * k; v.z = this.z + Math.cos(this.ry) * k; } // held in front of her face, then dragged behind
      return;
    }
    if (S === 'recoil') { this.stim.length = 0; if (this.st > 1.1) { this.set('gone', { goneFor: this.rand(16, 26) }); this.ev({ k: 'vanish' }); } return; }

    // --- senses ---
    let nearest = null;
    for (const p of r.players.values()) if (this.canSee(p) && (!nearest || dist(this, p) < dist(this, nearest))) nearest = p;
    const heard = this.hearBest();
    const walk = this.walkSpeed, calm = ['idle', 'patrol', 'block', 'look'].includes(S);
    // blind: whatever she walks into, she takes
    if (this.K.touch && nearest) return this.grab(nearest);
    // matron: speaks over the intercom now and then
    if (this.K.pa && (this.paT -= dt) <= 0) { this.paT = this.rand(...this.K.pa); if (calm || S === 'investigate') this.ev({ k: 'pa' }); }
    // mimic: calls one nurse in a teammate's voice from somewhere else, then waits there
    if (this.K.lure && (this.lureT -= dt) <= 0 && calm && !nearest) { this.lureT = this.rand(...this.K.lure); if (this.lure()) return; }

    switch (S) {
      case 'idle':
        if (nearest) return this.onSight(nearest);
        if (heard) return this.investigate(heard);
        this.ry += Math.sin(this.st * 1.3) * dt * 0.9;
        if (this.st > (this.idleFor ?? 2.5)) this.pickPatrol();
        break;
      case 'patrol':
        if (nearest) return this.onSight(nearest);
        if (heard) return this.investigate(heard);
        if (!this.then) { this.specialT -= dt; if (this.specialT <= 0) return this.special(); }
        if (this.follow(dt, walk)) {
          if (this.then === 'block') this.set('block', { blockFor: this.rand(8, 15), then: null });
          else if (this.then === 'trip') this.set('trip', { then: null });
          else this.set('idle', { idleFor: this.rand(1.5, 4.5) });
        }
        break;
      case 'trip':
        if (nearest) return this.onSight(nearest, false);
        this.face(this.x + 1, this.z);
        if (this.st > 1.6) { if (r.power) { this.trips--; r.setPower(false, true); } this.set('idle', { idleFor: 2 }); }
        break;
      case 'block':
        if (nearest) return this.onSight(nearest);
        if (heard) return this.investigate(heard);
        this.ry += Math.sin(this.st * 0.6) * dt * 0.5;
        if (this.st > this.blockFor) this.pickPatrol();
        break;
      case 'stalk': {
        const t = r.players.get(this.target);
        const seen = t && this.canSee(t);
        if (seen) { this.face(t.x, t.z); this.lastKnown = { x: t.x, z: t.z }; this.unseenT = 0; if (dist(this, t) < 5.5) return this.notice(t); }
        else { this.unseenT += dt; if (this.unseenT > 1.5) return this.investigate({ ...this.lastKnown, sal: 1 }); }
        if (this.st > this.stalkFor) { if (this.rng() < 0.45) return this.relocate(); if (seen) return this.notice(t); return this.investigate({ ...this.lastKnown, sal: 1 }); }
        break;
      }
      case 'notice': {
        const t = r.players.get(this.target);
        if (t && this.canSee(t)) { this.face(t.x, t.z); this.lastKnown = { x: t.x, z: t.z }; }
        if (this.st > cfg.notice * this.K.notice) this.set('chase', { loseT: 0, repathT: 0 });
        break;
      }
      case 'chase': {
        let t = r.players.get(this.target), seen = t && this.canSee(t);
        if (this.K.relentless && t && t.alive && !t.captured && !t.escaped && !t.hidden) seen = true; // he always knows where you are until you hide
        if (this.K.relentless && this.st > 45) return this.relocate(); // and then, without warning, he is somewhere else
        if (this.K.rush && heard) { this.lastKnown = { x: heard.x, z: heard.z }; this.loseT = 0; this.repathT = Math.min(this.repathT, 0); }
        if (nearest && (!seen || dist(this, nearest) < dist(this, t) - 2)) { t = nearest; this.target = t.id; seen = true; }
        this.repathT -= dt;
        if (seen) {
          this.lastKnown = { x: t.x, z: t.z }; this.loseT = 0; this.knownSpot = null;
          if (dist(this, t) < 1.05) return this.grab(t);
          if (this.repathT <= 0) { this.goTo(t.x, t.z); this.repathT = 0.25; }
        } else {
          this.loseT += dt;
          if (this.knownSpot && t && t.hidden === this.knownSpot) {
            const h = hideById(this.knownSpot);
            if (this.goTo(h.ex, h.ez)) { this.set('toSpot', { spot: h.id, certain: true }); this.ev({ k: 'search', spot: h.id }); return; }
          }
          if (heard && heard.sal > 3 && this.rng() < 0.5) return this.investigate(heard);
          if (this.repathT <= 0 && this.lastKnown) { this.goTo(this.lastKnown.x, this.lastKnown.z); this.repathT = 0.6; }
          if (this.loseT > cfg.lose || (this.path.length === 0 && this.loseT > 0.8)) { this.ev({ k: 'lost' }); return this.beginSearch(this.lastKnown || this); }
        }
        this.follow(dt, this.chaseSpeed);
        break;
      }
      case 'investigate':
        if (nearest) return this.onSight(nearest, false);
        if (heard && heard.sal > this.sal * 1.2) return this.investigate(heard);
        if (this.follow(dt, this.rushing ? this.chaseSpeed : walk * 1.35)) this.beginSearch(this.suspect);
        break;
      case 'look':
        if (nearest) return this.onSight(nearest, false);
        if (heard) return this.investigate(heard);
        this.ry += Math.sin(this.st * 2.4) * dt * 1.6;
        if (this.st > this.lookFor) this.nextSearch();
        break;
      case 'toSpot':
        if (nearest) return this.onSight(nearest, false);
        if (this.follow(dt, this.certain ? this.chaseSpeed : walk * 1.2)) {
          const h = hideById(this.spot);
          this.face(h.x, h.z);
          this.set(this.certain ? 'open' : 'listen', { found: false });
          this.ev({ k: this.certain ? 'open' : 'listen', spot: this.spot });
        }
        break;
      case 'listen': {
        if (nearest) return this.onSight(nearest, false);
        const occ = [...r.players.values()].find((p) => p.alive && p.hidden === this.spot);
        if (occ && !occ.holdBreath && this.st > cfg.listen * 0.4) this.found = true; // she heard breathing
        if (occ && this.r.elapsed - (occ.lastTalk ?? -9) < 1) this.found = true; // she heard talking
        if (this.st > cfg.listen * (this.K.listen || 1)) {
          if (this.found) { this.set('open'); this.ev({ k: 'open', spot: this.spot }); }
          else { if (heard) return this.investigate(heard); this.nextSearch(); }
        }
        break;
      }
      case 'open':
        if (this.st > 0.9) {
          const occ = [...r.players.values()].find((p) => p.alive && !p.captured && p.hidden === this.spot);
          this.knownSpot = null;
          if (occ) return this.grab(occ);
          this.nextSearch();
        }
        break;
    }
  }

  anim() {
    switch (this.state) {
      case 'patrol': case 'toSpot': return 'walk';
      case 'investigate': return this.rushing ? 'run' : 'walk';
      case 'chase': return this.K.chaseAbs ? 'walk' : 'run';
      case 'stalk': case 'block': return 'stare';
      case 'notice': case 'recoil': return 'scream';
      case 'look': return 'look';
      case 'listen': return 'listen';
      case 'open': case 'trip': return 'reach';
      case 'grab': return 'grab';
      case 'drag': case 'take': return 'drag';
      default: return 'idle';
    }
  }
}
