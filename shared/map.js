// The Night Shift - hospital layout. Shared by the server (rules, ghost) and the client (rendering).
// Units are metres. x runs east, z runs south. The basement sits south of the ground floor, 2.6 m lower.

export const FLOOR_B = -2.6;
export const EYE = 1.62;

export function floorY(x, z) {
  if (z >= 22 && x >= 12) return FLOOR_B;
  if (x >= 36 && z > 15 && z > 13) return z >= 21 ? FLOOR_B : (FLOOR_B * (z - 15)) / 6;
  return 0;
}

export const LVL = { g: [0, 3], b: [FLOOR_B, 0.2], s: [FLOOR_B, 3] };

export const ROOMS = [
  { id: 'corridor', name: 'Main Corridor', x0: 0, z0: 10, x1: 40, z1: 13, lvl: 'g' },
  { id: 'ward', name: 'Ward A', x0: 0, z0: 0, x1: 14, z1: 10, lvl: 'g' },
  { id: 'room3', name: 'Room 3', x0: 14, z0: 0, x1: 21, z1: 10, lvl: 'g' },
  { id: 'treatment', name: 'Treatment Room', x0: 21, z0: 0, x1: 31, z1: 10, lvl: 'g' },
  { id: 'storage', name: 'Storage', x0: 31, z0: 0, x1: 40, z1: 10, lvl: 'g' },
  { id: 'entrance', name: 'Staff Entrance', x0: 0, z0: 13, x1: 8, z1: 22, lvl: 'g' },
  { id: 'station', name: "Nurses' Station", x0: 8, z0: 13, x1: 20, z1: 22, lvl: 'g' },
  { id: 'staff', name: 'Staff Room', x0: 20, z0: 13, x1: 27, z1: 22, lvl: 'g' },
  { id: 'records', name: 'Records Office', x0: 27, z0: 13, x1: 36, z1: 22, lvl: 'g' },
  { id: 'stairs', name: 'Basement Stairs', x0: 36, z0: 13, x1: 40, z1: 22, lvl: 's' },
  { id: 'bcorr', name: 'Basement Corridor', x0: 26, z0: 22, x1: 40, z1: 25, lvl: 'b' },
  { id: 'morgue', name: 'Morgue', x0: 26, z0: 25, x1: 40, z1: 34, lvl: 'b' },
  { id: 'boiler', name: 'Boiler Room', x0: 16, z0: 22, x1: 26, z1: 30, lvl: 'b' },
  { id: 'outside', name: 'Staff Car Park', x0: 1, z0: 22, x1: 7, z1: 26, lvl: 'g' },
];

export function roomAt(x, z) {
  for (const r of ROOMS) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  return null;
}
export const roomById = (id) => ROOMS.find((r) => r.id === id);

const H = (c, f, t, lvl = 'g') => ({ a: 'h', c, f, t, lvl });
const V = (c, f, t, lvl = 'g') => ({ a: 'v', c, f, t, lvl });
export const WALL_LINES = [
  H(0, 0, 40), H(10, 0, 40), H(13, 0, 8), H(13, 20, 40), H(22, 0, 36),
  V(0, 0, 22), V(40, 0, 13), V(14, 0, 10), V(21, 0, 10), V(31, 0, 10),
  V(8, 13, 22), V(20, 13, 22), V(27, 13, 22),
  V(36, 13, 22, 's'), V(40, 13, 22, 's'),
  H(22, 16, 36, 'b'), H(25, 26, 40, 'b'), H(30, 16, 26, 'b'), H(34, 26, 40, 'b'),
  V(16, 22, 30, 'b'), V(26, 22, 34, 'b'), V(40, 22, 34, 'b'),
  V(1, 22, 26), V(7, 22, 26), H(26, 1, 7),
];

