// Builds the hospital from the shared map: static geometry, furniture, doors, items, lights.
import * as THREE from 'three';
import * as M from '/shared/map.js';
import { makeMaterials, textSign, scrawl } from './tex.js';

class Batch {
  constructor() { this.m = new Map(); }
  arr(mat) { let a = this.m.get(mat); if (!a) { a = { p: [], n: [], u: [], i: [] }; this.m.set(mat, a); } return a; }
  quad(mat, P, n, U) {
    const a = this.arr(mat), b = a.p.length / 3;
    for (let k = 0; k < 4; k++) { a.p.push(P[k][0], P[k][1], P[k][2]); a.n.push(n[0], n[1], n[2]); a.u.push(U[k][0], U[k][1]); }
    a.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  // faces: string of letters to draw from "xXzZyY" (lower = negative side). vb: v origin for side faces.
  box(mat, x0, y0, z0, x1, y1, z1, { faces = 'xXzZyY', vb = 0 } = {}) {
    const [su, sv] = mat.userData.uv || [1, 1], v0 = (y0 - vb) / sv, v1 = (y1 - vb) / sv;
    if (faces.includes('X')) this.quad(mat, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], [[-z1 / su, v0], [-z0 / su, v0], [-z0 / su, v1], [-z1 / su, v1]]);
    if (faces.includes('x')) this.quad(mat, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], [[z0 / su, v0], [z1 / su, v0], [z1 / su, v1], [z0 / su, v1]]);
    if (faces.includes('Z')) this.quad(mat, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], [[x0 / su, v0], [x1 / su, v0], [x1 / su, v1], [x0 / su, v1]]);
    if (faces.includes('z')) this.quad(mat, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], [[-x1 / su, v0], [-x0 / su, v0], [-x0 / su, v1], [-x1 / su, v1]]);
    if (faces.includes('Y')) this.quad(mat, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], [[x0 / su, -z1 / sv], [x1 / su, -z1 / sv], [x1 / su, -z0 / sv], [x0 / su, -z0 / sv]]);
    if (faces.includes('y')) this.quad(mat, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], [[x0 / su, z0 / sv], [x1 / su, z0 / sv], [x1 / su, z1 / sv], [x0 / su, z1 / sv]]);
  }
  build(scene) {
    for (const [mat, a] of this.m) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2));
      g.setIndex(a.i);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}

const LK = {
  tube: { c: 0xcfe4d4, i: 9, d: 12, y: 2.8 }, emerg: { c: 0xff2c1c, i: 2.4, d: 8, y: 2.6 }, exit: { c: 0xff2c14, i: 1.8, d: 6, y: 2.45 },
  lamp: { c: 0xffb066, i: 3.5, d: 7, y: 1.25 }, fire: { c: 0xff6a22, i: 5, d: 9, y: 0.7 }, cold: { c: 0xa9c8ff, i: 7, d: 11, y: 2.55 }, moon: { c: 0x7e96b8, i: 5, d: 14, y: 4.5 },
};
const ITEM_GLOW = 0x1a1a10;

