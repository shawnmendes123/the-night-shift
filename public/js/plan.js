// The floor plan: a fire-evacuation style map of the hospital, drawn live on a canvas.
// Shows you, your teammates, where each unfinished job is, and the walking route to the one you are tracking.
import * as M from '/shared/map.js';
import { Nav } from '/shared/nav.js';

const X0 = -1.2, X1 = 41.2, Z0 = -1.6, Z1 = 35.2; // world bounds drawn (metres)
const INK = '#1c1d1a', SOFT = '#55574f', PAPER = '#dcd7c6', ROOM = '#e8e3d2', BASE = '#c9c4b1', RED = '#b3261e', GREEN = '#2f6b45';

export class FloorPlan {
  constructor(canvas) {
    this.cv = canvas; this.g = canvas.getContext('2d'); this.nav = new Nav(); this.lockSig = ''; this.hits = [];
  }
  // Locked doors block routes; a route through one is still drawn (dashed) with a note.
  setDoors(doors) {
    const sig = Object.entries(doors).filter(([, d]) => d.locked).map(([k]) => k).join(',');
    if (sig === this.lockSig) return; this.lockSig = sig;
    for (const d of M.DOORS) this.nav.setLocked(d.id, !!(doors[d.id] && doors[d.id].locked));
  }
  route(ax, az, bx, bz) {
    let p = this.nav.path(ax, az, bx, bz), blocked = false;
    if (!p) { // try again as if every door were unlocked
      const locked = M.DOORS.filter((d) => this.lockSig.split(',').includes(d.id));
      for (const d of locked) this.nav.setLocked(d.id, false);
      p = this.nav.path(ax, az, bx, bz); blocked = !!p;
      for (const d of locked) this.nav.setLocked(d.id, true);
    }
    if (!p) return null;
    let len = 0, px = ax, pz = az; for (const q of p) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    return { pts: p, len, blocked };
  }