// a:'h' = door in a wall that runs along x at z=c; a:'v' = wall along z at x=c. `at` is the opening centre.
export const DOORS = [
  { id: 'ward_w', a: 'h', c: 10, at: 3, w: 1.2, open: false, name: 'Ward A' },
  { id: 'ward_e', a: 'h', c: 10, at: 11, w: 1.2, open: true, name: 'Ward A' },
  { id: 'room3', a: 'h', c: 10, at: 17.5, w: 1.2, open: false, name: 'Room 3' },
  { id: 'treat', a: 'h', c: 10, at: 24.5, w: 1.2, open: true, name: 'Treatment' },
  { id: 'storage', a: 'h', c: 10, at: 36, w: 1.2, open: false, name: 'Storage' },
  { id: 'entr', a: 'h', c: 13, at: 4, w: 2.4, arch: true },
  { id: 'staff', a: 'h', c: 13, at: 23.5, w: 1.2, open: false, name: 'Staff Room' },
  { id: 'records', a: 'h', c: 13, at: 31, w: 1.2, open: false, name: 'Records' },
  { id: 'stairs', a: 'h', c: 13, at: 38, w: 1.2, open: false, lock: 'key', name: 'Basement' },
  { id: 'exit', a: 'h', c: 22, at: 4, w: 1.4, open: false, lock: 'exit', name: 'Staff Exit' },
  { id: 'ward_r3', a: 'v', c: 14, at: 3, w: 1.2, open: false },
  { id: 'treat_st', a: 'v', c: 31, at: 3, w: 1.2, open: false },
  { id: 'ent_stn', a: 'v', c: 8, at: 18, w: 1.2, open: true },
  { id: 'stn_staff', a: 'v', c: 20, at: 19, w: 1.2, open: false },
  { id: 'staff_rec', a: 'v', c: 27, at: 19, w: 1.2, open: false },
  { id: 'boiler', a: 'v', c: 26, at: 23.5, w: 1.2, open: false, lvl: 'b', name: 'Boiler' },
  { id: 'morgue', a: 'h', c: 25, at: 31, w: 1.4, open: false, lvl: 'b', name: 'Morgue' },
  { id: 'morgue_b', a: 'v', c: 26, at: 27.5, w: 1.2, open: true, lvl: 'b' },
];
export const doorById = (id) => DOORS.find((d) => d.id === id);
export const doorPos = (d) => (d.a === 'h' ? { x: d.at, z: d.c } : { x: d.c, z: d.at });
export function doorBox(d, t = 0.06) {
  return d.a === 'h'
    ? { x0: d.at - d.w / 2, x1: d.at + d.w / 2, z0: d.c - t, z1: d.c + t }
    : { x0: d.c - t, x1: d.c + t, z0: d.at - d.w / 2, z1: d.at + d.w / 2 };
}

const WT = 0.1; // wall half thickness
export const DOOR_H = 2.15;
function buildWalls() {
  const walls = [], headers = [];
  for (const L of WALL_LINES) {
    const [y0, y1] = LVL[L.lvl];
    const ds = DOORS.filter((d) => d.a === L.a && d.c === L.c && (d.lvl || 'g') === (L.lvl === 's' ? 'g' : L.lvl) && d.at > L.f && d.at < L.t)
      .sort((a, b) => a.at - b.at);
    let cur = L.f;
    const seg = (f, t, hy0, hy1, list) => {
      if (t - f < 0.01) return;
      list.push(L.a === 'h'
        ? { x0: f, x1: t, z0: L.c - WT, z1: L.c + WT, y0: hy0, y1: hy1, lvl: L.lvl, a: 'h' }
        : { x0: L.c - WT, x1: L.c + WT, z0: f, z1: t, y0: hy0, y1: hy1, lvl: L.lvl, a: 'v' });
    };
    for (const d of ds) {
      seg(cur, d.at - d.w / 2, y0, y1, walls);
      const base = L.lvl === 'b' ? FLOOR_B : 0;
      seg(d.at - d.w / 2, d.at + d.w / 2, base + DOOR_H, y1, headers);
      cur = d.at + d.w / 2;
    }
    seg(cur, L.t, y0, y1, walls);
  }
  return { walls, headers };
}
export const { walls: WALLS, headers: HEADERS } = buildWalls();

