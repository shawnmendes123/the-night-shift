// Procedural textures and materials. Everything is painted on canvases at load - no image files.
import * as THREE from 'three';

let seed = 1337;
const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + R() * (b - a);

function mk(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); return c; }
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
const wrapX = (g, w, fn) => { for (const o of [-w, 0, w]) { g.save(); g.translate(o, 0); fn(); g.restore(); } };
function speckle(g, w, h, n, a, size = 2) {
  for (let i = 0; i < n; i++) { const v = R() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${R() * a})`; g.fillRect(R() * w, R() * h, R() * size + 0.5, R() * size + 0.5); }
}
function blob(g, x, y, r, fill, stroke) {
  g.beginPath();
  const n = 9 + ((R() * 6) | 0);
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rad = r * rr(0.55, 1.15); const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad * rr(0.7, 1.2); i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2; g.stroke(); }
}
function drips(g, w, h, n, col, y0 = 0) {
  for (let i = 0; i < n; i++) {
    const x = R() * w, len = rr(60, h * 0.7), wd = rr(3, 16), y = y0 + R() * h * 0.3;
    const gr = g.createLinearGradient(0, y, 0, y + len); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; wrapX(g, w, () => g.fillRect(x, y, wd, len));
  }
}
function cracks(g, w, h, n, col) {
  g.strokeStyle = col; g.lineWidth = 1;
  for (let i = 0; i < n; i++) { let x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += rr(-22, 22); y += rr(6, 30); g.lineTo(x, y); } g.stroke(); }
}
// Greyscale copy used as a bump map.
function bump(c, contrast = 1) {
  return mk(c.width, c.height, (g, w, h) => {
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, w, h), p = d.data;
    for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, ((p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) - 128) * contrast + 128)); p[i] = p[i + 1] = p[i + 2] = v; }
    g.putImageData(d, 0, 0);
  });
}

const painters = {
  wall(g, w, h) { // 3 m tall: plaster above, sick green dado below
    const dado = h * (1 - 1.15 / 3);
    g.fillStyle = '#a6a597'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#5b6c5c'; g.fillRect(0, dado, w, h - dado);
    g.fillStyle = '#39443a'; g.fillRect(0, dado - 5, w, 9);
    speckle(g, w, h, 14000, 0.07);
    for (let i = 0; i < 16; i++) { const x = R() * w, y = R() * h, r = rr(14, 60); wrapX(g, w, () => blob(g, x, y, r, R() < 0.5 ? 'rgba(196,190,172,.42)' : 'rgba(84,78,66,.42)', 'rgba(40,36,28,.5)')); }
    drips(g, w, h, 34, 'rgba(46,38,20,.2)');
    drips(g, w, h, 10, 'rgba(20,24,18,.3)', dado - 10);
    let gr = g.createLinearGradient(0, h - 90, 0, h); gr.addColorStop(0, 'rgba(15,14,10,0)'); gr.addColorStop(1, 'rgba(15,14,10,.72)'); g.fillStyle = gr; g.fillRect(0, h - 90, w, 90);
    gr = g.createLinearGradient(0, 0, 0, 70); gr.addColorStop(0, 'rgba(25,22,14,.5)'); gr.addColorStop(1, 'rgba(25,22,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, 70);
    cracks(g, w, h, 7, 'rgba(25,22,18,.6)');
  },
  concrete(g, w, h) {
    g.fillStyle = '#62645f'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 20000, 0.1, 3);
    for (let y = 0; y < h; y += h / 4) { g.fillStyle = 'rgba(20,20,18,.35)'; g.fillRect(0, y, w, 2); }
    for (let i = 0; i < 12; i++) { const x = R() * w, y = R() * h, r = rr(20, 70); wrapX(g, w, () => blob(g, x, y, r, 'rgba(30,34,30,.3)')); }
    drips(g, w, h, 40, 'rgba(18,22,18,.38)');
    drips(g, w, h, 8, 'rgba(110,60,25,.3)');
    const gr = g.createLinearGradient(0, h - 120, 0, h); gr.addColorStop(0, 'rgba(8,10,8,0)'); gr.addColorStop(1, 'rgba(8,10,8,.8)'); g.fillStyle = gr; g.fillRect(0, h - 120, w, 120);
  },
  floor(g, w, h) { // 2 m: 4x4 lino tiles
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const k = (i + j) % 2, v = rr(-7, 7);
      g.fillStyle = k ? `rgb(${104 + v},${110 + v},${98 + v})` : `rgb(${78 + v},${84 + v},${74 + v})`;
      g.fillRect(i * s, j * s, s, s);
      if (R() < 0.12) { g.fillStyle = 'rgba(20,18,14,.5)'; g.beginPath(); g.moveTo(i * s, j * s); g.lineTo(i * s + rr(20, 60), j * s); g.lineTo(i * s, j * s + rr(20, 60)); g.fill(); }
    }
    g.fillStyle = 'rgba(18,18,14,.75)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * s - 1.5, 0, 3, h); g.fillRect(0, i * s - 1.5, w, 3); }
    speckle(g, w, h, 12000, 0.09);
    for (let i = 0; i < 22; i++) blob(g, R() * w, R() * h, rr(10, 55), 'rgba(22,20,14,.26)');
    g.strokeStyle = 'rgba(200,200,190,.1)';
    for (let i = 0; i < 40; i++) { g.lineWidth = rr(0.5, 2); g.beginPath(); const x = R() * w, y = R() * h; g.moveTo(x, y); g.quadraticCurveTo(x + rr(-60, 60), y + rr(-60, 60), x + rr(-120, 120), y + rr(-120, 120)); g.stroke(); }
  },
  floorRough(g, w, h) { // dark = glossy (wet), light = dull
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 6000, 0.2, 3);
    for (let i = 0; i < 9; i++) blob(g, R() * w, R() * h, rr(30, 90), 'rgba(18,18,18,.85)');
    for (let i = 0; i < 14; i++) blob(g, R() * w, R() * h, rr(15, 50), 'rgba(215,215,215,.6)');
  },
  floorB(g, w, h) {
    g.fillStyle = '#3a3d3a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 22000, 0.12, 3);
    for (let i = 0; i < 20; i++) blob(g, R() * w, R() * h, rr(20, 80), R() < 0.5 ? 'rgba(10,12,10,.5)' : 'rgba(80,60,35,.22)');
    cracks(g, w, h, 8, 'rgba(8,8,8,.8)');
    g.fillStyle = 'rgba(10,10,10,.6)'; g.fillRect(0, h / 2 - 1, w, 3); g.fillRect(w / 2 - 1, 0, 3, h);
  },
  ceil(g, w, h) { // 2.4 m: 4x4 tiles
    const n = 4, s = w / n;
    g.fillStyle = '#8c8c82'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = rr(-10, 8); g.fillStyle = R() < 0.07 ? '#0c0d0c' : `rgb(${140 + v},${140 + v},${130 + v})`; g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4); }
    speckle(g, w, h, 9000, 0.12, 1.5);
    for (let i = 0; i < 8; i++) { const x = R() * w, y = R() * h, r = rr(20, 70); blob(g, x, y, r, 'rgba(92,66,30,.3)', 'rgba(60,40,15,.5)'); blob(g, x, y, r * 0.6, 'rgba(70,48,20,.26)'); }
    g.fillStyle = 'rgba(40,40,36,.9)';
    for (let i = 0; i <= n; i++) { g.fillRect(i * s - 2, 0, 4, h); g.fillRect(0, i * s - 2, w, 4); }
  },
  metal(g, w, h) {
    g.fillStyle = '#8f8e80'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, 0.08);
    for (let i = 0; i < 46; i++) blob(g, R() * w, R() * h, rr(2, 14), 'rgba(96,52,22,.55)');
    drips(g, w, h, 12, 'rgba(90,48,20,.3)');
    g.strokeStyle = 'rgba(30,30,26,.3)'; for (let i = 0; i < 26; i++) { g.beginPath(); const x = R() * w, y = R() * h; g.moveTo(x, y); g.lineTo(x + rr(-40, 40), y + rr(-8, 8)); g.stroke(); }
  },
  steel(g, w, h) {
    g.fillStyle = '#6f777c'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${R() < 0.5 ? 255 : 0},${R() < 0.5 ? 255 : 0},255,${R() * 0.05})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 14; i++) blob(g, R() * w, R() * h, rr(6, 30), 'rgba(40,34,26,.3)');
    drips(g, w, h, 10, 'rgba(70,45,25,.25)');
  },
  fabric(g, w, h) {
    g.fillStyle = '#a19f8f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(60,58,48,${R() * 0.12})`; g.fillRect(0, y, w, 1); }
    speckle(g, w, h, 6000, 0.06);
    for (let i = 0; i < 9; i++) { const x = R() * w, y = R() * h, r = rr(18, 70); blob(g, x, y, r, 'rgba(98,76,36,.3)', 'rgba(70,50,22,.35)'); }
    for (let i = 0; i < 4; i++) blob(g, R() * w, R() * h, rr(20, 50), 'rgba(40,22,16,.4)');
  },
  wood(g, w, h) {
    g.fillStyle = '#3a2e24'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) { const lt = R() < 0.5; g.strokeStyle = `rgba(${lt ? 84 : 14},${lt ? 66 : 10},${lt ? 48 : 6},${rr(0.05, 0.18)})`; g.lineWidth = rr(0.5, 2.5); const y = R() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rr(-8, 8), w * 0.6, y + rr(-8, 8), w, y); g.stroke(); }
    for (let i = 0; i < 10; i++) blob(g, R() * w, R() * h, rr(8, 30), 'rgba(12,9,6,.4)');
  },
  rust(g, w, h) {
    g.fillStyle = '#4c3222'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) blob(g, R() * w, R() * h, rr(4, 34), [`rgba(120,62,24,.45)`, 'rgba(26,18,12,.5)', 'rgba(78,84,78,.4)'][(R() * 3) | 0]);
    speckle(g, w, h, 12000, 0.14, 3);
    drips(g, w, h, 20, 'rgba(14,10,8,.4)');
  },
  enamel(g, w, h) {
    g.fillStyle = '#a9ada4'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, 0.06);
    drips(g, w, h, 16, 'rgba(110,62,20,.4)');
    for (let i = 0; i < 12; i++) blob(g, R() * w, R() * h, rr(6, 30), 'rgba(50,44,30,.35)');
  },
  curtain(g, w, h) {
    g.fillStyle = '#8f9684'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { const gr = g.createLinearGradient(x, 0, x + 32, 0); gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(0.5, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(0,0,0,.42)'); g.fillStyle = gr; g.fillRect(x, 0, 32, h); }
    for (let i = 0; i < 10; i++) blob(g, R() * w, rr(h * 0.4, h), rr(20, 70), 'rgba(60,50,30,.35)');
    const gr = g.createLinearGradient(0, h - 80, 0, h); gr.addColorStop(0, 'rgba(20,18,12,0)'); gr.addColorStop(1, 'rgba(20,18,12,.7)'); g.fillStyle = gr; g.fillRect(0, h - 80, w, 80);
  },
  door(g, w, h) {
    g.fillStyle = '#687863'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, 0.08);
    g.fillStyle = '#0a0d0c'; g.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.2);
    g.strokeStyle = 'rgba(160,170,160,.25)'; g.lineWidth = 1;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(w * 0.3 + i * w * 0.05, h * 0.12); g.lineTo(w * 0.3 + i * w * 0.05, h * 0.32); g.stroke(); g.beginPath(); g.moveTo(w * 0.3, h * 0.12 + i * h * 0.025); g.lineTo(w * 0.7, h * 0.12 + i * h * 0.025); g.stroke(); }
    g.strokeStyle = '#2c342c'; g.lineWidth = 5; g.strokeRect(w * 0.3, h * 0.12, w * 0.4, h * 0.2);
    g.fillStyle = '#585a52'; g.fillRect(0, h * 0.82, w, h * 0.18);
    for (let i = 0; i < 30; i++) blob(g, R() * w, rr(h * 0.5, h), rr(3, 16), 'rgba(40,30,18,.45)');
    drips(g, w, h, 12, 'rgba(30,26,16,.3)');
    g.strokeStyle = 'rgba(15,18,14,.8)'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
  },
  paper(g, w, h) {
    g.fillStyle = '#c9c4ae'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,40,60,.55)';
    for (let y = 14; y < h - 8; y += 9) g.fillRect(8, y, rr(w * 0.4, w - 18), 1.6);
    blob(g, R() * w, R() * h, 18, 'rgba(110,80,30,.3)');
  },
};