  // st: { me:{x,z,ry}|null, mates:[{name,x,z,caught}], goals:[{id,n,label,x,z,urgent}], track, route, doors, exitOpen, power, t }
  draw(st) {
    const cv = this.cv, g = this.g, dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = Math.min(W / (X1 - X0), H / (Z1 - Z0)), ox = (W - (X1 - X0) * k) / 2, oy = (H - (Z1 - Z0) * k) / 2;
    const sx = (x) => ox + (x - X0) * k, sy = (z) => oy + (z - Z0) * k;
    this.view = { sx, sy, k };
    g.clearRect(0, 0, W, H); g.fillStyle = PAPER; g.fillRect(0, 0, W, H);

    // rooms
    for (const r of M.ROOMS) {
      const b = r.lvl === 'b';
      g.fillStyle = r.id === 'outside' ? PAPER : b ? BASE : ROOM;
      g.fillRect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
      if (b) { // basement: hatched
        g.save(); g.beginPath(); g.rect(sx(r.x0), sy(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k); g.clip();
        g.strokeStyle = 'rgba(60,60,50,.13)'; g.lineWidth = 1;
        for (let d = -40; d < 80; d += 0.9) { g.beginPath(); g.moveTo(sx(r.x0 + d), sy(r.z0)); g.lineTo(sx(r.x0 + d + 14), sy(r.z0 + 14)); g.stroke(); }
        g.restore();
      }
    }
    // stairs treads
    const sr = M.roomById('stairs'); g.strokeStyle = 'rgba(28,29,26,.35)'; g.lineWidth = 1;
    for (let z = 15.3; z < 21.6; z += 0.55) { g.beginPath(); g.moveTo(sx(36.4), sy(z)); g.lineTo(sx(39.6), sy(z)); g.stroke(); }
    g.fillStyle = SOFT; g.font = `600 ${Math.max(9, k * 0.42)}px "Courier New", monospace`; g.textAlign = 'center';
    g.save(); g.translate(sx(38), sy(18.4)); g.rotate(Math.PI / 2); g.fillText('DOWN ▸', 0, 0); g.restore();
    // car park dashed outline
    g.setLineDash([4, 4]); g.strokeStyle = SOFT; g.strokeRect(sx(1), sy(22), 6 * k, 4 * k); g.setLineDash([]);

    // props as faint blocks
    g.fillStyle = 'rgba(28,29,26,.12)';
    for (const b of M.PROP_BOXES) g.fillRect(sx(b.x0), sy(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    // walls
    g.fillStyle = INK;
    for (const w of M.WALLS) g.fillRect(sx(w.x0), sy(w.z0), Math.max(2, (w.x1 - w.x0) * k), Math.max(2, (w.z1 - w.z0) * k));
    // doors: locked = red bar, closed = thin line, open = gap
    for (const d of M.DOORS) {
      const s = st.doors[d.id] || {}, b = M.doorBox(d, 0.12);
      if (d.id === 'exit') { g.fillStyle = st.exitOpen ? GREEN : RED; g.fillRect(sx(b.x0), sy(b.z0) - 1, (b.x1 - b.x0) * k, (b.z1 - b.z0) * k + 2); continue; }
      if (s.locked) { g.fillStyle = RED; g.fillRect(sx(b.x0), sy(b.z0) - 1, Math.max(3, (b.x1 - b.x0) * k), Math.max(3, (b.z1 - b.z0) * k)); }
      else if (!s.open && !d.arch) { g.strokeStyle = SOFT; g.lineWidth = 1.5; g.beginPath(); const c = M.doorPos(d); if (d.a === 'h') { g.moveTo(sx(b.x0), sy(c.z)); g.lineTo(sx(b.x1), sy(c.z)); } else { g.moveTo(sx(c.x), sy(b.z0)); g.lineTo(sx(c.x), sy(b.z1)); } g.stroke(); }
    }
    // room names
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const r of M.ROOMS) {
      if (r.id === 'stairs') continue;
      const cx = (r.x0 + r.x1) / 2, cz = r.id === 'corridor' ? 11.5 : r.id === 'outside' ? 24 : r.z0 + (r.z1 - r.z0) * (r.lvl === 'b' ? 0.5 : 0.5);
      g.fillStyle = r.lvl === 'b' ? '#3f4038' : SOFT; g.font = `700 ${Math.max(9, Math.min(13, k * 0.48))}px "Courier New", monospace`;
      const name = r.name.toUpperCase(); const maxW = (r.x1 - r.x0) * k - 6;
      if (g.measureText(name).width > maxW && name.includes(' ')) { const [a, ...b2] = name.split(' '); g.fillText(a, sx(cx), sy(cz) - 7); g.fillText(b2.join(' '), sx(cx), sy(cz) + 7); }
      else g.fillText(name, sx(cx), sy(cz));
    }
    g.fillStyle = '#3f4038'; g.font = `700 ${Math.max(10, k * 0.5)}px "Courier New", monospace`; g.textAlign = 'left';
    g.fillText('BASEMENT  (-1)', sx(16.3), sy(33.4));
    g.fillText('GROUND FLOOR', sx(0.2), sy(-0.85));
    if (!st.power) { g.fillStyle = RED; g.textAlign = 'right'; g.fillText('MAINS POWER: OFF', sx(40.8), sy(-0.85)); }

    // route to the tracked job
    if (st.route && st.me) {
      g.strokeStyle = RED; g.lineWidth = 3; g.lineJoin = 'round'; g.setLineDash(st.route.blocked ? [3, 6] : [10, 6]); g.lineDashOffset = -st.t * 18;
      g.beginPath(); g.moveTo(sx(st.me.x), sy(st.me.z)); for (const p of st.route.pts) g.lineTo(sx(p.x), sy(p.z)); g.stroke(); g.setLineDash([]);
    }
    // jobs
    this.hits = [];
    const R = Math.max(9, k * 0.42);
    for (const q of st.goals) {
      const x = sx(q.x), y = sy(q.z), on = st.track === q.id;
      if (on) { g.strokeStyle = RED; g.lineWidth = 2; g.beginPath(); g.arc(x, y, R + 5 + Math.sin(st.t * 5) * 2, 0, 7); g.stroke(); }
      g.fillStyle = q.urgent ? RED : on ? RED : INK; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
      g.fillStyle = PAPER; g.font = `700 ${R * 1.15}px "Courier New", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(q.n, x, y + 1);
      this.hits.push({ id: q.id, x, y, r: R + 6 });
    }
    // teammates
    for (const p of st.mates) {
      const x = sx(p.x), y = sy(p.z);
      g.fillStyle = p.caught ? RED : '#2b5a7a'; g.beginPath(); g.arc(x, y, p.caught ? 7 + Math.sin(st.t * 9) * 2 : 6, 0, 7); g.fill();
      g.strokeStyle = PAPER; g.lineWidth = 2; g.stroke();
      g.fillStyle = p.caught ? RED : '#1f425a'; g.font = `700 11px "Courier New", monospace`; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(p.caught ? `${p.name} - TAKEN` : p.name, x, y - 9);
    }
    // you are here
    if (st.me) {
      const x = sx(st.me.x), y = sy(st.me.z), a = Math.atan2(Math.cos(st.me.ry), Math.sin(st.me.ry)); // screen angle of facing
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = RED; g.strokeStyle = PAPER; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 0); g.lineTo(-7, 7); g.lineTo(-3, 0); g.lineTo(-7, -7); g.closePath(); g.fill(); g.stroke();
      g.restore();
      g.fillStyle = RED; g.font = `700 11px "Courier New", monospace`; g.textAlign = 'left'; g.textBaseline = 'middle';
      const lx = x + 14 > W - 110 ? x - 112 : x + 14; g.fillText('YOU ARE HERE', lx, y + (y < 30 ? 14 : -14));
    }
  }
  hitTest(px, py) { let best = null, bd = 1e9; for (const h of this.hits) { const d = Math.hypot(px - h.x, py - h.y); if (d < h.r && d < bd) { bd = d; best = h.id; } } return best; }
}