// type: [width(x), depth(z), height, hide type]
export const PTYPE = {
  bed: [2.1, 1.0, 0.95, 'bed'], wardrobe: [1.2, 0.6, 2.0, 'wardrobe'], cupboard: [1.0, 0.6, 1.7, 'cupboard'],
  bathtub: [1.7, 0.8, 0.6, 'bathtub'], table: [1.6, 0.8, 0.8, 'table'], slab: [2.0, 0.9, 0.9, 'table'],
  desk: [1.6, 0.8, 0.8], shelf: [2.0, 0.5, 2.0], lockers: [2.0, 0.5, 1.9], gurney: [2.0, 0.8, 0.9],
  wheelchair: [0.7, 0.9, 0.9], cabinet: [1.0, 0.5, 1.9], crates: [0.9, 0.9, 0.9], boiler: [1.6, 1.6, 2.3],
  drawers: [5.0, 1.0, 2.3], counter: [8, 0.6, 1.1], bench: [1.6, 0.5, 0.5], crib: [1.2, 0.7, 0.9], sink: [0.6, 0.5, 0.9],
};
const P = (t, x, z, r = 0, extra) => ({ t, x, z, r, ...extra });
export const PROPS = [
  // Ward A
  P('bed', 2, 1.25, 3, { bed: 1 }), P('bed', 5, 1.25, 3, { bed: 2 }), P('bed', 8, 1.25, 3, { bed: 3 }), P('bed', 11.5, 1.25, 3, { bed: 4 }),
  P('bed', 6.5, 8.75, 1, { bed: 5 }), P('bed', 9, 8.75, 1, { bed: 6 }),
  P('wardrobe', 0.45, 5.5, 1), P('crib', 13.3, 7.2, 1), P('wheelchair', 4.5, 5.5, 0),
  // Room 3
  P('bed', 17.5, 1.25, 3, { bed: 0 }), P('bathtub', 20.45, 7.5, 3), P('table', 14.55, 7, 1), P('wheelchair', 19, 4, 2), P('sink', 20.65, 5.2, 3),
  // Treatment
  P('slab', 26, 5, 0), P('cabinet', 24, 0.4, 0), P('desk', 28.5, 0.55, 0), P('cupboard', 21.45, 6.5, 1), P('gurney', 29.5, 8, 0),
  P('sink', 21.4, 2, 1), P('cabinet', 30.65, 6.5, 3),
  // Storage
  P('shelf', 34, 3.5, 1), P('shelf', 36.8, 3.5, 1), P('shelf', 37, 0.45, 0), P('cupboard', 39.55, 6.5, 3), P('cupboard', 32.2, 9.55, 2),
  P('table', 38.5, 8.9, 2), P('crates', 34.5, 7.5, 0), P('crates', 31.7, 6.5, 0),
  // Staff entrance
  P('bench', 0.5, 16.5, 1), P('table', 7.4, 15.5, 3), P('lockers', 1.3, 21.6, 2), P('crates', 7.3, 21.2, 0),
  // Nurses' station
  P('counter', 14, 13.4, 0), P('table', 14, 16, 2), P('cupboard', 19.55, 15.5, 3), P('shelf', 13, 21.6, 2), P('cabinet', 9, 21.6, 2), P('desk', 11, 19.5, 1),
  // Staff room
  P('wardrobe', 20.45, 15.5, 1), P('wardrobe', 26.55, 16, 3), P('table', 23.5, 17.5, 0), P('lockers', 22, 21.6, 2), P('lockers', 24.6, 21.6, 2), P('sink', 26.65, 14, 3),
  // Records
  P('shelf', 30, 17, 1), P('shelf', 32.5, 17, 1), P('shelf', 35, 16.5, 1), P('cupboard', 35.55, 20.5, 3), P('table', 29.5, 21.3, 2), P('desk', 34, 13.7, 0),
  // Basement corridor
  P('crates', 39.3, 24.3, 0), P('gurney', 28.6, 24.5, 0),
  // Boiler room
  P('boiler', 18, 24.2, 0), P('boiler', 18, 27.6, 0), P('shelf', 21.5, 22.45, 0), P('cupboard', 25.55, 29, 3), P('table', 21.5, 29.3, 2), P('crates', 24, 22.7, 0),
  // Morgue
  P('drawers', 33, 33.4, 2), P('slab', 30.5, 29, 0), P('gurney', 36, 29.5, 0), P('cupboard', 39.55, 27.5, 3), P('sink', 26.45, 32, 1), P('cabinet', 38, 33.6, 2),
].map((p, i) => ({ id: 'p' + i, ...p }));