export function textSign(text, { w = 512, h = 128, bg = '#1c241e', fg = '#c9d2c2', font = 'bold 64px "Arial Narrow", Arial, sans-serif', border = true, sub } = {}) {
  const c = mk(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12); g.globalAlpha = 1; }
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2 + 3, w - 30);
    if (sub) { g.font = '22px "Courier New", monospace'; g.fillText(sub, w / 2, h * 0.78, w - 30); }
    speckle(g, w, h, 500, 0.12, 3);
  });
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
export function scrawl(text, color = 'rgba(70,8,6,.85)') {
  const c = mk(1024, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    let x = 60; const step = (w - 120) / text.length;
    for (const ch of text) { g.save(); g.translate(x, h / 2 + rr(-22, 22)); g.rotate(rr(-0.18, 0.18)); g.font = `${rr(96, 138) | 0}px "Courier New", monospace`; g.fillText(ch, 0, 0); g.restore(); x += step; }
    for (let i = 0; i < 12; i++) { const dx = R() * w, y = h * 0.55; const gr = g.createLinearGradient(0, y, 0, h); gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(dx, y, rr(2, 5), rr(40, 110)); }
  });
  const t = toTex(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeMaterials() {
  const M = {};
  const def = (name, size, uv, opts = {}, painter = name) => {
    seed = 1000 + name.length * 77 + name.charCodeAt(0);
    const c = mk(size, size, painters[painter]);
    const m = new THREE.MeshStandardMaterial({ map: toTex(c), bumpMap: toTex(bump(c, opts.bc ?? 1.4), false), bumpScale: opts.bs ?? 0.6, roughness: opts.rough ?? 0.9, metalness: opts.metal ?? 0, ...(opts.mat || {}) });
    m.userData.uv = uv;
    M[name] = m;
    return m;
  };
  def('wall', 1024, [3, 3], { rough: 0.93, bs: 1.2 });
  def('concrete', 512, [3, 2.8], { rough: 0.95, bs: 1.5 });
  const fl = def('floor', 1024, [2, 2], { rough: 1, bs: 0.5 });
  seed = 99; fl.roughnessMap = toTex(mk(512, 512, painters.floorRough), false); fl.roughness = 0.82;
  def('floorB', 512, [2.5, 2.5], { rough: 0.6, bs: 1.4 });
  def('ceil', 512, [2.4, 2.4], { rough: 1, bs: 0.8 });
  def('metal', 256, [1.2, 1.2], { rough: 0.62, metal: 0.25, bs: 0.5 });
  def('steel', 256, [1.5, 1.5], { rough: 0.62, metal: 0.35, bs: 0.3 });
  def('fabric', 256, [1.4, 1.4], { rough: 1, bs: 0.8 });
  def('wood', 256, [1.6, 1.6], { rough: 0.8, bs: 0.6 });
  def('rust', 256, [1.5, 1.5], { rough: 0.85, metal: 0.3, bs: 1.4 });
  def('enamel', 256, [1.4, 1.4], { rough: 0.35, bs: 0.3 });
  def('curtain', 256, [1, 2.2], { rough: 1, bs: 1.2, mat: { side: THREE.DoubleSide } });
  def('door', 512, [1, 1], { rough: 0.7, bs: 0.7 });
  def('paper', 128, [0.3, 0.3], { rough: 1, bs: 0 });
  M.black = new THREE.MeshBasicMaterial({ color: 0x000000 }); M.black.userData.uv = [1, 1];
  M.dark = new THREE.MeshStandardMaterial({ color: 0x0b0c0b, roughness: 0.9 }); M.dark.userData.uv = [1, 1];
  M.glass = new THREE.MeshStandardMaterial({ color: 0x1a2622, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 }); M.glass.userData.uv = [1, 1];
  M.red = new THREE.MeshStandardMaterial({ color: 0x5a1512, roughness: 0.6 }); M.red.userData.uv = [1, 1];
  return M;
}
