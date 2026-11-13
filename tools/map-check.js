// Verifies every station, item, hiding spot, waypoint and exit is reachable from the spawn.
import { Nav } from '../shared/nav.js';
import * as M from '../shared/map.js';
const nav = new Nav();
let bad = 0;
const from = M.SPAWNS[0];
const chk = (name, x, z, maxOff = 1.6) => {
  const n = nav.nearestFree(x, z);
  const off = n ? Math.hypot(n.x - x, n.z - z) : 99;
  const len = n ? nav.pathLen(from[0], from[1], n.x, n.z) : Infinity;
  if (!isFinite(len) || off > maxOff) { bad++; console.log('UNREACHABLE', name, x, z, 'off', off.toFixed(2)); }
};
M.STATIONS.forEach((s) => chk(s.id, s.x, s.z));
M.HIDES.forEach((h) => { if (!nav.free(h.ex, h.ez)) { bad++; console.log('HIDE EXIT BLOCKED', h.id, h.type, h.ex, h.ez); } chk('hide ' + h.id, h.ex, h.ez, 0.1); });
M.WAYPOINTS.forEach((w) => chk('wp ' + w.room, w.x, w.z, 0.1));
M.CHOKES.forEach((w) => chk('choke', w.x, w.z, 0.1));
M.VOIDS.forEach((w) => chk('void', w.x, w.z, 0.1));
M.SPAWNS.forEach((w) => chk('spawn', w[0], w[1], 0.1));
for (const [k, v] of Object.entries(M.ITEM_SPAWNS)) (Array.isArray(v[0]) ? v : [v]).forEach((p) => chk('item ' + k, p[0], p[1]));
chk('exit zone', 4, 24, 0.1);
// ascii dump
let out = '';
for (let cz = 0; cz < 70; cz++) { for (let cx = 0; cx < 80; cx++) out += nav.block[cz * 80 + cx] ? '#' : '.'; out += '\n'; }
if (process.argv[2]) console.log(out);
console.log(bad ? `${bad} problems` : `map ok: ${M.HIDES.length} hiding spots, ${M.STATIONS.length} stations, ${M.WALLS.length} wall boxes`);
process.exit(bad ? 1 : 0);