const FRONT = [[0, 1], [1, 0], [0, -1], [-1, 0]];
export function propBox(p) {
  const [w, d, h] = PTYPE[p.t];
  const hw = (p.r % 2 ? d : w) / 2, hd = (p.r % 2 ? w : d) / 2;
  return { x0: p.x - hw, x1: p.x + hw, z0: p.z - hd, z1: p.z + hd, h, id: p.id };
}
export const HIDES = PROPS.filter((p) => PTYPE[p.t][3]).map((p) => {
  const [, d] = PTYPE[p.t];
  const [fx, fz] = FRONT[p.r];
  return { id: p.id, type: PTYPE[p.t][3], x: p.x, z: p.z, fx, fz, ex: p.x + fx * (d / 2 + 0.55), ez: p.z + fz * (d / 2 + 0.55), room: roomAt(p.x, p.z).id };
});
export const hideById = (id) => HIDES.find((h) => h.id === id);
export const HIDE_NAMES = { bed: 'under the bed', wardrobe: 'in the wardrobe', cupboard: 'in the cupboard', bathtub: 'in the bathtub', table: 'under the table' };

export const PROP_BOXES = PROPS.map(propBox);
export const SOLID = [...WALLS, ...PROP_BOXES]; // blocks movement
export const OPAQUE = [...WALLS, ...PROP_BOXES.filter((b) => b.h >= 1.5)]; // blocks sight

export function segHitsBox(ax, az, bx, bz, b) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  if (Math.abs(dx) < 1e-9) { if (ax < b.x0 || ax > b.x1) return false; }
  else { let u = (b.x0 - ax) / dx, v = (b.x1 - ax) / dx; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; }
  if (Math.abs(dz) < 1e-9) { if (az < b.z0 || az > b.z1) return false; }
  else { let u = (b.z0 - az) / dz, v = (b.z1 - az) / dz; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false; }
  return true;
}
// doors: { id: { open, locked } }. A closed door blocks sight.
export function lineOfSight(ax, az, bx, bz, doors) {
  for (const b of OPAQUE) if (segHitsBox(ax, az, bx, bz, b)) return false;
  if (doors) for (const d of DOORS) {
    if (d.arch) continue;
    const s = doors[d.id];
    if (s && !s.open && segHitsBox(ax, az, bx, bz, doorBox(d))) return false;
  }
  return true;
}

// Fixed things players use. y is height above the local floor.
export const STATIONS = [
  { id: 'breaker', k: 'breaker', x: 39.8, z: 2.2, y: 1.4 },
  { id: 'call', k: 'call', x: 16.55, z: 0.2, y: 1.25 },
  { id: 'medcab', k: 'medcab', x: 24, z: 0.7, y: 1.2 },
  { id: 'slot1', k: 'slot', n: 1, x: 2, z: 2.45, y: 0.7 }, { id: 'slot2', k: 'slot', n: 2, x: 5, z: 2.45, y: 0.7 },
  { id: 'slot3', k: 'slot', n: 3, x: 8, z: 2.45, y: 0.7 }, { id: 'slot4', k: 'slot', n: 4, x: 11.5, z: 2.45, y: 0.7 },
  { id: 'slot5', k: 'slot', n: 5, x: 6.5, z: 7.55, y: 0.7 }, { id: 'slot6', k: 'slot', n: 6, x: 9, z: 7.55, y: 0.7 },
  { id: 'clue_log', k: 'clue', x: 12.5, z: 13.4, y: 1.14 },
  { id: 'clue_file', k: 'clue', x: 34, z: 13.7, y: 0.84 },
  { id: 'clue_orders', k: 'clue', x: 28.5, z: 0.55, y: 0.84 },
  ...[0, 1, 2, 3, 4].map((i) => ({ id: 'drawer' + (i + 1), k: 'drawer', n: i + 1, x: 31 + i, z: 32.85, y: 1.1 })),
];
export const stationById = (id) => STATIONS.find((s) => s.id === id);

