// Grid navigation for the ghost (and for the test bots). 0.5 m cells, A* with line-of-walk smoothing.
import { SOLID, ROOMS, DOORS, doorBox } from '../shared/map.js';

const CS = 0.5, W = 80, HH = 70;
const idx = (cx, cz) => cz * W + cx;

export class Nav {
  constructor() {
    this.base = new Uint8Array(W * HH);
    this.block = new Uint8Array(W * HH);
    for (let cz = 0; cz < HH; cz++) for (let cx = 0; cx < W; cx++) {
      const x = (cx + 0.5) * CS, z = (cz + 0.5) * CS;
      let free = ROOMS.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
      if (free) for (const b of SOLID) {
        const m = b.h === undefined ? 0.28 : 0.2;
        if (x > b.x0 - m && x < b.x1 + m && z > b.z0 - m && z < b.z1 + m) { free = false; break; }
      }
      this.base[idx(cx, cz)] = free ? 0 : 1;
    }
    this.block.set(this.base);
    this.doorCells = {};
    for (const d of DOORS) {
      const b = doorBox(d, 0.45), cells = [];
      for (let cz = 0; cz < HH; cz++) for (let cx = 0; cx < W; cx++) {
        const x = (cx + 0.5) * CS, z = (cz + 0.5) * CS;
        if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) cells.push(idx(cx, cz));
      }
      this.doorCells[d.id] = cells;
    }
  }
  setLocked(id, locked) { for (const c of this.doorCells[id]) this.block[c] = locked ? 1 : this.base[c]; }
  free(x, z) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    return cx >= 0 && cz >= 0 && cx < W && cz < HH && !this.block[idx(cx, cz)];
  }
  nearestFree(x, z) {
    if (this.free(x, z)) return { x, z };
    for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      if (this.free(x + dx * CS, z + dz * CS)) return { x: (Math.floor(x / CS) + dx + 0.5) * CS, z: (Math.floor(z / CS) + dz + 0.5) * CS };
    }
    return null;
  }
  walkable(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; if (!this.free(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // Returns [{x,z}...] ending at the goal, or null when unreachable.
  path(ax, az, bx, bz) {
    const s = this.nearestFree(ax, az), g = this.nearestFree(bx, bz);
    if (!s || !g) return null;
    const sc = idx(Math.floor(s.x / CS), Math.floor(s.z / CS)), gc = idx(Math.floor(g.x / CS), Math.floor(g.z / CS));
    const N = W * HH, gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const gx = gc % W, gz = (gc / W) | 0;
    const heap = [[0, sc]];
    gS[sc] = 0;
    const push = (f, c) => { heap.push([f, c]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    let found = false;
    while (heap.length) {
      const [, c] = pop();
      if (closed[c]) continue;
      closed[c] = 1;
      if (c === gc) { found = true; break; }
      const cx = c % W, cz = (c / W) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= HH) continue;
        const n = idx(nx, nz);
        if (this.block[n] || closed[n]) continue;
        if (dx && dz && (this.block[idx(cx + dx, cz)] || this.block[idx(cx, cz + dz)])) continue;
        const ng = gS[c] + (dx && dz ? 1.4142 : 1);
        if (ng < gS[n]) { gS[n] = ng; from[n] = c; push(ng + Math.hypot(nx - gx, nz - gz), n); }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let c = gc; c !== -1; c = from[c]) raw.push({ x: ((c % W) + 0.5) * CS, z: (((c / W) | 0) + 0.5) * CS });
    raw.reverse();
    raw[0] = { x: s.x, z: s.z };
    if (this.free(bx, bz)) raw.push({ x: bx, z: bz });
    const out = [];
    let i = 0;
    while (i < raw.length - 1) {
      let j = raw.length - 1;
      while (j > i + 1 && !this.walkable(raw[i].x, raw[i].z, raw[j].x, raw[j].z)) j--;
      out.push(raw[j]);
      i = j;
    }
    return out;
  }
  pathLen(ax, az, bx, bz) {
    const p = this.path(ax, az, bx, bz);
    if (!p) return Infinity;
    let l = 0, px = ax, pz = az;
    for (const q of p) { l += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    return l;
  }
}
