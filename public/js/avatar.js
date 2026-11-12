// Other players: a simple articulated nurse in scrubs with a torch, name tag and carried item.
import * as THREE from 'three';

const SCRUBS = [0x3f6f6a, 0x5a6f8c, 0x7a5a6e, 0x6f7a4a, 0x8a6a48];
const lerp = (a, b, t) => a + (b - a) * t;

function nameSprite(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 30px "Courier New", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,.55)'; const w = g.measureText(name).width + 24; g.fillRect(128 - w / 2, 12, w, 40);
  g.fillStyle = '#d9d4c3'; g.fillText(name, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: true }));
  s.scale.set(0.9, 0.225, 1);
  return s;
}

export class Avatar {
  constructor(scene, id, name, itemMesh) {
    this.scene = scene; this.itemMesh = itemMesh;
    const col = SCRUBS[(id - 1) % SCRUBS.length];
    const cloth = new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }), dark = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: [0xb08a6e, 0x8a6248, 0xc9a58a, 0x6e4a36, 0xa97c5c][(id * 3) % 5], roughness: 0.8 });
    const g = (this.root = new THREE.Group()); scene.add(g);
    const J = (p, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); p.add(o); return o; };
    const box = (p, w, h, d, m, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; p.add(me); return me; };
    this.body = J(g, 0, 0.92, 0);
    this.torso = J(this.body, 0, 0, 0);
    box(this.torso, 0.4, 0.56, 0.22, cloth, 0, 0.3, 0); box(this.torso, 0.3, 0.34, 0.12, dark, 0, 0.32, -0.16); // backpack
    this.head = J(this.torso, 0, 0.62, 0);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin); h.position.y = 0.1; h.castShadow = true; this.head.add(h);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.117, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), dark); hair.position.y = 0.105; hair.rotation.x = -0.25; this.head.add(hair);
    this.arm = {}; this.leg = {}; this.knee = {};
    for (const s of [-1, 1]) {
      const a = (this.arm[s] = J(this.torso, s * 0.25, 0.52, 0)); box(a, 0.09, 0.3, 0.1, cloth, 0, -0.15, 0);
      const f = J(a, 0, -0.3, 0); box(f, 0.075, 0.28, 0.08, skin, 0, -0.14, 0); this['fore' + s] = f;
      const l = (this.leg[s] = J(this.body, s * 0.1, 0, 0)); box(l, 0.14, 0.46, 0.15, cloth, 0, -0.23, 0);
      const k = (this.knee[s] = J(l, 0, -0.46, 0)); box(k, 0.12, 0.44, 0.13, cloth, 0, -0.22, 0); box(k, 0.12, 0.06, 0.24, dark, 0, -0.44, 0.05);
    }
    // torch in the right hand
    const torch = J(this.fore1 ?? this['fore1'], 0, -0.3, 0.04);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.18, 8), dark); tb.rotation.x = Math.PI / 2; torch.add(tb);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 10), new THREE.MeshBasicMaterial({ color: 0xfff2d0 })); this.lens.position.z = 0.092; torch.add(this.lens);
    this.torch = null; // { p: [x,y,z], t: [x,y,z] } when their torch is on; main.js lends them a light
    this.held = J(this['fore-1'], 0, -0.3, 0.08); this.heldKind = null;
    this.tag = nameSprite(name); this.tag.position.y = 1.98; g.add(this.tag);
    this.cur = null; this.cyc = 0; this.lie = 0; this.crouch = 0;
  }
  // s: [id,x,z,ry,rx,mode,flash,status,spot,...]; fy: floor height at s; item: kind carried or null
  update(dt, s, fy, item, hideSelf, t) {
    const st = s[7];
    if (!this.cur) this.cur = { x: s[1], z: s[2], ry: s[3], rx: s[4] };
    const c = this.cur, k = 1, k2 = Math.min(1, dt * 12), far = Math.hypot(s[1] - c.x, s[2] - c.z) > 4;
    const px = c.x, pz = c.z;
    c.x = far ? s[1] : lerp(c.x, s[1], k); c.z = far ? s[2] : lerp(c.z, s[2], k);
    let d = s[3] - c.ry; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; c.ry += d * k; c.rx = lerp(c.rx, s[4], k);
    const speed = Math.hypot(c.x - px, c.z - pz) / Math.max(dt, 1e-3);
    this.root.visible = !hideSelf && (st === 'a' || st === 'c');
    if (!this.root.visible) { this.torch = null; return; }
    this.cyc += dt * Math.min(speed, 6) * 1.6;
    const sw = speed > 0.3 ? Math.sin(this.cyc) * Math.min(1, speed / 3) : 0;
    this.crouch = lerp(this.crouch, s[5] === 'crouch' ? 1 : 0, k2);
    this.lie = lerp(this.lie, st === 'c' ? 1 : 0, Math.min(1, dt * 6));
    const cr = this.crouch;
    this.root.position.set(c.x, fy, c.z); this.root.rotation.y = c.ry;
    this.body.position.y = 0.92 - cr * 0.34 - this.lie * 0.72 + Math.abs(sw) * 0.03;
    this.body.rotation.x = -this.lie * 1.45; // dragged on their back
    this.torso.rotation.x = cr * 0.5 + (s[5] === 'run' ? 0.22 : 0);
    this.head.rotation.x = -c.rx * 0.7 - cr * 0.3;
    for (const sd of [-1, 1]) {
      this.leg[sd].rotation.x = -sw * sd * 0.7 - cr * 1.0 + this.lie * 0.2; this.knee[sd].rotation.x = Math.max(0, sw * sd) * 0.9 + cr * 1.6;
      this.arm[sd].rotation.x = sd === 1 ? -0.9 - c.rx * 0.6 + this.lie * 3.0 : sw * 0.5 + (item ? -0.7 : 0) + this.lie * 2.8 + Math.sin(t * 17 + sd) * this.lie * 0.5;
    }
    this['fore1'].rotation.x = -0.5; this['fore-1'].rotation.x = item ? -0.9 : -0.15;
    if (item !== this.heldKind) { this.held.clear(); this.heldKind = item; if (item) { const m = this.itemMesh(item); m.rotation.x = -0.6; this.held.add(m); } }
    const on = s[6] && st === 'a';
    this.lens.visible = !!on;

    const ey = fy + 1.25 - cr * 0.4;
    this.torch = on ? { p: [c.x + Math.sin(c.ry) * 0.25, ey, c.z + Math.cos(c.ry) * 0.25], t: [c.x + Math.sin(c.ry) * Math.cos(c.rx) * 6, ey + Math.sin(c.rx) * 6, c.z + Math.cos(c.ry) * Math.cos(c.rx) * 6] } : null;
    this.tag.visible = st === 'a';
  }
  dispose() { this.scene.remove(this.root); }
}