export const ITEM_SPAWNS = {
  key: [29.5, 21.3, 0.84], fuse: [21.5, 22.5, 1.08], chart: [16.5, 13.4, 1.14], doll: [13.3, 7.2, 0.5],
  meds: [[37, 0.45, 1.08], [23.2, 17.5, 0.84], [36, 29.5, 0.94], [11, 19.3, 0.84]],
  bottle: [[0.5, 16.2, 0.54], [11, 19.9, 0.84], [29, 0.55, 0.84], [34.5, 7.5, 0.94], [23.9, 17.5, 0.84], [7.3, 21.2, 0.94],
    [39.3, 24.3, 0.94], [24, 22.7, 0.94], [9.6, 6.2, 0], [19.4, 9, 0], [15.2, 13.4, 1.14], [31.7, 6.5, 0.94]],
};
export const ITEM_NAMES = { key: 'Basement key', fuse: 'Spare fuse', chart: 'Patient chart', doll: 'Old doll', meds: 'Medicine case', bottle: 'Glass bottle' };

export const SPAWNS = [[3, 19], [4.6, 19.5], [5.5, 18.3], [2.4, 17.6], [4, 17]];
export const EXIT_ZONE = { x0: 1.2, x1: 6.8, z0: 22.5, z1: 25.8 };
// Dark openings the ghost drags its victims through.
export const VOIDS = [{ x: 0.75, z: 11.5, fx: -1, lvl: 'g' }, { x: 39.25, z: 11.5, fx: 1, lvl: 'g' }, { x: 39.25, z: 31.5, fx: 1, lvl: 'b' }];
export const WAYPOINTS = [
  ['ward', 7, 5], ['ward', 12.5, 4], ['room3', 17.5, 5], ['treatment', 26, 7.5], ['treatment', 23, 3], ['storage', 35.4, 6.2], ['storage', 32.5, 2],
  ['corridor', 4, 11.5], ['corridor', 15, 11.5], ['corridor', 27, 11.5], ['corridor', 37, 11.5], ['entrance', 4, 17], ['station', 11, 15.5], ['station', 16.5, 19.5],
  ['staff', 23.5, 15], ['records', 31, 15], ['records', 32, 20], ['bcorr', 33, 23.3], ['boiler', 22, 26], ['morgue', 33, 28], ['morgue', 37, 31.5],
].map(([room, x, z]) => ({ room, x, z, b: floorY(x, z) < -1 }));
export const CHOKES = [[8, 11.5], [21, 11.5], [34, 11.5], [4, 14.5], [33, 23.5]].map(([x, z]) => ({ x, z, b: floorY(x, z) < -1 }));

// Ceiling fixtures. pw: needs mains power. Others run on battery / their own circuit.
export const LIGHTS = [
  { x: 5, z: 11.5, pw: 1, k: 'tube' }, { x: 13, z: 11.5, pw: 1, k: 'tube', flick: 1 }, { x: 21, z: 11.5, pw: 1, k: 'tube' }, { x: 29, z: 11.5, pw: 1, k: 'tube', flick: 1 }, { x: 37, z: 11.5, pw: 1, k: 'tube' },
  { x: 4, z: 5, pw: 1, k: 'tube' }, { x: 10, z: 5, pw: 1, k: 'tube', flick: 1 }, { x: 17.5, z: 5, pw: 1, k: 'tube', flick: 1 }, { x: 26, z: 5, pw: 1, k: 'tube' },
  { x: 35.5, z: 5.5, pw: 1, k: 'tube' }, { x: 23.5, z: 17.5, pw: 1, k: 'tube' }, { x: 31.5, z: 18, pw: 1, k: 'tube', flick: 1 },
  { x: 4, z: 21.2, k: 'exit' }, { x: 14, z: 16, k: 'lamp' }, { x: 4, z: 16.5, k: 'emerg' }, { x: 20, z: 11.5, k: 'emerg' }, { x: 38, z: 17, k: 'emerg' },
  { x: 33, z: 23.5, k: 'emerg' }, { x: 18.9, z: 26, k: 'fire' }, { x: 33, z: 29.5, k: 'cold', flick: 1 }, { x: 4, z: 24, k: 'moon' },
];
export const BREAKER_STAND = { x: 39.1, z: 2.2 };