export class World {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    this.mat = makeMaterials();
    this.B = new Batch();
    this.doors = {}; this.items = new Map(); this.fix = []; this.tags = []; this.drawerFronts = [];
    this.roomFlick = {}; this.w = null;
    this.buildShell(); this.buildProps(); this.buildDecor();
    this.B.build(scene);
    this.buildDoors(); this.buildLights();
  }

  // ------------------------------------------------------------------ shell
  buildShell() {
    const { B, mat } = this;
    for (const r of M.ROOMS) {
      const top = r.lvl === 'b' ? 0.2 : 3;
      if (r.id === 'stairs') {
        B.box(mat.floor, 36, -0.1, 13, 40, 0, 15, { faces: 'YZ' });
        const n = 13, dz = 6 / n;
        for (let i = 0; i < n; i++) B.box(mat.concrete, 36, M.FLOOR_B, 15 + i * dz, 40, (M.FLOOR_B * i) / n, 15 + (i + 1) * dz, { faces: 'YZz', vb: M.FLOOR_B });
        B.box(mat.floorB, 36, M.FLOOR_B - 0.1, 21, 40, M.FLOOR_B, 22, { faces: 'Y' });
        B.box(mat.ceil, 36, 3, 13, 40, 3.1, 22, { faces: 'y' });
        B.box(mat.concrete, 36, 0.2, 21.9, 40, 3, 22.1, { vb: 0 });
        for (const x of [36.14, 39.86]) B.box(mat.wood, x - 0.03, -0.2, 14.5, x + 0.03, -0.12, 21.5); // handrail hint
        continue;
      }
      const fy = r.lvl === 'b' ? M.FLOOR_B : 0;
      B.box(r.lvl === 'b' || r.id === 'outside' ? mat.floorB : mat.floor, r.x0, fy - 0.1, r.z0, r.x1, fy, r.z1, { faces: 'Y' });
      if (r.id !== 'outside') B.box(r.lvl === 'b' ? mat.concrete : mat.ceil, r.x0, top, r.z0, r.x1, top + 0.1, r.z1, { faces: 'y' });
    }
    const wmat = (w) => (w.lvl === 'b' || (w.lvl === 'g' && w.z0 >= 22 && w.z1 > 22.2) || (w.lvl === 'g' && w.z0 > 25) ? mat.concrete : mat.wall);
    for (const w of [...M.WALLS, ...M.HEADERS]) B.box(wmat(w), w.x0, w.y0, w.z0, w.x1, w.y1, w.z1, { vb: w.lvl === 'b' ? M.FLOOR_B : 0, faces: 'xXzZ' });
    // corridor handrails and door frames
    for (const w of M.WALLS) {
      if (w.a !== 'h' || w.lvl !== 'g') continue;
      const c = (w.z0 + w.z1) / 2;
      if (c === 10) B.box(mat.wood, w.x0 + 0.1, 0.86, 10.1, w.x1 - 0.1, 0.94, 10.17);
      if (c === 13) B.box(mat.wood, w.x0 + 0.1, 0.86, 12.83, w.x1 - 0.1, 0.94, 12.9);
    }
    for (const d of M.DOORS) {
      const base = d.lvl === 'b' ? M.FLOOR_B : 0, f = 0.07, t = 0.14;
      for (const s of [-1, 1]) {
        const e = d.at + (s * d.w) / 2;
        if (d.a === 'h') B.box(mat.dark, e - f / 2, base, d.c - t, e + f / 2, base + M.DOOR_H, d.c + t);
        else B.box(mat.dark, d.c - t, base, e - f / 2, d.c + t, base + M.DOOR_H, e + f / 2);
      }
      if (d.a === 'h') B.box(mat.dark, d.at - d.w / 2, base + M.DOOR_H - 0.06, d.c - t, d.at + d.w / 2, base + M.DOOR_H + 0.02, d.c + t);
      else B.box(mat.dark, d.c - t, base + M.DOOR_H - 0.06, d.at - d.w / 2, d.c + t, base + M.DOOR_H + 0.02, d.at + d.w / 2);
    }
    // Dark openings she drags people through.
    for (const v of M.VOIDS) {
      const fy = M.floorY(v.x, v.z), x = v.fx > 0 ? 39.89 : 0.11, h = v.lvl === 'b' ? 2.3 : 2.5;
      B.box(mat.black, x - 0.02, fy, v.z - 1.1, x + 0.02, fy + h, v.z + 1.1);
      B.box(mat.dark, x - 0.06, fy, v.z - 1.25, x + 0.06, fy + h + 0.15, v.z - 1.1); B.box(mat.dark, x - 0.06, fy, v.z + 1.1, x + 0.06, fy + h + 0.15, v.z + 1.25);
      B.box(mat.dark, x - 0.06, fy + h, v.z - 1.25, x + 0.06, fy + h + 0.15, v.z + 1.25);
    }
  }

  local(p) {
    const fy = M.floorY(p.x, p.z), th = (p.r * Math.PI) / 2, c = Math.round(Math.cos(th)), s = Math.round(Math.sin(th));
    const tr = (x, z) => [p.x + x * c + z * s, p.z - x * s + z * c];
    const b = (mat, x0, y0, z0, x1, y1, z1) => {
      const [ax, az] = tr(x0, z0), [bx, bz] = tr(x1, z1);
      this.B.box(mat, Math.min(ax, bx), fy + y0, Math.min(az, bz), Math.max(ax, bx), fy + y1, Math.max(az, bz));
    };
    b.tr = tr; b.fy = fy; b.th = th;
    return b;
  }
  mesh(geo, mat, x, y, z, shadow = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = shadow; this.scene.add(m); return m; }
  plane(tex, w, h, x, y, z, ry, opts = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, transparent: !!opts.alpha, emissive: opts.emissive ?? 0x000000, emissiveMap: opts.emissive ? tex : null, emissiveIntensity: opts.ei ?? 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m); return m;
  }

  // ------------------------------------------------------------------ furniture
  buildProps() {
    const { mat } = this;
    const legs = (b, hw, hd, h, t = 0.03, m = mat.metal) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(m, sx * hw - t, 0, sz * hd - t, sx * hw + t, h, sz * hd + t); };
    const P = {
      bed: (b, p) => {
        legs(b, 0.98, 0.44, 0.42);
        b(mat.metal, -1.02, 0.36, -0.47, 1.02, 0.42, 0.47); b(mat.fabric, -1.0, 0.42, -0.45, 0.98, 0.58, 0.45);
        b(mat.fabric, -0.95, 0.58, -0.32, -0.5, 0.68, 0.32); b(mat.curtain, -0.3, 0.58, -0.46, 0.9, 0.61, 0.46);
        for (const z of [-0.47, -0.16, 0.16, 0.47]) b(mat.metal, -1.05, 0.3, z - 0.02, -1.01, 1.1, z + 0.02);
        b(mat.metal, -1.05, 1.06, -0.47, -1.01, 1.1, 0.47); b(mat.metal, 1.01, 0.3, -0.47, 1.05, 0.8, -0.43); b(mat.metal, 1.01, 0.3, 0.43, 1.05, 0.8, 0.47); b(mat.metal, 1.01, 0.76, -0.47, 1.05, 0.8, 0.47);
        b(mat.paper, 1.06, 0.5, -0.12, 1.08, 0.74, 0.12);
      },
      wardrobe: (b) => { b(mat.wood, -0.6, 0, -0.3, 0.6, 2.0, 0.3); b(mat.dark, -0.01, 0.06, 0.3, 0.01, 1.94, 0.31); for (const s of [-1, 1]) { b(mat.dark, s * 0.56 - 0.01, 0.06, 0.3, s * 0.56 + 0.01, 1.94, 0.31); b(mat.metal, s * 0.07 - 0.012, 0.95, 0.3, s * 0.07 + 0.012, 1.1, 0.33); } b(mat.wood, -0.63, 2.0, -0.33, 0.63, 2.05, 0.33); },
      cupboard: (b) => { b(mat.metal, -0.5, 0, -0.3, 0.5, 1.7, 0.3); b(mat.dark, -0.008, 0.05, 0.3, 0.008, 1.65, 0.31); for (let i = 0; i < 7; i++) b(mat.dark, -0.4, 1.15 + i * 0.06, 0.3, 0.4, 1.17 + i * 0.06, 0.308); b(mat.steel, 0.05, 0.8, 0.3, 0.08, 0.95, 0.33); },
      bathtub: (b) => { b(mat.enamel, -0.85, 0, -0.4, 0.85, 0.12, 0.4); b(mat.enamel, -0.85, 0.12, -0.4, -0.78, 0.6, 0.4); b(mat.enamel, 0.78, 0.12, -0.4, 0.85, 0.6, 0.4); b(mat.enamel, -0.85, 0.12, -0.4, 0.85, 0.6, -0.33); b(mat.enamel, -0.85, 0.12, 0.33, 0.85, 0.6, 0.4); b(mat.steel, -0.84, 0.6, -0.06, -0.72, 0.78, 0.06); b(mat.dark, -0.7, 0.12, -0.3, 0.7, 0.14, 0.3); },
      table: (b) => { b(mat.wood, -0.8, 0.74, -0.4, 0.8, 0.8, 0.4); legs(b, 0.74, 0.34, 0.74, 0.03, mat.wood); b(mat.wood, -0.8, 0.2, -0.4, 0.8, 0.74, -0.37); },
      slab: (b) => { b(mat.steel, -1.0, 0.82, -0.45, 1.0, 0.9, 0.45); legs(b, 0.9, 0.36, 0.82, 0.035, mat.steel); b(mat.steel, -0.9, 0.2, -0.38, 0.9, 0.23, -0.34); },
      desk: (b) => { b(mat.wood, -0.8, 0.74, -0.4, 0.8, 0.8, 0.4); b(mat.wood, -0.8, 0, -0.4, -0.76, 0.74, 0.4); b(mat.wood, 0.36, 0, -0.4, 0.8, 0.74, 0.4); b(mat.wood, -0.8, 0.1, -0.4, 0.8, 0.74, -0.36); b(mat.metal, 0.52, 0.5, 0.4, 0.64, 0.53, 0.42); b(mat.metal, 0.52, 0.25, 0.4, 0.64, 0.28, 0.42); },
      shelf: (b, p, i) => {
        for (const s of [-1, 1]) b(mat.metal, s * 0.98 - 0.02, 0, -0.25, s * 0.98 + 0.02, 2.0, 0.25);
        for (let k = 0; k < 5; k++) b(mat.metal, -1, 0.1 + k * 0.46, -0.25, 1, 0.13 + k * 0.46, 0.25);
        let s = i * 7 + 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
        for (let k = 0; k < 4; k++) for (let x = -0.85; x < 0.8;) { const w = 0.12 + r() * 0.3, h = 0.1 + r() * 0.26; if (r() < 0.62) b([mat.wood, mat.paper, mat.rust, mat.fabric, mat.glass][(r() * 5) | 0], x, 0.13 + k * 0.46, -0.18 + r() * 0.08, x + w, 0.13 + k * 0.46 + h, 0.16); x += w + 0.05 + r() * 0.2; }
      },
      lockers: (b) => { b(mat.metal, -1, 0, -0.25, 1, 1.9, 0.25); for (let k = 0; k < 4; k++) { const x = -1 + k * 0.5; b(mat.dark, x - 0.006, 0, 0.25, x + 0.006, 1.9, 0.258); for (let j = 0; j < 4; j++) b(mat.dark, x + 0.12, 1.55 + j * 0.05, 0.25, x + 0.38, 1.565 + j * 0.05, 0.257); b(mat.steel, x + 0.4, 0.95, 0.25, x + 0.43, 1.05, 0.275); } },
      gurney: (b) => { b(mat.fabric, -1, 0.78, -0.38, 1, 0.9, 0.38); b(mat.steel, -1, 0.72, -0.4, 1, 0.78, 0.4); legs(b, 0.9, 0.34, 0.72, 0.025, mat.steel); b(mat.steel, -0.9, 0.25, -0.34, 0.9, 0.28, 0.34); legs(b, 0.9, 0.34, 0.12, 0.05, mat.dark); },
      cabinet: (b) => { b(mat.metal, -0.5, 0, -0.25, 0.5, 1.9, 0.25); b(mat.glass, -0.44, 1.0, 0.25, -0.02, 1.82, 0.262); b(mat.glass, 0.02, 1.0, 0.25, 0.44, 1.82, 0.262); b(mat.dark, -0.008, 0.05, 0.25, 0.008, 0.95, 0.26); b(mat.steel, 0.05, 0.5, 0.25, 0.08, 0.62, 0.28); },
      crates: (b) => { b(mat.wood, -0.45, 0, -0.45, 0.45, 0.5, 0.45); b(mat.wood, -0.38, 0.5, -0.4, 0.3, 0.9, 0.32); b(mat.dark, -0.45, 0.24, -0.455, 0.45, 0.27, 0.455); },
      drawers: (b, p) => {
        b(mat.steel, -2.5, 0, -0.5, 2.5, 2.3, 0.44);
        for (let k = 0; k < 5; k++) {
          const x = -2 + k; // local x; rot 2 flips it so drawer 1 is at world x=31
          b(mat.steel, x - 0.42, 1.5, 0.44, x + 0.42, 2.2, 0.5); b(mat.dark, x + 0.2, 1.8, 0.5, x + 0.36, 1.84, 0.54);
          b(mat.dark, x - 0.44, 0.08, 0.44, x - 0.42, 2.22, 0.47); b(mat.dark, x + 0.42, 0.08, 0.44, x + 0.44, 2.22, 0.47);
        }
      },
      counter: (b) => { b(mat.wood, -4, 0, -0.26, 4, 1.04, 0.26); b(mat.metal, -4.04, 1.04, -0.32, 4.04, 1.1, 0.32); b(mat.dark, -4, 0, -0.27, 4, 0.1, -0.26); },
      bench: (b) => { b(mat.wood, -0.8, 0.42, -0.22, 0.8, 0.48, 0.22); legs(b, 0.72, 0.18, 0.42, 0.03, mat.metal); },
      crib: (b) => { legs(b, 0.58, 0.33, 0.9, 0.022, mat.metal); b(mat.metal, -0.6, 0.86, -0.35, 0.6, 0.9, -0.31); b(mat.metal, -0.6, 0.86, 0.31, 0.6, 0.9, 0.35); for (let k = 0; k < 9; k++) for (const z of [-0.33, 0.33]) b(mat.metal, -0.56 + k * 0.14 - 0.01, 0.4, z - 0.01, -0.56 + k * 0.14 + 0.01, 0.86, z + 0.01); b(mat.fabric, -0.58, 0.36, -0.31, 0.58, 0.46, 0.31); },
      sink: (b) => { b(mat.enamel, -0.3, 0.72, -0.25, 0.3, 0.9, 0.22); b(mat.dark, -0.2, 0.895, -0.15, 0.2, 0.9, 0.14); b(mat.enamel, -0.08, 0, -0.2, 0.08, 0.72, -0.05); b(mat.steel, -0.02, 0.9, -0.22, 0.02, 1.08, -0.18); },
    };
    M.PROPS.forEach((p, i) => {
      const b = this.local(p);
      if (P[p.t]) P[p.t](b, p, i);
      else if (p.t === 'wheelchair') this.wheelchair(p, b);
      else if (p.t === 'boiler') this.boiler(p, b);
      if (p.t === 'drawers') {
        for (let k = 0; k < 5; k++) { // lower row: the five labelled drawers
          const [wx, wz] = b.tr(-2 + k, 0.47);
          const n = Math.round(wx - 30); // world x 31..35 -> drawer 1..5
          const front = this.mesh(new THREE.BoxGeometry(0.84, 0.72, 0.07), this.mat.steel, wx, b.fy + 1.06, wz);
          const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), this.mat.dark); handle.position.set(0.2, 0.2, -0.05); front.add(handle);
          const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.14), new THREE.MeshStandardMaterial({ roughness: 1, color: 0xd8d2bd })); tag.position.set(-0.12, 0.05, -0.04); tag.rotation.y = Math.PI; front.add(tag);
          this.drawerFronts[n] = { front, tag, z0: wz, name: null };
        }
      }
    });
  }
  wheelchair(p, b) {
    const g = new THREE.Group(); g.position.set(p.x, b.fy, p.z); g.rotation.y = b.th; this.scene.add(g);
    const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
    for (const s of [-1, 1]) { add(new THREE.TorusGeometry(0.29, 0.02, 6, 20), this.mat.dark, s * 0.31, 0.31, -0.1, 0, 0).rotation.y = Math.PI / 2; add(new THREE.TorusGeometry(0.08, 0.02, 5, 10), this.mat.dark, s * 0.26, 0.09, 0.36).rotation.y = Math.PI / 2; add(new THREE.BoxGeometry(0.03, 0.03, 0.5), this.mat.steel, s * 0.27, 0.68, 0.05); add(new THREE.BoxGeometry(0.03, 0.5, 0.03), this.mat.steel, s * 0.27, 0.78, -0.28); }
    add(new THREE.BoxGeometry(0.5, 0.05, 0.46), this.mat.dark, 0, 0.48, 0.02); add(new THREE.BoxGeometry(0.5, 0.42, 0.04), this.mat.dark, 0, 0.74, -0.24);
    add(new THREE.BoxGeometry(0.4, 0.03, 0.14), this.mat.steel, 0, 0.14, 0.4);
  }
  boiler(p, b) {
    const m = this.mat;
    this.mesh(new THREE.CylinderGeometry(0.78, 0.78, 2.1, 18), m.rust, p.x, b.fy + 1.15, p.z);
    this.mesh(new THREE.SphereGeometry(0.78, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.rust, p.x, b.fy + 2.2, p.z).scale.y = 0.4;
    this.mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8), m.rust, p.x + 0.3, b.fy + 2.4, p.z - 0.3);
    const pipe = this.mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), m.rust, p.x + 0.9, b.fy + 2.5, p.z + 1.2); pipe.rotation.x = Math.PI / 2;
    const glow = this.mesh(new THREE.BoxGeometry(0.03, 0.22, 0.42), new THREE.MeshBasicMaterial({ color: 0xff5a14 }), p.x + 0.78, b.fy + 0.6, p.z, false);
    (this.fires ||= []).push(glow);
  }

  // ------------------------------------------------------------------ dressing
  buildDecor() {
    const { B, mat } = this;
    // ward curtains and rails
    for (const x of [3.5, 6.5, 9.75]) { B.box(mat.curtain, x - 0.02, 0.25, 0.25, x + 0.02, 2.3, 2.5 + (x === 6.5 ? -0.9 : 0)); B.box(mat.metal, x - 0.015, 2.3, 0.1, x + 0.015, 2.33, 2.7); }
    B.box(mat.curtain, 19.3, 0.2, 6.3, 19.34, 2.3, 8.2); B.box(mat.metal, 19.3, 2.3, 6.1, 19.33, 2.33, 9.9); // room 3 bath screen
    // IV stands
    for (const [x, z] of [[3.1, 0.7], [12.4, 0.8], [18.4, 0.7], [27.4, 4.2]]) { B.box(mat.steel, x - 0.012, 0, z - 0.012, x + 0.012, 1.85, z + 0.012); B.box(mat.steel, x - 0.2, 0, z - 0.02, x + 0.2, 0.03, z + 0.02); B.box(mat.steel, x - 0.02, 0, z - 0.2, x + 0.02, 0.03, z + 0.2); B.box(mat.steel, x - 0.12, 1.83, z - 0.01, x + 0.12, 1.85, z + 0.01); B.box(mat.glass, x + 0.06, 1.5, z - 0.03, x + 0.14, 1.8, z + 0.03); }
    // station desk: switchboard, lamp, phone, paper stacks
    B.box(mat.metal, 13.3, 0.8, 15.75, 14.3, 1.12, 16.2); B.box(mat.dark, 13.34, 0.84, 15.74, 14.26, 1.08, 15.76);
    B.box(mat.dark, 14.55, 0.8, 15.85, 14.75, 0.87, 16.15); B.box(mat.steel, 14.62, 0.8, 16.2, 14.66, 1.22, 16.24); B.box(mat.steel, 14.5, 1.2, 15.98, 14.78, 1.26, 16.26);
    for (const [x, z, h] of [[11.2, 13.4, 0.08], [17.3, 13.38, 0.05], [10.6, 13.42, 0.03], [13.4, 13.45, 0.02], [15.6, 13.36, 0.06]]) B.box(mat.paper, x - 0.16, 1.1, z - 0.11, x + 0.16, 1.1 + h, z + 0.11);
    // evidence props
    B.box(mat.wood, 12.2, 1.1, 13.25, 12.8, 1.13, 13.55); B.box(mat.paper, 12.22, 1.13, 13.27, 12.49, 1.145, 13.53); B.box(mat.paper, 12.51, 1.13, 13.27, 12.78, 1.145, 13.53); // night log
    B.box(mat.wood, 33.75, 0.8, 13.5, 34.25, 0.82, 13.9); B.box(mat.paper, 33.8, 0.82, 13.53, 34.2, 0.83, 13.87); // admission file
    B.box(mat.wood, 28.3, 0.8, 0.38, 28.7, 0.815, 0.72); B.box(mat.paper, 28.33, 0.815, 0.4, 28.67, 0.825, 0.7); B.box(mat.steel, 28.42, 0.82, 0.38, 28.58, 0.84, 0.42); // orders clipboard
    // breaker panel, call button, chart holders, medicine cross
    B.box(mat.metal, 39.8, 1.0, 1.85, 39.9, 1.8, 2.55); B.box(mat.dark, 39.78, 1.05, 1.9, 39.8, 1.75, 2.5); B.box(mat.steel, 39.86, 1.8, 2.15, 39.9, 3, 2.25);
    B.box(mat.metal, 16.45, 1.15, 0.1, 16.65, 1.35, 0.16);
    for (const s of M.STATIONS) if (s.k === 'slot') B.box(mat.metal, s.x - 0.14, 0.52, s.z - 0.02, s.x + 0.14, 0.76, s.z + 0.02);
    B.box(mat.red, 23.92, 1.55, 0.652, 24.08, 1.61, 0.662); B.box(mat.red, 23.97, 1.5, 0.652, 24.03, 1.66, 0.662);
    // door signs
    const sign = (text, x, y, z, ry, w = 1.0, opts) => this.plane(textSign(text, opts), w, w / 4, x, y, z, ry);
    for (const d of M.DOORS) {
      if (!d.name) continue;
      const base = d.lvl === 'b' ? M.FLOOR_B : 0, y = base + 2.42;
      if (d.id === 'exit') { sign('STAFF EXIT', d.at, y, d.c - 0.11, Math.PI); continue; }
      if (d.a === 'h') { const south = d.c === 10; sign(d.name.toUpperCase(), d.at, y, d.c + (south ? 0.11 : -0.11), south ? 0 : Math.PI); }
      else sign(d.name.toUpperCase(), d.c + 0.11, y, d.at, Math.PI / 2);
    }
    sign('WARD B', 0.14, 2.75, 11.5, Math.PI / 2, 1.2, { sub: 'CLOSED - NO ENTRY' }); sign('LIFT', 39.86, 2.75, 11.5, -Math.PI / 2, 1.2, { sub: 'OUT OF ORDER' }); sign('COLD STORE', 39.86, M.FLOOR_B + 2.55, 31.5, -Math.PI / 2, 1.2);
    sign('MORTUARY', 31, M.FLOOR_B + 2.42, 24.89, Math.PI);
    const num = (n, x, z, ry) => this.plane(textSign(String(n), { w: 128, h: 128, bg: '#c9c4ae', fg: '#1c1d1a', font: 'bold 92px Arial, sans-serif' }), 0.3, 0.3, x, 1.95, z, ry);
    for (const p of M.PROPS) if (p.t === 'bed') { if (p.bed === 0) num(3, p.x, 0.11, 0); else if (p.r === 3) num(p.bed, p.x, 0.11, 0); else num(p.bed, p.x, 9.89, Math.PI); }
    // things written on the walls
    const scr = (t, w, x, y, z, ry) => this.plane(scrawl(t), w, w / 4, x, y, z, ry, { alpha: true });
    scr('ANSWER ME', 2.6, 18.6, 1.9, 0.105, 0); scr('WHERE IS SHE', 2.8, 13.89, 1.7, 7.2, -Math.PI / 2); scr('BRING HER TO ME', 3.6, 33, M.FLOOR_B + 1.6, 25.105, 0); scr('03:12', 1.6, 9, 1.7, 21.89, Math.PI);
    // stopped clock over the station
    const clock = document.createElement('canvas'); clock.width = clock.height = 128;
    const g = clock.getContext('2d'); g.fillStyle = '#c9c4ae'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = '#1c1d1a'; g.lineWidth = 5; g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56); g.stroke(); }
    const hand = (a, l, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.sin(a) * l, 64 - Math.cos(a) * l); g.stroke(); };
    hand((3.2 / 12) * Math.PI * 2, 30, 6); hand((12 / 60) * Math.PI * 2, 46, 4);
    const ct = new THREE.CanvasTexture(clock); ct.colorSpace = THREE.SRGBColorSpace;
    this.plane(ct, 0.5, 0.5, 14, 2.45, 21.89, Math.PI, { alpha: true });
    // call lamp over Room 3 and the exit sign
    this.callLamp = this.mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }), 17.5, 2.72, 10.2, false);
    this.callBtn = this.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 16.55, 1.25, 0.17, false);
    this.breakerLed = this.mesh(new THREE.BoxGeometry(0.02, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 39.77, 1.68, 2.2, false);
    this.breakerLever = this.mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), this.mat.red, 39.75, 1.3, 2.2);
    this.plane(textSign('EXIT', { w: 256, h: 128, bg: '#1a0503', fg: '#ff4a2a', font: 'bold 90px Arial, sans-serif' }), 0.6, 0.3, 4, 2.78, 21.88, Math.PI, { emissive: 0xffffff, ei: 1.4 });
    // outside: a hint of the car park
    B.box(mat.concrete, 1.4, 0, 25.2, 3.2, 0.9, 25.8); B.box(mat.metal, 5.2, 0, 23, 5.3, 3.4, 23.1);
  }

  // ------------------------------------------------------------------ doors
  buildDoors() {
    for (const d of M.DOORS) {
      if (d.arch) continue;
      const base = d.lvl === 'b' ? M.FLOOR_B : 0, g = new THREE.Group();
      const steel = d.id === 'exit' || d.id === 'morgue' || d.id === 'stairs';
      const m = steel ? this.mat.steel : this.mat.door; // one material per panel = one draw call
      const panel = new THREE.Mesh(new THREE.BoxGeometry(d.w - 0.08, M.DOOR_H - 0.08, 0.05), m);
      panel.position.set(d.w / 2, (M.DOOR_H - 0.08) / 2 + 0.01, 0); panel.castShadow = panel.receiveShadow = true; g.add(panel);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.16), this.mat.steel); h.position.set(d.w - 0.2, 1.02, 0); g.add(h); // both handles in one piece
      let closed, open;
      if (d.a === 'h') { g.position.set(d.at - d.w / 2, base, d.c); closed = 0; open = d.c === 10 ? Math.PI / 2 : -Math.PI / 2; if (d.id === 'morgue') open = -Math.PI / 2; }
      else { g.position.set(d.c, base, d.at - d.w / 2); closed = -Math.PI / 2; open = 0.02; }
      g.rotation.y = d.open ? open : closed;
      this.scene.add(g);
      this.doors[d.id] = { g, closed, open, cur: d.open ? 1 : 0, tgt: d.open ? 1 : 0, speed: 3 };
    }
  }

  // ------------------------------------------------------------------ lights
  buildLights() {
    for (const L of M.LIGHTS) {
      const k = LK[L.k], fy = M.floorY(L.x, L.z);
      const top = fy < -1.3 ? 0.2 : 3, hung = L.k === 'tube' || L.k === 'emerg' || L.k === 'cold';
      const y = hung ? top - 0.08 : fy + k.y;
      const geo = L.k === 'tube' || L.k === 'cold' ? new THREE.BoxGeometry(L.z === 11.5 ? 1.3 : 0.24, 0.05, L.z === 11.5 ? 0.24 : 1.3) : L.k === 'emerg' ? new THREE.BoxGeometry(0.22, 0.1, 0.12) : null;
      const mat = new THREE.MeshBasicMaterial({ color: k.c });
      const mesh = geo ? this.mesh(geo, mat, L.x, y, L.z, false) : null;
      if (L.k === 'lamp') { const bulb = this.mesh(new THREE.SphereGeometry(0.05, 8, 6), mat, 14.64, 1.17, 16.12, false); bulb.userData.keep = 1; }
      this.fix.push({ L, k, mesh, mat, col: new THREE.Color(k.c), x: L.x, z: L.z, y: hung ? top - 0.35 : L.k === 'lamp' ? 1.3 : fy + k.y, b: 0, ph: Math.random() * 100, room: (M.roomAt(L.x, L.z) || {}).id, drop: 0 });
    }
    this.pool = [];
    this.setPool(this.q);
    this.callLight = new THREE.PointLight(0xff7a1a, 0, 5, 1.8); this.callLight.position.set(17.5, 2.6, 10.6); this.scene.add(this.callLight);
  }
  // How many ceiling fixtures get a real light at once. Each extra light costs on every pixel.
  setPool(q) {
    const n = q === 'low' ? 3 : q === 'medium' ? 4 : 5;
    while (this.pool.length > n) this.scene.remove(this.pool.pop());
    while (this.pool.length < n) { const p = new THREE.PointLight(0xffffff, 0, 10, 1.6); this.scene.add(p); this.pool.push(p); }
  }
  flickerRoom(room, secs = 2.5) { this.roomFlick[room] = secs; }

  // ------------------------------------------------------------------ items
  itemMesh(k) {
    const g = new THREE.Group(), m = this.mat;
    const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, emissive: ITEM_GLOW, ...o });
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, mat); me.position.set(x, y, z); g.add(me); return me; }; // small items: no shadow pass
    if (k === 'key') { add(new THREE.TorusGeometry(0.035, 0.01, 6, 12), std(0xb08a2c, { metalness: 0.8, roughness: 0.3 }), -0.05, 0.012, 0).rotation.x = Math.PI / 2; add(new THREE.BoxGeometry(0.1, 0.012, 0.02), std(0xb08a2c, { metalness: 0.8, roughness: 0.3 }), 0.03, 0.012, 0); add(new THREE.BoxGeometry(0.07, 0.006, 0.04), std(0x7a1c14), -0.1, 0.008, 0.03); }
    else if (k === 'fuse') { const c = add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), std(0xcfc9b4), 0, 0.03, 0); c.rotation.z = Math.PI / 2; for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 10), std(0x8a6a2a, { metalness: 0.8 }), s * 0.065, 0.03, 0).rotation.z = Math.PI / 2; }
    else if (k === 'chart') { add(new THREE.BoxGeometry(0.24, 0.012, 0.32), m.wood, 0, 0.006, 0); add(new THREE.BoxGeometry(0.21, 0.006, 0.28), m.paper, 0, 0.015, 0.01); add(new THREE.BoxGeometry(0.1, 0.02, 0.03), m.steel, 0, 0.02, -0.14); }
    else if (k === 'meds') { add(new THREE.BoxGeometry(0.34, 0.2, 0.22), std(0x7a1612), 0, 0.1, 0); add(new THREE.BoxGeometry(0.1, 0.03, 0.005), std(0xd8d2c0), 0, 0.12, 0.112); add(new THREE.BoxGeometry(0.03, 0.1, 0.005), std(0xd8d2c0), 0, 0.12, 0.112); add(new THREE.BoxGeometry(0.12, 0.02, 0.03), m.dark, 0, 0.21, 0); }
    else if (k === 'doll') { add(new THREE.SphereGeometry(0.05, 10, 8), std(0xb9a892, { roughness: 0.8 }), 0, 0.05, -0.13); add(new THREE.ConeGeometry(0.075, 0.2, 8), std(0x6f6a5c, { roughness: 1 }), 0, 0.05, 0.02).rotation.x = Math.PI / 2; add(new THREE.SphereGeometry(0.054, 8, 6, 0, Math.PI * 2, 0, 1.6), std(0x1c1510, { roughness: 1 }), 0, 0.056, -0.135).rotation.x = -0.8; for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.02, 0.02, 0.1), std(0xb9a892), s * 0.07, 0.03, -0.02).rotation.y = s * 0.5; const e = add(new THREE.SphereGeometry(0.008, 5, 4), new THREE.MeshBasicMaterial({ color: 0x050505 }), s * 0.018, 0.092, -0.14); e.castShadow = false; } }
    else { add(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 10), std(0x244a2c, { roughness: 0.15, transparent: true, opacity: 0.8 }), 0, 0.085, 0); add(new THREE.CylinderGeometry(0.012, 0.03, 0.08, 8), std(0x244a2c, { roughness: 0.15, transparent: true, opacity: 0.8 }), 0, 0.21, 0); }
    return g;
  }

  applyWorld(w) {
    this.w = w;
    for (const [id, [open]] of Object.entries(w.doors)) if (this.doors[id]) this.doors[id].tgt = open;
    const seen = new Set();
    for (const it of w.items) {
      seen.add(it.id);
      let m = this.items.get(it.id);
      if (!m) { m = this.itemMesh(it.k); m.rotation.y = (it.x * 7.3 + it.z * 3.1) % 6.28; this.scene.add(m); this.items.set(it.id, m); }
      m.visible = !it.h;
      m.position.set(it.x, M.floorY(it.x, it.z) + it.y + 0.005, it.z);
    }
    for (const [id, m] of this.items) if (!seen.has(id)) { this.scene.remove(m); this.items.delete(id); }
    w.drawers.forEach((name, i) => {
      const d = this.drawerFronts[i + 1];
      if (!d) return;
      if (d.name !== name) { d.name = name; d.tag.material.map = textSign(name.toUpperCase(), { w: 384, h: 128, bg: '#d8d2bd', fg: '#1c1d1a', font: 'bold 60px "Courier New", monospace', border: false }); d.tag.material.needsUpdate = true; }
      d.open = w.tried.includes(i + 1) ? 0.35 : w.mystery && false ? 0 : 0;
    });
    this.callLamp.visible = w.callOn; this.callBtn.material.color.setHex(w.callOn ? 0xff2a1a : 0x2a0a08);
    this.breakerLed.material.color.setHex(w.power ? 0x2aff5a : 0xff2a1a);
    this.breakerLever.position.y = w.power ? 1.5 : 1.3;
  }
  slam(id) { const d = this.doors[id]; if (d) d.speed = 14; }

  update(dt, t, cam, ghost) {
    for (const d of Object.values(this.doors)) {
      if (d.cur !== d.tgt) { const s = Math.sign(d.tgt - d.cur); d.cur += s * dt * d.speed; if ((d.tgt - d.cur) * s <= 0) { d.cur = d.tgt; d.speed = 3; } const e = d.cur * d.cur * (3 - 2 * d.cur); d.g.rotation.y = d.closed + (d.open - d.closed) * e; }
    }
    for (const d of this.drawerFronts) if (d) d.front.position.z += ((d.z0 - (d.open || 0)) - d.front.position.z) * Math.min(1, dt * 4);
    const w = this.w, power = w && w.power;
    for (const k in this.roomFlick) { this.roomFlick[k] -= dt; if (this.roomFlick[k] <= 0) delete this.roomFlick[k]; }
    for (const f of this.fix) {
      let b = f.L.pw ? (power ? 1 : 0) : 1;
      if (b) {
        const n = Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2) * Math.sin(t * 31 + f.ph * 3);
        if (f.L.flick) { f.drop -= dt; if (f.drop < -2 - (f.ph % 5)) f.drop = 0.1 + Math.random() * 0.5; b *= f.drop > 0 ? (Math.random() < 0.5 ? 0.1 : 0.8) : 0.82 + n * 0.25; }
        if (f.L.k === 'fire') b *= 0.75 + Math.sin(t * 9 + f.ph) * 0.12 + Math.random() * 0.14;
        if (f.L.k === 'emerg') b *= 0.8 + Math.sin(t * 2 + f.ph) * 0.2;
        if (this.roomFlick[f.room] && f.L.k !== 'moon') b *= Math.random() < 0.55 ? 0.03 : 1;
        if (ghost && ghost.v > 0.3 && f.L.k !== 'moon' && f.L.k !== 'fire') { const d = Math.hypot(ghost.x - f.x, ghost.z - f.z); if (d < 7) b *= Math.random() < 0.25 + d / 14 ? 1 : 0.04; }
      }
      f.b = b;
      f.mat.color.copy(f.col).multiplyScalar(0.15 + b * 1.6);
      f.d = Math.hypot(cam.x - f.x, cam.z - f.z) + Math.abs(cam.y - f.y) * 2;
    }
    if (this.fires) for (const g of this.fires) g.material.color.setRGB(1, 0.3 + Math.random() * 0.12, 0.06);
    const near = this.fix.filter((f) => f.b > 0.02 && f.d < 26).sort((a, b) => a.d - b.d);
    this.pool.forEach((p, i) => {
      const f = near[i];
      if (!f) { p.intensity = 0; return; }
      p.position.set(f.x, f.y, f.z); p.color.copy(f.col); p.distance = f.k.d;
      p.intensity = f.k.i * f.b * Math.min(1, Math.max(0, (26 - f.d) / 6));
    });
    const blink = w && w.callOn ? (Math.sin(t * 5) > 0 ? 1 : 0.1) : 0;
    this.callLight.intensity = blink * 1.6; this.callLamp.material.color.setRGB(blink, blink * 0.45, blink * 0.08);
    for (const [, m] of this.items) if (m.visible) m.rotation.y += 0;
  }
}
