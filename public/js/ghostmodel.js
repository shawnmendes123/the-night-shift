// "The patient from Room 3" - an articulated, procedurally animated 3D figure.
// Tall, starved, hospital gown in ribbons, head hanging off-axis under a curtain of wet hair,
// arms that reach past her knees. She moves in held poses, like a film missing frames.
import * as THREE from 'three';

function faceTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#8f8d84'; g.fillRect(0, 0, 256, 256);
  let s = 7; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${R() < 0.5 ? 30 : 170},${R() < 0.5 ? 28 : 165},${R() < 0.5 ? 24 : 150},${R() * 0.16})`; g.fillRect(R() * 256, R() * 256, 2, 2); }
  // sphere UV: u=0.5 is +Z... the face is drawn centred on u=0.75 after mapping (see head rotation below)
  g.translate(128, 0); g.scale(0.42, 1); // a sphere's texture wraps 360 degrees: keep the features on the front
  const cx = 0, eye = (x) => { const gr = g.createRadialGradient(x, 104, 2, x, 104, 26); gr.addColorStop(0, '#000'); gr.addColorStop(0.55, 'rgba(8,6,6,.95)'); gr.addColorStop(1, 'rgba(30,20,18,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, 104, 22, 28, 0, 0, 7); g.fill(); };
  eye(cx - 38); eye(cx + 38);
  g.fillStyle = 'rgba(12,8,8,.9)'; g.beginPath(); g.moveTo(cx - 5, 128); g.lineTo(cx + 5, 128); g.lineTo(cx + 3, 146); g.lineTo(cx - 3, 146); g.fill();
  g.strokeStyle = 'rgba(20,16,14,.6)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { let x = cx + (R() - 0.5) * 120, y = 60 + R() * 150; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (R() - 0.5) * 14; y += R() * 12; g.lineTo(x, y); } g.stroke(); }
  const gr = g.createLinearGradient(0, 150, 0, 256); gr.addColorStop(0, 'rgba(10,8,8,0)'); gr.addColorStop(0.4, 'rgba(6,4,4,.95)'); g.fillStyle = gr; g.beginPath(); g.ellipse(cx, 196, 30, 44, 0, 0, 7); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function gownAlpha() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  let s = 11; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = '#000';
  for (let x = 0; x < 256;) { const w = 6 + R() * 22, h = 20 + R() * 120; g.beginPath(); g.moveTo(x, 256); g.lineTo(x + w / 2, 256 - h); g.lineTo(x + w, 256); g.fill(); x += w * (0.5 + R() * 0.7); }
  for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(R() * 256, 90 + R() * 150, 2 + R() * 7, 6 + R() * 26, R(), 0, 7); g.fill(); }
  return new THREE.CanvasTexture(c);
}
function gownColor() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#6e6c62'; g.fillRect(0, 0, 256, 256);
  let s = 23; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let x = 0; x < 256; x += 16) { const gr = g.createLinearGradient(x, 0, x + 16, 0); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(0.5, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(0,0,0,.4)'); g.fillStyle = gr; g.fillRect(x, 0, 16, 256); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${40 + R() * 30},${26 + R() * 14},${14},${0.2 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * 256, R() * 256, 6 + R() * 30, 8 + R() * 40, R() * 3, 0, 7); g.fill(); }
  const gr = g.createLinearGradient(0, 120, 0, 256); gr.addColorStop(0, 'rgba(12,10,8,0)'); gr.addColorStop(1, 'rgba(12,10,8,.85)'); g.fillStyle = gr; g.fillRect(0, 120, 256, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lerp = (a, b, t) => a + (b - a) * t;
// Joins indexed geometries (position + normal) into one, so a whole lock of hair is a single draw call.
function mergeGeos(geos) {
  let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni); let vo = 0, io = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); const gi = g.index.array; for (let q = 0; q < gi.length; q++) idx[io + q] = gi[q] + vo; vo += g.attributes.position.count; io += gi.length; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1)); out.computeBoundingSphere();
  return out;
}
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

export class GhostModel {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    this.mats = [];
    const M = (o) => { const m = new THREE.MeshStandardMaterial({ transparent: true, ...o }); m.forceSinglePass = true; this.mats.push(m); return m; };
    const tex = new THREE.TextureLoader();
    const faceTex = tex.load('/assets/ghost-face.jpg'); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
    const clothTex = tex.load('/assets/ghost-gown.jpg'); clothTex.colorSpace = THREE.SRGBColorSpace;
    const skin = M({ color: 0x6e6b61, map: clothTex, bumpMap: clothTex, bumpScale: .001, roughness: 0.95 }), dark = M({ color: 0x0a0908, roughness: 0.7 });
    const hairM = M({ color: 0x070606, roughness: 0.85, side: THREE.DoubleSide });
    const gownM = M({ color: 0x9a9a94, map: clothTex, bumpMap: clothTex, bumpScale: 0.008, alphaMap: gownAlpha(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 });
    const faceM = M({ color: 0xa8a8a2, map: faceTex, bumpMap: faceTex, bumpScale: 0.002, roughness: 0.96 });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xd9e6ff, transparent: true }); this.eyeM = eyeM;
    const J = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    const limb = (parent, len, r0, r1, mat = skin) => { const shape=new THREE.CylinderGeometry(r0,r1,len,16,10), ps=shape.attributes.position;
      for(let i=0;i<ps.count;i++){const u=(ps.getY(i)+len/2)/len, bulge=.82+.22*Math.sin(u*Math.PI)+.14*Math.cos(u*Math.PI*4);ps.setX(i,ps.getX(i)*bulge);ps.setZ(i,ps.getZ(i)*bulge*.8);} shape.computeVertexNormals();
      const m = new THREE.Mesh(shape, mat); m.position.y = -len / 2; m.castShadow = true; parent.add(m); return m; };
    const j = (this.j = {});
    j.hips = J(this.root, 0, 1.12, 0);
    j.spine = J(j.hips, 0, 0, 0);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.62, 9), skin); torso.position.y = 0.31; torso.scale.z = 0.62; torso.castShadow = true; j.spine.add(torso);
    const bodM = M({ color: 0x9a9a94, map: clothTex, bumpMap: clothTex, bumpScale: 0.008, roughness: 1, side: THREE.DoubleSide });
    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.66, 12, 1, true), bodM); bodice.position.y = 0.3; bodice.scale.z = 0.68; bodice.castShadow = true; j.spine.add(bodice);
    for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.115 - i * 0.004, 0.011, 4, 12, Math.PI), skin); rib.position.set(0, 0.5 - i * 0.06, 0.012); rib.rotation.x = Math.PI / 2; rib.rotation.z = Math.PI; rib.scale.y = 0.7; j.spine.add(rib); }
    // gown: open cone with ragged, see-through hem
    const gown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.34, 1.02, 48, 16, true), gownM);
    const gp = gown.geometry.attributes.position;
    for (let i = 0; i < gp.count; i++) { const y = gp.getY(i), k = (0.51 - y) / 1.02, a = Math.atan2(gp.getZ(i), gp.getX(i)); const w = 1 + Math.sin(a * 5) * 0.09 * k + Math.sin(a * 11 + 1) * 0.05 * k; gp.setX(i, gp.getX(i) * w); gp.setZ(i, gp.getZ(i) * w * (0.72 + k * 0.2)); }
    gown.geometry.computeVertexNormals(); gown.position.y = -0.44; gown.castShadow = true; j.hips.add(gown); this.gown = gown; this.gownBase = gp.array.slice();
    j.chest = J(j.spine, 0, 0.6, 0);
    j.neck = J(j.chest, 0, 0.04, 0.01);
    limb(j.neck, -0.16, 0.035, 0.04).position.y = 0.08;
    j.head = J(j.neck, 0, 0.17, 0);
    // Continuous sculpt with recessed sockets and throat; front is +Z.
    const geo = new THREE.SphereGeometry(1, 80, 64), pos = geo.attributes.position, uv = geo.attributes.uv;
    const mask = [], bell = (x,y,cx,cy,sx,sy) => Math.exp(-(((x-cx)/sx)**2)-((y-cy)/sy)**2);
    for (let i=0;i<pos.count;i++) {
      const nx=pos.getX(i), ny=pos.getY(i), nz=pos.getZ(i); mask[i]=nz>-.025;
      let x=nx*.118*(1-Math.max(0,-ny)*.13), y=ny*.205, z=nz*.105;
      if(nz>0) {
        const nose=.025*bell(nx,ny,0,.29,.13,.22);
        const eyes=.016*(bell(nx,ny,-.37,.54,.23,.17)+bell(nx,ny,.37,.54,.23,.17));
        const cheeks=.014*(bell(nx,ny,-.53,.12,.19,.22)+bell(nx,ny,.53,.12,.19,.22));
        const throat=Math.exp(-((nx/.23)**4)-((ny+.32)/.42)**4);
        const rim=Math.sqrt((nx/.25)**2+((ny+.32)/.44)**2);
        z+=Math.min(1,nz*5)*(nose+cheeks+.009*Math.exp(-(((rim-1)/.12)**2))-eyes-.065*throat);
      }
      pos.setXYZ(i,x,y,z); uv.setXY(i,(nx+1)/2,(ny+1)/2);
    }
    const idx=geo.index, front=[], back=[];
    for(let i=0;i<idx.count;i+=3) {const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2); (mask[a]+mask[b]+mask[c]>=2?front:back).push(a,b,c);}
    geo.clearGroups(); geo.setIndex(front.concat(back));
    geo.computeVertexNormals();
    const open=pos.clone();
    for(let i=0;i<open.count;i++) open.setY(i,open.getY(i)-Math.max(0,Math.min(1,(-open.getY(i)+.02)/.18))*.035);
    geo.morphAttributes.position=[open];
    this.face = new THREE.Mesh(geo,faceM); this.face.position.y=.07; this.face.castShadow=true; j.head.add(this.face);
    j.jaw = J(j.head,0,.02,.02);
    this.eyes=[];
    for(const sx of [-1,1]) {const e=new THREE.Mesh(new THREE.SphereGeometry(.0022,8,6),eyeM); e.position.set(sx*.043,.181,.062);j.head.add(e);this.eyes.push(e);}
    // hair: long strips hanging over the face and shoulders
    this.hair = []; this.hairRoot = J(j.head, 0, 0, 0);
    for (let i = 0; i < 22; i++) {
      if (Math.cos((i/22)*Math.PI*2) > .45 && i % 5 !== 0) continue;
      const a = (i / 22) * Math.PI * 2 + (i % 2) * 0.1, front = Math.cos(a) > 0.2;
      const len = (front ? 0.5 : 0.85) + ((i * 37) % 10) * 0.03, wdt = 0.045 + ((i * 13) % 5) * 0.008;
      const pivot = J(this.hairRoot, Math.sin(a)*.100, .15+.08*(1-Math.abs(Math.sin(a))), Math.cos(a)*.095);
      pivot.rotation.y=a;
      const locks = [];
      for(let strand=0;strand<11;strand++) {
        const pts=[];
        for(let k=0;k<9;k++) {const t=k/8;pts.push(new THREE.Vector3((strand-5)*.003+Math.sin(t*11+i+strand)*.008,-t*len*(.85+(strand%4)*.08),Math.sin(t*4+strand*.3)*.025+t*.02));}
        locks.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),18,.0006+(strand%3)*.00025,3,false));
      }
      pivot.add(new THREE.Mesh(mergeGeos(locks), hairM)); // one draw per lock of hair, not one per strand
      this.hair.push({ pivot, a, ph: i * 1.7 });
    }
    const scalpGeo=new THREE.SphereGeometry(1,48,32), sp=scalpGeo.attributes.position;
    for(let i=0;i<sp.count;i++) {const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i);sp.setXYZ(i,x*.130,y*.225+.07,z*.123-.007);}
    // Remove front and lower triangles so the scalp hugs the crown and back.
    const si=scalpGeo.index, keep=[];
    for(let i=0;i<si.count;i+=3){const ids=[si.getX(i),si.getX(i+1),si.getX(i+2)];if(ids.every(k=>sp.getY(k)>(sp.getZ(k)>.025?.21:.035)))keep.push(...ids);}
    scalpGeo.setIndex(keep);scalpGeo.computeVertexNormals();const scalpMat=new THREE.MeshBasicMaterial({color:0x050505,transparent:true,side:THREE.DoubleSide});this.mats.push(scalpMat);j.head.add(new THREE.Mesh(scalpGeo,scalpMat));
    const shawl = new THREE.Mesh(new THREE.CylinderGeometry(.08,.25,.23,40,8,true),gownM);
    shawl.position.set(0,-.035,0); shawl.scale.z=.7; j.chest.add(shawl);
    // arms: too long
    for (const s of [-1, 1]) {
      const sh = (j['sh' + s] = J(j.chest, s * 0.2, -0.03, 0)); limb(sh, 0.5, 0.034, 0.028);
      const sleeve=limb(sh,.28,.058,.045,gownM);
      const el = (j['el' + s] = J(sh, 0, -0.5, 0)); limb(el, 0.54, 0.028, 0.022);
      const joint=new THREE.Mesh(new THREE.SphereGeometry(.028,12,10),skin); el.add(joint);
      const hand = (j['hand' + s] = J(el, 0, -0.54, 0));
      const palm = new THREE.Mesh(new THREE.SphereGeometry(1,16,12), skin); palm.scale.set(.035,.055,.014); palm.position.y = -0.045; hand.add(palm);
      j['fing' + s] = [];
      for (let f = 0; f < 4; f++) { const fj = J(hand, (f - 1.5) * 0.018, -0.09, 0); const seg = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.2, 10), skin); seg.rotation.x = Math.PI; seg.position.y = -0.1; fj.add(seg); fj.rotation.z = (f - 1.5) * 0.12 * 1; j['fing' + s].push(fj); }
      const hip = (j['hip' + s] = J(j.hips, s * 0.08, -0.02, 0)); limb(hip, 0.52, 0.045, 0.034);
      const kn = (j['kn' + s] = J(hip, 0, -0.52, 0)); limb(kn, 0.54, 0.034, 0.026);
      const ft = new THREE.Mesh(new THREE.SphereGeometry(.05,12,10), skin); ft.scale.set(.6,.4,2); ft.position.set(0, -0.55, 0.06); kn.add(ft);
    }
    this.qa = new THREE.Quaternion(); this.qb = new THREE.Quaternion(); this.qi = new THREE.Quaternion(); this.up = new THREE.Vector3(0, 1, 0);
    this.t = 0; this.yaw = 0; this.headYaw = 0; this.snapT = 0; this.cyc = 0; this.pose = {}; this.anim = 'idle'; this.vis = 0; this.q = 0; this.twitch = 0; this.stepCb = null; this.lastStep = 0;
    this.root.visible = false;
  }

  // Target joint angles for an animation at cycle time c. Returns a flat pose object.
  poseFor(anim, c, t) {
    const s = Math.sin, P = { hy: 1.12, spx: 0.38, spz: 0.04, chx: 0.1, nx: 0.25, nz: 0.55, hdy: 0, jaw: 0.12, shL: [0.1, 0, 0.1], shR: [0.1, 0, -0.1], elL: -0.15, elR: -0.15, hipL: 0, hipR: 0, knL: 0.05, knR: 0.05, fing: 0.35, lean: 0 };
    const w = c * Math.PI * 2;
    switch (anim) {
      case 'walk': { // limp: left leg steps, right leg drags behind
        const step = Math.max(0, s(w)), drag = Math.max(0, s(w + Math.PI));
        P.hipL = -0.55 * s(w) ; P.knL = 0.2 + step * 0.9; P.hipR = 0.28 - drag * 0.2; P.knR = 0.1 + drag * 0.25;
        P.hy = 1.1 - drag * 0.09 + step * 0.02; P.spz = 0.1 * s(w) + 0.06; P.spx = 0.42 + drag * 0.1; P.lean = 0.08 * s(w);
        P.shL = [0.25 * s(w + 1), 0, 0.12]; P.shR = [-0.1 + 0.12 * s(w), 0, -0.2]; P.elL = -0.2; P.elR = -0.35 - 0.1 * s(w);
        P.nz = 0.6 + 0.08 * s(w * 0.5); P.nx = 0.3; break;
      }
      case 'run': { // low, fast scuttle with both arms reaching
        P.hipL = -0.9 * s(w); P.hipR = 0.9 * s(w); P.knL = 0.5 + 0.7 * Math.max(0, s(w + 1)); P.knR = 0.5 + 0.7 * Math.max(0, s(w + 1 + Math.PI));
        P.hy = 0.98 + 0.03 * s(w * 2); P.spx = 0.95; P.chx = 0.25; P.nx = -0.95; P.nz = 0.18 * s(w * 0.5); P.jaw = 0.9;
        P.shL = [-1.9 + 0.15 * s(w), 0, 0.25]; P.shR = [-1.75 - 0.15 * s(w), 0, -0.25]; P.elL = -0.35 + 0.2 * s(w * 2); P.elR = -0.3 - 0.2 * s(w * 2); P.fing = -0.5; P.spz = 0.06 * s(w); break;
      }
      case 'stare': // unfolds to full height, head hanging sideways
        P.hy = 1.14; P.spx = 0.03; P.chx = 0; P.nx = 0.05; P.nz = 0.8 + 0.05 * s(t * 0.7); P.jaw = 0.25 + 0.2 * (0.5 + 0.5 * s(t * 0.4)); P.shL = [0, 0, 0.05]; P.shR = [0, 0, -0.05]; P.elL = P.elR = -0.03; P.fing = 0.1; break;
      case 'scream':
        P.spx = 0.7; P.chx = 0.3; P.nx = -0.75; P.nz = 0.1 * s(t * 40); P.jaw = 1.25; P.shL = [0.7, 0, 0.75]; P.shR = [0.7, 0, -0.75]; P.elL = P.elR = -0.5; P.fing = -0.7; P.hy = 1.02; P.knL = P.knR = 0.4; P.hipL = P.hipR = -0.25; break;
      case 'look':
        P.spx = 0.3; P.hdy = 2.3 * s(t * 2.4); P.nz = 0.3; P.nx = 0.1; P.elL = -0.6; P.shL = [-0.3, 0, 0.2]; break;
      case 'listen': // folds at the hips and lays her ear against the door
        P.spx = 1.05; P.chx = 0.2; P.nx = -0.7; P.nz = 1.35; P.hdy = 0.2; P.jaw = 0.3; P.shL = [-1.5, 0, 0.3]; P.elL = -0.9; P.shR = [0.2, 0, -0.1]; P.hy = 1.02; P.knL = P.knR = 0.3; P.hipL = P.hipR = -0.2; P.fing = -0.3 + 0.25 * s(t * 9); break;
      case 'reach':
        P.spx = 0.55; P.nx = -0.4; P.nz = 0.4; P.jaw = 0.7; P.shL = [-1.6, 0, 0.1]; P.shR = [-1.35, 0, -0.1]; P.elL = -0.1; P.elR = -0.3; P.fing = -0.6; break;
      case 'grab':
        P.spx = 0.75; P.chx = 0.3; P.nx = -0.6; P.nz = 0.3 * s(t * 30); P.jaw = 1.3; P.shL = [-1.45, 0, -0.35]; P.shR = [-1.45, 0, 0.35]; P.elL = P.elR = -1.0; P.fing = -1.0; P.hy = 1.04 + 0.02 * s(t * 25); break;
      case 'drag': { // walks on, one arm trailing behind with her catch, head turned fully round to watch it
        const step = Math.max(0, s(w)), drag = Math.max(0, s(w + Math.PI));
        P.hipL = -0.5 * s(w); P.knL = 0.2 + step * 0.8; P.hipR = 0.25 - drag * 0.2; P.knR = 0.1 + drag * 0.25; P.hy = 1.08 - drag * 0.08;
        P.spx = 0.5; P.spz = 0.1 * s(w); P.hdy = 2.85; P.nz = 0.35; P.nx = 0.1; P.jaw = 0.8; P.shR = [0.85, 0, -0.25]; P.elR = -0.1; P.shL = [0.2 * s(w), 0, 0.2]; P.fing = -0.9; break;
      }
      default: // idle: sways, fingers working
        P.spz = 0.05 + 0.04 * s(t * 0.8); P.nz = 0.55 + 0.1 * s(t * 0.5); P.fing = 0.2 + 0.3 * s(t * 3.1); P.hy = 1.11 + 0.008 * s(t * 1.1); P.elR = -0.3 + 0.1 * s(t * 0.9);
    }
    // Presentation phases fit inside the existing 1.3-second server capture.
    if (anim === 'grab') {
      const age=this.animAge||0, snap=Math.min(1,Math.max(0,(age-.18)/.12));
      P.nz=lerp(.9,-.22,snap)+Math.sin(t*47)*.045;
      P.nx=lerp(-.15,-.72,snap); P.jaw=lerp(.22,1.5,snap);
      P.spx=.65+snap*.18; P.hdy=Math.sin(t*19)*.045;
      P.elL=-.85-snap*.25; P.elR=-1.05; P.fing=-.7-snap*.5;
    }
    if (anim === 'drag' || anim === 'take') {
      if(anim==='take') {P.spx=.65;P.shR=[.9,0,-.25];P.elR=-.1;}
      P.hdy=3.04; P.nz=.42+Math.sin(t*2.3)*.07; P.nx=-.13;
      P.jaw=1.1; P.fing=-1.1;
    }
    return P;
  }

  // s: latest server ghost state (interpolated), speed in m/s, fy: floor height.
  update(dt, s, fy, speed) {
    this.t += dt;
    const anim = s.a, vis = s.v;
    this.root.visible = vis > 0.02;
    if (!this.root.visible) { this.vis = 0; return; }
    if (this.anim !== anim) {this.animAge = 0; this.q = -1;}
    this.animAge = (this.animAge || 0) + dt;
    this.anim = anim;
    // --- turning: the head finds you first, then the body catches up in jolts
    const d = angDiff(s.ry, this.yaw);
    this.snapT -= dt;
    if (Math.abs(d) > 2.6 || vis < 0.5) this.yaw = s.ry;
    else if (this.snapT <= 0 && Math.abs(d) > 0.9 && Math.random() < dt * 1.5) { this.yaw += Math.sign(d) * Math.min(Math.abs(d), 0.8); this.snapT = 1.2; } // occasional unnatural snap
    else this.yaw += Math.sign(d) * Math.min(Math.abs(d), (anim === 'run' ? 7 : 3.2) * dt);
    this.headYaw = lerp(this.headYaw, Math.max(-1.3, Math.min(1.3, angDiff(s.ry, this.yaw))), Math.min(1, dt * 14));
    // --- cycle advances with distance covered so feet do not skate
    const rate = anim === 'run' ? speed / 2.6 : anim === 'walk' || anim === 'drag' ? Math.max(0.35, speed / 1.5) : 0;
    const before = this.cyc; this.cyc += dt * rate;
    if (rate && this.stepCb) { if (Math.floor(before * 2) !== Math.floor(this.cyc * 2)) this.stepCb(Math.floor(this.cyc * 2) % 2 === 0 ? 'step' : anim === 'run' ? 'step' : 'drag'); }
    // --- pose held on "twos": time is quantised so motion jumps between poses
    const fps = anim === 'run' ? 40 : anim === 'grab' || anim === 'scream' ? 40 : 30;
    const q = Math.floor(this.t * fps);
    this.holdT = (this.holdT || 0) - dt;
    if (this.holdT <= 0 && anim !== 'run' && Math.random() < dt * 0.35) this.holdT = 0.1 + Math.random() * 0.14; // a dropped frame or two, rarely
    if (q !== this.q && this.holdT <= 0) {
      this.q = q;
      this.target = this.poseFor(anim, Math.floor(this.cyc * fps * 1.2) / (fps * 1.2), q / fps);
      this.twitch = Math.random() < 0.06 ? (Math.random() - 0.5) * 1.6 : this.twitch * 0.4; // sudden head jerk
    }
    const T = this.target || this.poseFor(anim, 0, 0), P = this.pose, k = Math.min(1, dt * 26);
    for (const key in T) { if (Array.isArray(T[key])) { P[key] ||= [0, 0, 0]; for (let i = 0; i < 3; i++) P[key][i] = lerp(P[key][i], T[key][i], k); } else P[key] = lerp(P[key] ?? T[key], T[key], k); }
    const j = this.j;
    j.hips.position.y = P.hy; j.hips.rotation.z = P.lean;
    j.spine.rotation.set(P.spx, 0, P.spz); j.chest.rotation.x = P.chx;
    j.neck.rotation.set(P.nx, this.headYaw * 0.5, 0); j.head.rotation.set(0, P.hdy + this.headYaw * 0.5, P.nz + this.twitch);
    for (const e of this.eyes) e.scale.setScalar(anim === 'grab' ? 0.75 : 1);
    this.face.morphTargetInfluences[0] = Math.min(1, P.jaw / 1.4);
    j['sh-1'].rotation.set(...P.shR); j.sh1.rotation.set(...P.shL); j['el-1'].rotation.x = P.elR; j.el1.rotation.x = P.elL;
    j['hip-1'].rotation.x = P.hipR; j.hip1.rotation.x = P.hipL; j['kn-1'].rotation.x = P.knR; j.kn1.rotation.x = P.knL;
    for (const sgn of [-1, 1]) j['fing' + sgn].forEach((f, i) => { f.rotation.x = P.fing + Math.sin(this.t * 7 + i * 1.3 + sgn) * 0.12; });
    for (const h of this.hair) h.pivot.rotation.x = Math.sin(this.t * 1.6 + h.ph) * 0.05 + (anim === 'run' ? -0.5 * Math.cos(h.a) : 0) - P.nx * 0.3 * Math.cos(h.a);
    // hair hangs with gravity whatever the head is doing
    j.head.getWorldQuaternion(this.qa); this.qb.setFromAxisAngle(this.up, this.yaw + this.headYaw + P.hdy);
    this.hairRoot.quaternion.identity();
    // gown hem sways
    const gp = this.gown.geometry.attributes.position, b = this.gownBase;
    for (let i = 0; i < gp.count; i++) { const y = b[i * 3 + 1], kk = Math.max(0, (0.3 - y) / 0.81); if (kk > 0) { gp.setX(i, b[i * 3] + Math.sin(this.t * 2.2 + b[i * 3 + 2] * 9) * 0.03 * kk); gp.setZ(i, b[i * 3 + 2] + Math.sin(this.t * 1.7 + b[i * 3] * 8) * 0.03 * kk - (rate ? 0.1 * kk : 0)); } }
    gp.needsUpdate = true;
    // --- appear / vanish: she pours up out of the floor, and folds back into it
    this.vis = vis;
    const e = vis * vis * (3 - 2 * vis);
    this.root.position.set(s.x, fy - (1 - e) * 0.15, s.z);
    this.root.rotation.y = this.yaw;
    this.root.scale.set(1 + (1 - e) * 0.5 + (vis < 1 ? Math.sin(this.t * 60) * 0.03 : 0), Math.max(0.03, e), 1 + (1 - e) * 0.5);
    for (const m of this.mats) m.opacity = Math.min(1, e * 1.3);
    const solid = e > 0.995; if (solid !== this._solid) { this._solid = solid; for (const m of this.mats) { if (m.isMeshBasicMaterial) continue; m.transparent = !solid; m.needsUpdate = true; } }
    this.eyeM.opacity = e;
  }
  headWorld(v) { return this.j.head.getWorldPosition(v); }
}
