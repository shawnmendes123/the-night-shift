// The Night Shift - client: menus, networking, controls, HUD, camera, and gluing the pieces together.
import * as THREE from 'three';
import * as M from '/shared/map.js';
import { DIFF, SPEED, STAMINA, REACH } from '/shared/config.js';
import { World } from './world.js';
import { GhostModel } from './ghostmodel.js';
import { Avatar } from './avatar.js';
import { Sound } from './audio.js';
import { makePost } from './post.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const NOLOCK = Q.has('nolock');
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = {
  phase: 'menu', ws: null, id: null, code: null, lobby: null, debug: false, quality: Q.get('q') || localStorage.getItem('ns_quality') || null, sens: +(localStorage.getItem('ns_sens') || 1), dyn: 1, showFps: Q.has('fps'),
  world: null, snap: null, cfg: null, diff: 'medium',
  me: { x: 4, z: 18, ry: Math.PI, rx: 0, crouch: false, flash: true, stamina: STAMINA.max, mode: 'still', eye: M.EYE, bob: 0, stepD: 0, winded: false },
  st: 'a', spot: null, breath: 0, rescued: 0, spec: null, capT: 0, hideLook: { y: 0, x: 0 },
  g: { x: 0, z: 0, ry: 0, v: 0, a: 'idle', s: 'dormant', speed: 0 }, keys: {}, hold: null, note: false, showEv: false, fade: 0, fadeTo: 0, time: 0, sendT: 0, shake: 0, warn: 0,
};
window.NS = { S, THREE };
const snaps = []; // recent server snapshots, for smooth interpolation of other players and the ghost

// ====================================================================== renderer / scene
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); window.NS.renderer = renderer;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
const scene = new THREE.Scene(); window.NS.scene = scene;
scene.background = new THREE.Color(0x020303);
scene.fog = new THREE.FogExp2(0x060908, 0.072);
const camera = new THREE.PerspectiveCamera(72, 1, 0.06, 27); // the fog hides everything past ~22 m, so don't draw it
camera.rotation.order = 'YXZ';
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x33443c, 0x0c0b0a, 0.85));
const torch = new THREE.SpotLight(0xfff0d6, 0, 30, 0.7, 1.0, 1.0);
torch.position.set(0.2, -0.16, -0.62); torch.target.position.set(0.04, -0.04, -5);
camera.add(torch); camera.add(torch.target);
const torchFill = new THREE.PointLight(0xcfe0d6, 0, 7, 1.6); torchFill.position.set(0, 0.1, -0.7); camera.add(torchFill);
// Two shared lights for teammates' torches (a fixed number of lights avoids shader recompiles mid-game).
const mateTorches = [0, 1].map(() => { const l = new THREE.SpotLight(0xfff0d2, 0, 20, 0.6, 0.9, 1.0); scene.add(l); scene.add(l.target); return l; });
// viewmodel: the torch in your hand, and whatever you are carrying
const vm = new THREE.Group(); camera.add(vm);
{
  const dark = new THREE.MeshBasicMaterial({ color: 0x0b0c0d });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.2, 10), dark); b.rotation.x = Math.PI / 2; b.position.set(0.24, -0.2, -0.42); vm.add(b);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.06, 12), dark); h.rotation.x = Math.PI / 2; h.position.set(0.24, -0.2, -0.54); vm.add(h);
  const sl = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), new THREE.MeshBasicMaterial({ color: 0x121a19 })); sl.position.set(0.27, -0.27, -0.22); sl.rotation.x = 0.25; vm.add(sl);
}
const heldVm = new THREE.Group(); heldVm.position.set(-0.26, -0.24, -0.5); vm.add(heldVm);
let heldKind = null;

let world = null, ghost = null, post = null;
const avatars = new Map(); window.NS.avatars = avatars;
const sound = new Sound();
const shots = [];

function detectQuality() {
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    window.NS.gpu = name;
    return /intel|uhd|iris|hd graphics|swiftshader|llvmpipe|mali|adreno|powervr|apple gpu/i.test(name) && !/nvidia|geforce|rtx|radeon rx/i.test(name) ? 'medium' : 'high';
  } catch { return 'medium'; }
}
const basePR = () => (S.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : S.quality === 'medium' ? Math.min(window.devicePixelRatio || 1, 1) : 0.85);
function applyQuality() {
  const q = S.quality, shadows = q !== 'low';
  renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = q === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const ms = q === 'high' ? 1024 : 512;
  torch.castShadow = shadows; torch.shadow.mapSize.set(ms, ms); torch.shadow.camera.near = 0.3; torch.shadow.camera.far = 16; torch.shadow.bias = -0.002; torch.shadow.normalBias = 0.03;
  if (torch.shadow.map) { torch.shadow.map.dispose(); torch.shadow.map = null; }
  mateTorches[1].visible = q !== 'low';
  if (world) world.setPool(q);
  if (post && post.dispose) post.dispose();
  S.dyn = 1; S.perf = { acc: 0, n: 0, good: 0, lastDown: -99 };
  renderer.setPixelRatio(basePR());
  post = makePost(renderer, scene, camera, q);
  resize();
  precompile();
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  if (post) post.setSize(w, h);
}
// Dynamic resolution: render fewer pixels when frames run long, more when there is headroom.
function setDyn(v) {
  S.dyn = clamp(v, 0.55, 1);
  const pr = basePR() * S.dyn;
  renderer.setPixelRatio(pr); if (post) post.setPixelRatio(pr); resize();
}
function perfTick(dt) {
  const P = S.perf; if (!P || S.phase !== 'game' || document.hidden || Q.has('nodyn')) return;
  P.acc += dt; P.n++;
  if (P.acc < 1.5) return;
  const ms = (P.acc / P.n) * 1000; P.acc = 0; P.n = 0; S.fps = Math.round(1000 / ms);
  if (ms > 21 && S.dyn > 0.56) { setDyn(S.dyn - 0.1); P.good = 0; P.lastDown = S.time; }
  else if (ms < 17.6 && S.dyn < 1) { if (++P.good >= 3 && S.time - P.lastDown > 12) { setDyn(S.dyn + 0.05); P.good = 0; } }
  else P.good = 0;
}
// Compile every shader up front so nothing stalls the first time the ghost or an item comes into view.
function precompile() {
  if (!world || !ghost) return;
  const was = ghost.root.visible; ghost.root.visible = true;
  try { renderer.compile(scene, camera); } catch (e) { console.warn(e); }
  ghost.root.visible = was;
}
window.addEventListener('resize', resize);
function buildScene() {
  world = new World(scene, S.quality);
  world.setPool(S.quality);
  ghost = new GhostModel(scene);
  ghost.stepCb = (kind) => sound.ghostStep(S.g.x, M.floorY(S.g.x, S.g.z), S.g.z, kind);
}

// ====================================================================== network
function connect(code) {
  const name = $('name').value.trim() || 'Nurse';
  localStorage.setItem('ns_name', name);
  $('menuErr').textContent = '';
  sound.init();
  S.session = null; setSession(null);
  openSocket({ t: 'join', name, code });
}
// One live socket at a time. If it drops while we are in a shift, we reconnect and resume instead of quitting.
function openSocket(join) {
  const ws = (S.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host));
  ws.onopen = () => { S.lastRx = performance.now(); ws.send(JSON.stringify(join)); };
  ws.onmessage = (e) => { S.lastRx = performance.now(); onMsg(JSON.parse(e.data)); };
  ws.onclose = () => { if (S.ws !== ws) return; S.ws = null; lostConnection(); };
  ws.onerror = () => { if (!S.session && !S.recon) $('menuErr').textContent = 'Could not reach the server.'; };
}
function setSession(v) { try { v ? sessionStorage.setItem('ns_session', JSON.stringify(v)) : sessionStorage.removeItem('ns_session'); } catch {} }
function lostConnection() {
  if (S.session) return reconnect();
  if (S.phase !== 'menu') { show('menu'); $('menuErr').textContent = 'Connection to the server was lost.'; }
  S.id = null;
}
// Retry for about a minute (the server keeps your place for 75 s). Backs off gently: 0.5, 1, 2, 3, 3, 3 ... seconds.
function reconnect() {
  if (!S.session) return;
  if (!S.recon) { S.recon = { tries: 0, t0: performance.now() }; S.recon.showT = setTimeout(() => $('reconnect').classList.remove('hidden'), 1500); } // quick blips stay invisible
  const R = S.recon;
  if (performance.now() - R.t0 > 70000) return giveUp('Could not reconnect to the server. Check your internet, then host or join a new shift.');
  $('reconText').textContent = R.tries ? `Reconnecting... (attempt ${R.tries + 1})` : 'Reconnecting...';
  clearTimeout(R.timer);
  R.timer = setTimeout(() => { R.tries++; const s = S.session; if (s) openSocket({ t: 'join', name: s.name, code: s.code, resume: { id: s.id, key: s.key } }); }, [150, 600, 1200, 2000][R.tries] || 3000);
}
function reconnected() { if (S.recon) { clearTimeout(S.recon.timer); clearTimeout(S.recon.showT); } S.recon = null; $('reconnect').classList.add('hidden'); }
function giveUp(msg) {
  reconnected(); S.session = null; setSession(null);
  if (S.ws) { const w = S.ws; S.ws = null; w.onclose = null; try { w.close(); } catch {} }
  show('menu'); $('menuErr').textContent = msg; S.id = null;
}
// Heartbeat. Pings let both sides notice a dead connection fast; the periodic page request keeps a free host
// (which only counts new requests as activity) from putting the server to sleep in the middle of a round.
setInterval(() => {
  if (!S.ws || S.ws.readyState !== 1) return;
  send({ t: 'ping' });
  const quiet = performance.now() - (S.lastRx || 0);
  if (S.session && quiet > (S.phase === 'game' ? 6000 : 30000)) { const w = S.ws; S.ws = null; w.onclose = null; try { w.close(); } catch {} reconnect(); }
}, 3000);
setInterval(() => { if (S.session && S.ws && S.ws.readyState === 1) fetch('/health?k=' + Date.now(), { cache: 'no-store' }).catch(() => {}); }, 4 * 60 * 1000);
function send(m) { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(m)); }
window.NS.send = send;

function onMsg(m) {
  switch (m.t) {
    case 'err': if (S.recon || m.gone) { giveUp(m.msg); break; } $('menuErr').textContent = m.msg; S.ws && S.ws.close(); break;
    case 'welcome': S.id = m.id; S.code = m.code; S.debug = m.debug; S.session = { code: m.code, id: m.id, key: m.key, name: $('name').value.trim() || (S.session && S.session.name) || 'Nurse' }; setSession(S.session); if (m.resumed) { const long = S.recon && performance.now() - S.recon.t0 > 1500; reconnected(); if (S.phase === 'game' && long) toast('Reconnected.'); } history.replaceState(null, '', '?room=' + m.code + (NOLOCK ? '&nolock' : '')); break;
    case 'lobby': S.lobby = m; S.diff = m.diff; if (m.phase === 'lobby' && S.phase !== 'lobby') show('lobby'); renderLobby(); if (S.phase === 'end') renderEndButtons(); break;
    case 'start': startRound(m); break;
    case 'world': applyWorld(m.world); break;
    case 's': {
      S.snap = m;
      // server clock vs ours: keep the lowest-latency estimate, let it drift slowly if the network slows down
      const off = m.st - performance.now();
      if (S.clk === undefined || off > S.clk) S.clk = off; else { S.jit = lerp(S.jit || 0, S.clk - off, 0.05); S.clk -= 0.4; }
      snaps.push({ t: m.st, m }); if (snaps.length > 40) snaps.shift();
      break;
    }
    case 'ev': onEvent(m); break;
    case 'end': endRound(m); break;
    case 'debug': window.NS.dbg = m; break;
  }
}

// ====================================================================== screens
function show(phase) {
  S.phase = phase;
  for (const id of ['menu', 'lobby', 'end']) $(id).classList.toggle('hidden', id !== phase);
  $('hud').classList.toggle('hidden', phase !== 'game');
  if (phase !== 'game') { if (document.pointerLockElement) document.exitPointerLock(); S.fadeTo = 0; sound.setDrone(false); }
}
function renderLobby() {
  const L = S.lobby; if (!L) return;
  const host = L.host === S.id;
  $('lobbyCode').textContent = S.code;
  $('lobbyLink').textContent = location.origin + '/?room=' + S.code;
  $('roster').innerHTML = L.players.map((p) => `<li>${esc(p.name)}${p.id === L.host ? '<span class="tag">charge nurse (host)</span>' : ''}${p.id === S.id ? '<span class="tag">you</span>' : ''}${p.offline ? '<span class="tag">reconnecting</span>' : ''}</li>`).join('');
  $('diffs').innerHTML = Object.entries(DIFF).map(([k, d]) => `<button data-d="${k}" class="${k === L.diff ? 'on' : ''}" ${host ? '' : 'disabled'}>${d.label}</button>`).join('');
  const d = DIFF[L.diff];
  $('diffNote').textContent = `${d.quota} of 6 duties, ${Math.round(d.time / 60)} minutes, ${d.rescue}s to pull a caught teammate free${d.jammed ? `, ${Math.round(d.jammed * 100)}% of hiding spots jammed` : ''}.`;
  for (const b of $('quals').children) b.classList.toggle('on', b.dataset.q === S.quality);
  $('qualNote').textContent = { high: 'Shadows, bloom, sharpest image. Needs a dedicated graphics card.', medium: 'Shadows and the film look, no bloom. Best for most laptops.', low: 'No shadows or post effects. For older or very slow machines.' }[S.quality] + ' Resolution adjusts itself if frames drop.';
  $('sens').value = S.sens; $('sensVal').textContent = S.sens.toFixed(2) + 'x';
  $('btnStart').disabled = !host;
  $('lobbyNote').textContent = host ? (L.players.length < 2 ? 'You can start alone to practise. The shift is meant for 2-5.' : `${L.players.length} on shift.`) : 'Waiting for the host to start.';
}
$('diffs').addEventListener('click', (e) => { if (e.target.dataset.d) send({ t: 'diff', diff: e.target.dataset.d }); });
$('quals').addEventListener('click', (e) => { const q = e.target.dataset.q; if (!q || q === S.quality) return; S.quality = q; localStorage.setItem('ns_quality', q); applyQuality(); renderLobby(); });
$('sens').addEventListener('input', (e) => { S.sens = +e.target.value; localStorage.setItem('ns_sens', S.sens); $('sensVal').textContent = S.sens.toFixed(2) + 'x'; });
$('btnHost').onclick = () => connect('');
$('btnJoin').onclick = () => { const c = $('code').value.trim().toUpperCase(); if (c.length !== 4) { $('menuErr').textContent = 'Enter the 4-letter shift code.'; return; } connect(c); };
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnJoin').click(); });
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') ($('code').value ? $('btnJoin') : $('btnHost')).click(); });
$('btnStart').onclick = () => send({ t: 'start' });
$('btnCopy').onclick = () => { navigator.clipboard?.writeText(location.origin + '/?room=' + S.code); $('btnCopy').textContent = 'Copied'; setTimeout(() => ($('btnCopy').textContent = 'Copy link'), 1500); };
$('btnAgain').onclick = () => send({ t: 'lobby' });
$('name').value = localStorage.getItem('ns_name') || '';
if (Q.get('room')) $('code').value = Q.get('room').toUpperCase().slice(0, 4);

// ====================================================================== round start / end
function startRound(m) {
  if (m.resume && S.phase === 'game' && S.cfg) { snaps.length = 0; S.clk = undefined; applyWorld(m.world); return; }
  sound.init();
  S.cfg = m.cfg; S.diff = m.diff; S.snap = null; S.spec = null; S.st = 'a'; S.spot = null; S.note = false; S.hold = null; S.capT = 0; S.rescued = 0;
  Object.assign(S.me, { x: m.you.x, z: m.you.z, ry: m.you.ry, rx: 0, crouch: false, flash: true, stamina: STAMINA.max, mode: 'still', winded: false });
  S.g.v = 0; S.g.s = 'dormant';
  for (const a of avatars.values()) a.dispose(); avatars.clear();
  for (const id in world.doors) { const d = world.doors[id]; d.cur = d.tgt = m.world.doors[id][0]; d.g.rotation.y = d.cur ? d.open : d.closed; }
  applyWorld(m.world);
  $('toasts').innerHTML = ''; $('note').classList.add('hidden'); $('spectate').classList.add('hidden'); $('hideFx').classList.add('hidden');
  show('game');
  S.fade = 1; S.fadeTo = 0; sound.setDrone(true);
  if (!m.resume) toast('00:00 - NIGHT SHIFT BEGINS', 'big'); else toast('Reconnected to your shift.');
  if (!m.resume) toast(`Complete ${m.world.quota} duties. Find out what she wants. Clock out through the staff exit.`);
  snaps.length = 0; S.clk = undefined; S.jit = 0; hudCache.clear(); S.perf = { acc: 0, n: 0, good: 0, lastDown: -99 };
  precompile();
  if (!NOLOCK) canvas.requestPointerLock?.();
}
function endRound(m) {
  show('end');
  $('endTitle').textContent = m.win ? 'Clocked out' : m.reason === 'time' ? '06:00 - nobody clocked out' : 'No one left on shift';
  $('endText').textContent = m.win
    ? `The staff door closed behind you. In the morgue, ${m.ghost} lies with the doll that was kept from her.`
    : m.mystery ? `${m.ghost} had her child back, but the ward kept the staff.` : `The call light in Room 3 is still ringing. Nobody found out what ${m.ghost.split(' ')[0]} wanted.`;
  $('endRoster').innerHTML = m.players.map((p) => `<li class="${p.status === 'Taken' ? 'taken' : ''}">${esc(p.name)}<span class="tag">${p.status}</span></li>`).join('');
  $('endStats').textContent = `Duties ${m.duties}/${m.quota} required. Shift length ${Math.floor(m.elapsed / 60)}m ${m.elapsed % 60}s. Difficulty: ${DIFF[S.diff].label}.`;
  renderEndButtons();
  sound.ui(m.win ? 'task' : 'toll');
}
function renderEndButtons() { const host = S.lobby && S.lobby.host === S.id; $('btnAgain').classList.toggle('hidden', !host); $('endNote').textContent = host ? '' : 'Waiting for the host to reopen the sign-in sheet.'; }

// ====================================================================== world state + HUD
function myItem() { return S.world && S.world.items.find((i) => i.h === S.id); }
function applyWorld(w) {
  S.world = w; world.applyWorld(w); sound.doors = Object.fromEntries(Object.entries(w.doors).map(([k, v]) => [k, { open: !!v[0], locked: !!v[1] }]));
  $('dutyCount').textContent = `${Math.min(w.done, w.quota)}/${w.quota} needed`;
  $('duties').innerHTML = w.tasks.map((t) => `<li class="${t.done ? 'done' : ''}">${esc(t.label)}</li>`).join('');
  const has = (id) => w.clues.some((c) => c.id === id);
  const lines = [];
  if (w.exitOpen) lines.push(['CLOCK OUT: reach the staff exit.', 1]);
  else if (w.mystery) lines.push([`She has her child. Finish ${Math.max(0, w.quota - w.done)} more ${w.quota - w.done === 1 ? 'duty' : 'duties'} to unlock the exit.`, 1]);
  else {
    lines.push(['Find out who is still ringing for a nurse - and what she wants.', 0]);
    if (has('clue_log') || has('clue_orders')) lines.push(['She keeps asking for a doll.', 0]);
    if (has('clue_file')) lines.push(['Her name is in the admission file. Her body is in the morgue.', 0]);
    if (has('doll')) lines.push(['Bring the doll to her.', 1]);
  }
  $('objective').innerHTML = lines.map(([t, n]) => `<li class="${n ? 'new' : ''}">${esc(t)}</li>`).join('');
  $('clueCount').textContent = `evidence ${w.clues.length}/5`;
  $('evidence').innerHTML = w.clues.map((c) => `<li><b>${esc(c.title)}</b>${esc(c.short)}</li>`).join('') || '<li>No evidence yet. Read what the staff left behind.</li>';
  const it = myItem(), k = it ? it.k : null;
  $('held').innerHTML = it ? `Carrying: <b>${M.ITEM_NAMES[k]}</b>${it.txt ? ` (${esc(it.txt)})` : ''} <small>${k === 'bottle' ? 'click to throw, G to drop' : 'G to drop'}</small>` : '';
  if (k !== heldKind) { heldVm.clear(); heldKind = k; if (k) { const m = world.itemMesh(k); m.scale.setScalar(k === 'meds' ? 0.7 : 1.2); m.rotation.set(0.3, 0.6, 0); heldVm.add(m); } }
}
function toast(text, cls = '') {
  const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text; $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 5600);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
function showNote(title, body) { S.note = true; $('noteTitle').textContent = title; $('noteBody').textContent = body; $('note').classList.remove('hidden'); sound.ui('paper'); }
function closeNote() { S.note = false; $('note').classList.add('hidden'); }
const nameOf = (id) => (S.lobby && S.lobby.players.find((p) => p.id === id) || {}).name || 'Someone';

function onEvent(e) {
  const fy = (x, z) => M.floorY(x, z) + 1.2, G = S.g, gy = M.floorY(G.x, G.z) + 1.4;
  switch (e.k) {
    case 'toast': toast(e.text); break;
    case 'note': showNote(e.title, e.body); break;
    case 'tp': S.me.x = e.x; S.me.z = e.z; break;
    case 'door': sound.creak(e.x, fy(e.x, e.z), e.z, e.slam); if (e.slam) world.slam(e.id); break;
    case 'locked': sound.ui('locked'); toast(e.why === 'key' ? 'Locked. The basement key is kept in the Records office.' : 'Locked. Finish your duties and find out what she wants first.'); break;
    case 'unlock': sound.ui('unlock'); break;
    case 'power': sound.clunk(39.8, 1.4, 2.2, e.on); toast(e.on ? 'Power restored to the ward.' : 'The lights die. Something has thrown the breaker in Storage.', e.on ? '' : 'bad'); break;
    case 'task': sound.ui('task'); toast(`Duty done: ${e.label}${e.by ? ' (' + e.by + ')' : ''}`); break;
    case 'clue': toast(`Evidence: ${e.title}${e.by ? ' - found by ' + e.by : ''}`); break;
    case 'exitOpen': sound.ui('toll'); toast('The staff exit is unlocked', 'big'); toast('Clock out. Do not stop.'); break;
    case 'mystery': toast(e.name, 'big'); toast('She has her child back. She has not left.'); for (const r of M.ROOMS) world.flickerRoom(r.id, 3.5); sound.scream(33, M.FLOOR_B + 1.5, 33, 0.6); break;
    case 'wrong': sound.scream(e.x, fy(e.x, e.z), e.z, 1); world.flickerRoom('morgue', 3); world.flickerRoom('bcorr', 3); toast('That is not her. She heard that.', 'bad'); break;
    case 'pickup': if (e.pid === S.id) sound.ui('pick'); break;
    case 'drop': sound.thud(e.x, fy(e.x, e.z) - 1, e.z, e.item === 'bottle' ? 1.2 : 0.8); break;
    case 'throw': { const m = world.itemMesh('bottle'); scene.add(m); shots.push({ m, x: e.x, z: e.z, tx: e.tx, tz: e.tz, t: 0, fly: e.fly }); break; }
    case 'shatter': sound.shatter(e.x, fy(e.x, e.z) - 1, e.z); break;
    case 'hide': case 'unhide': if (e.pid !== S.id) sound.creak(e.x, fy(e.x, e.z), e.z); else sound.ui('pick'); break;
    case 'gasp': if (e.pid === S.id) { sound.ui('gasp'); toast('You gasp for air.', 'bad'); } else sound.thud(e.x, fy(e.x, e.z), e.z, 0.6); break;
    case 'notice': sound.scream(G.x, gy, G.z, 0.9); if (e.pid === S.id) { S.shake = 0.5; sound.sting(); } break;
    case 'alert': sound.knock(G.x, gy, G.z); break;
    case 'search': if (S.spot === e.spot) { S.warn = 4; sound.ui('scratch'); } break;
    case 'listen': if (S.spot === e.spot) { S.warn = 4; toast('She is listening. Hold your breath.', 'bad'); } break;
    case 'open': { const h = M.hideById(e.spot); sound.creak(h.x, fy(h.x, h.z), h.z, true); break; }
    case 'appear': case 'vanish': sound.buzz(G.x, gy, G.z); break;
    case 'grab':
      sound.grabScream(e.pid === S.id, e.x, fy(e.x, e.z), e.z);
      if (e.pid === S.id) { S.capT = 0; S.shake = 1.6; S.scare = 1; sound.sting(); S.hold = null; closeNote(); }
      else toast(`${nameOf(e.pid)} has been caught! Get to them and hold E to pull them free.`, 'bad');
      break;
    case 'drag': S.dragWin = e.win; if (e.pid === S.id) toast(e.win > 1.3 ? 'She is dragging you away. A teammate can still pull you free.' : 'She is dragging you away.', 'bad'); break;
    case 'take': if (e.pid === S.id) S.fadeTo = 1; break;
    case 'taken':
      toast(`${e.name} was taken. ${e.quota} duties now needed; the shift is extended.`, 'bad');
      if (e.pid === S.id) { S.st = 'd'; setTimeout(() => { S.fadeTo = 0; pickSpectate(1); }, 900); }
      break;
    case 'rescued': sound.ui('free'); toast(`${e.byName} pulled ${e.name} free. She will not let go a second time.`); if (e.pid === S.id) { S.me.x = e.x; S.me.z = e.z; S.fadeTo = 0; } break;
    case 'escaped': toast(`${e.name} clocked out.`); if (e.pid === S.id) { S.st = 'e'; pickSpectate(1); } break;
    case 'callOff': sound.clunk(e.x, 1.3, e.z, false); break;
    case 'scare': {
      const y = fy(e.x, e.z);
      if (e.kind === 'flicker' && e.room) { world.flickerRoom(e.room, 2.6); sound.buzz(S.me.x, y, S.me.z); }
      else if (e.kind === 'knock') sound.knock(e.x, y, e.z);
      else if (e.kind === 'whisper') { if (e.pid === S.id) sound.whisper(Math.random() < 0.5 ? -0.8 : 0.8); }
      else if (e.kind === 'bell') sound.bell(17.5, 1.5, 5, 0.8);
      else if (e.kind === 'steps') for (let i = 0; i < 5; i++) setTimeout(() => sound.ghostStep(e.x + i * 0.5, y - 1.2, e.z, i % 2 ? 'drag' : 'step'), i * 520);
      break;
    }
  }
}

// ====================================================================== input
function locked() { return NOLOCK || document.pointerLockElement === canvas; }
canvas.addEventListener('click', () => { if (S.phase === 'game' && !locked()) canvas.requestPointerLock?.(); });
$('paused').addEventListener('click', () => canvas.requestPointerLock?.());
document.addEventListener('mousemove', (e) => {
  if (S.phase !== 'game' || document.pointerLockElement !== canvas) return;
  const sx = e.movementX * 0.0022 * S.sens, sy = e.movementY * 0.0022 * S.sens;
  if (S.st === 'h') { S.hideLook.y = clamp(S.hideLook.y - sx, -1.25, 1.25); S.hideLook.x = clamp(S.hideLook.x - sy, -0.6, 0.6); }
  else if (S.st === 'a') { S.me.ry -= sx; S.me.rx = clamp(S.me.rx - sy, -1.45, 1.45); }
});
document.addEventListener('mousedown', (e) => {
  if (S.phase !== 'game' || !locked() || e.button !== 0) return;
  if (S.st === 'd' || S.st === 'e') return pickSpectate(1);
  if (S.st === 'a') { const it = myItem(); if (it && it.k === 'bottle') send({ t: 'throw', pitch: S.me.rx }); }
});
document.addEventListener('keydown', (e) => {
  if (S.phase !== 'game') return;
  if (e.code === 'F3') { e.preventDefault(); S.showFps = !S.showFps; return; }
  if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat) { S.showEv = !S.showEv; $('evidence').classList.toggle('hidden', !S.showEv); } return; }
  if (e.repeat) return;
  S.keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
  if (S.st === 'd' || S.st === 'e') { if (e.code === 'KeyA' || e.code === 'ArrowLeft') pickSpectate(-1); if (e.code === 'KeyD' || e.code === 'ArrowRight' || e.code === 'Space') pickSpectate(1); return; }
  if (e.code === 'KeyE') pressUse();
  else if (e.code === 'KeyF') { S.me.flash = !S.me.flash; sound.ui('pick'); }
  else if (e.code === 'KeyC') S.me.crouch = !S.me.crouch;
  else if (e.code === 'KeyG' && S.st === 'a') send({ t: 'drop' });
  else if (e.code === 'Space' && S.st === 'h') send({ t: 'breath', h: true });
});
document.addEventListener('keyup', (e) => {
  S.keys[e.code] = false;
  if (e.code === 'KeyE') S.hold = null;
  if (e.code === 'Space' && S.st === 'h') send({ t: 'breath', h: false });
});
window.addEventListener('blur', () => { S.keys = {}; S.hold = null; });

// What E would act on right now.
function findTarget() {
  const w = S.world, me = S.me; if (!w || S.st !== 'a') return null;
  const fx = Math.sin(me.ry), fz = Math.cos(me.ry), it = myItem(), held = it ? it.k : null;
  let best = null;
  const consider = (x, z, reach, o) => {
    const dx = x - me.x, dz = z - me.z, d = Math.hypot(dx, dz);
    if (d > reach) return;
    const ang = d < 0.5 ? 0 : Math.acos(clamp((dx * fx + dz * fz) / d, -1, 1));
    if (ang > 0.95) return;
    const score = ang + d * 0.25 + (o.pri || 0);
    if (!best || score < best.score) best = { ...o, x, z, score };
  };
  if (S.snap) for (const p of S.snap.p) if (p[0] !== S.id && p[7] === 'c' && S.g.s === 'drag') consider(p[1], p[2], 2.6, { kind: 'rescue', id: p[0], label: `Pull ${nameOf(p[0])} free`, hold: 0.7, pri: -2 });
  for (const d of M.DOORS) {
    if (d.arch) continue;
    const [open, lockd] = w.doors[d.id], c = M.doorPos(d);
    let label = open ? 'Close door' : 'Open door', no = false;
    if (lockd) { if (d.lock === 'key' && held === 'key') label = 'Unlock with the basement key'; else { label = d.lock === 'exit' ? 'Staff exit - locked' : 'Locked'; no = true; } }
    consider(c.x, c.z, REACH, { kind: 'door', id: d.id, label, no });
  }
  for (const i of w.items) if (!i.h) consider(i.x, i.z, REACH, { kind: 'item', id: i.id, label: `${held ? 'Swap for' : 'Pick up'} ${M.ITEM_NAMES[i.k].toLowerCase()}`, pri: -0.3 });
  for (const s of M.STATIONS) {
    let o = null;
    if (s.k === 'clue') o = { label: 'Read' };
    else if (s.k === 'call') o = { label: w.callOn ? 'Answer the call light' : 'Read the call panel' };
    else if (s.k === 'breaker') { if (!w.power) o = w.fuseFitted ? { label: 'Reset the breaker', hold: 2.5, work: 1 } : held === 'fuse' ? { label: 'Fit the fuse and throw the breaker', hold: 2.5, work: 1 } : { label: 'Breaker - no fuse fitted', no: true }; }
    else if (s.k === 'medcab') { if (!w.tasks.find((t) => t.id === 'meds').done) o = held === 'meds' ? { label: 'Put the medicine case away' } : { label: 'Medicine cabinet - the case is missing', no: true }; }
    else if (s.k === 'slot') { if (held === 'chart') o = { label: `Clip the chart to Bed ${s.n}` }; }
    else if (s.k === 'drawer') { if (!w.mystery) o = held === 'doll' ? (w.tried.includes(s.n) ? { label: `Drawer ${s.n} - not her`, no: true } : { label: `Lay the doll in drawer ${s.n} (${w.drawers[s.n - 1]})`, hold: 1.2 }) : { label: `Read the tag on drawer ${s.n}` }; }
    if (o) consider(s.x, s.z, REACH + 0.2, { kind: 'station', id: s.id, pri: -0.2, ...o });
  }
  for (const h of M.HIDES) {
    if (Math.hypot(h.ex - me.x, h.ez - me.z) > 1.7) continue;
    const jam = w.jammed.includes(h.id), occ = S.snap && S.snap.p.some((p) => p[8] === h.id);
    consider(h.x, h.z, 2.6, { kind: 'hide', id: h.id, label: jam ? 'Jammed shut' : occ ? 'Someone is hiding here' : `Hide ${M.HIDE_NAMES[h.type]}`, no: jam || occ, pri: 0.15 });
  }
  return best;
}
function fire(t) {
  if (t.kind === 'rescue') send({ t: 'rescue', pid: t.id });
  else send({ t: 'use', kind: t.kind, id: t.id });
  if (t.kind === 'hide') { S.hideLook.x = S.hideLook.y = 0; }
}
function pressUse() {
  if (S.note) return closeNote();
  if (S.st === 'h') return send({ t: 'unhide' });
  const t = findTarget(); if (!t) return;
  if (t.no) { if (t.kind === 'door' || t.kind === 'station') fire(t); else sound.ui('locked'); return; }
  if (t.hold) S.hold = { key: t.kind + t.id, t: 0, t0: performance.now(), need: t.hold, work: t.work, workT: 0, still: t.kind !== 'rescue' };
  else fire(t);
}
window.NS.use = pressUse; window.NS.target = findTarget;

function pickSpectate(dir) {
  if (!S.snap) return;
  const live = S.snap.p.filter((p) => p[0] !== S.id && (p[7] === 'a' || p[7] === 'h' || p[7] === 'c')).map((p) => p[0]);
  if (!live.length) { S.spec = null; return; }
  const i = live.indexOf(S.spec);
  S.spec = live[(i + dir + live.length) % live.length];
}

// ====================================================================== simulation
function collide(me) {
  const r = 0.28, w = S.world;
  const push = (b) => {
    const cx = clamp(me.x, b.x0, b.x1), cz = clamp(me.z, b.z0, b.z1), dx = me.x - cx, dz = me.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); me.x = cx + (dx / d) * r; me.z = cz + (dz / d) * r; }
    else { const l = me.x - b.x0, rr = b.x1 - me.x, t = me.z - b.z0, bb = b.z1 - me.z, m = Math.min(l, rr, t, bb); if (m === l) me.x = b.x0 - r; else if (m === rr) me.x = b.x1 + r; else if (m === t) me.z = b.z0 - r; else me.z = b.z1 + r; }
  };
  for (let k = 0; k < 2; k++) {
    for (const b of M.SOLID) push(b);
    if (w) for (const d of M.DOORS) if (!d.arch && !w.doors[d.id][0]) push(M.doorBox(d, 0.07));
  }
}

function updateSelf(dt) {
  const me = S.me, k = S.keys, row = S.snap && S.snap.p.find((p) => p[0] === S.id);
  if (row) {
    const st = row[7];
    if (st !== S.st && !(S.st === 'd' && st !== 'd')) {
      if (st === 'h') { S.spot = row[8]; const h = M.hideById(S.spot); me.x = h.x; me.z = h.z; $('hideFx').className = h.type === 'wardrobe' || h.type === 'cupboard' ? 'slats' : h.type === 'bathtub' ? '' : 'low'; }
      else { $('hideFx').className = 'hidden'; if (S.st === 'h' && st === 'a') { const h = M.hideById(S.spot); me.x = h.ex; me.z = h.ez; me.ry = Math.atan2(h.fx, h.fz); me.rx = 0; } S.spot = null; S.warn = 0; }
      if (st === 'a' && S.st === 'c') { me.x = row[1]; me.z = row[2]; }
      S.st = st;
    }
    S.breath = row[9]; S.rescued = row[11];
    if (st === 'c') { me.x = lerp(me.x, row[1], Math.min(1, dt * 12)); me.z = lerp(me.z, row[2], Math.min(1, dt * 12)); }
  }
  if (S.st === 'a' && locked() && !S.note) {
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const moving = f || s;
    const wantRun = (k.ShiftLeft || k.ShiftRight) && moving && !me.crouch && !me.winded && f >= 0;
    if (wantRun) { me.stamina -= dt; if (me.stamina <= 0) { me.stamina = 0; me.winded = true; } }
    else { me.stamina = Math.min(STAMINA.max, me.stamina + dt * STAMINA.regen * (moving ? 1 : 1.6)); if (me.stamina > 1.5) me.winded = false; }
    me.mode = !moving ? 'still' : wantRun ? 'run' : me.crouch ? 'crouch' : 'walk';
    let tvx = 0, tvz = 0;
    if (moving && !(S.hold && S.hold.still)) {
      const sp = SPEED[me.mode] * (myItem() && myItem().k === 'meds' ? 0.92 : 1), fx = Math.sin(me.ry), fz = Math.cos(me.ry), n = Math.hypot(f, s);
      tvx = ((fx * f - fz * s) / n) * sp; tvz = ((fz * f + fx * s) / n) * sp;
    }
    const acc = 1 - Math.exp(-dt * (moving ? 14 : 18));
    me.vx = lerp(me.vx || 0, tvx, acc); me.vz = lerp(me.vz || 0, tvz, acc);
    if (Math.hypot(me.vx, me.vz) > 0.02) {
      const ox = me.x, oz = me.z;
      me.x += me.vx * dt; me.z += me.vz * dt;
      collide(me);
      if (dt > 0) { me.vx = (me.x - ox) / dt; me.vz = (me.z - oz) / dt; } // walls take the speed out
      const moved = Math.hypot(me.x - ox, me.z - oz);
      me.stepD += moved; me.bob += moved * (me.mode === 'run' ? 1.5 : 2.3);
      const stride = me.mode === 'run' ? 1.5 : me.mode === 'crouch' ? 0.9 : 1.05;
      if (me.stepD > stride) { me.stepD = 0; sound.step(0, 0, 0, me.mode === 'run' ? 0.5 : me.mode === 'crouch' ? 0.05 : 0.22, true); }
    } else { me.vx = me.vz = 0; if (S.hold && S.hold.still) me.mode = 'still'; }
  } else { me.vx = me.vz = 0; if (S.st === 'a') me.mode = 'still'; }
  // hold-to-use
  if (!S.hold && S.keys.KeyE && S.st === 'a') { const t = findTarget(); if (t && t.kind === 'rescue') S.hold = { key: t.kind + t.id, t: 0, t0: performance.now(), need: t.hold, workT: 0, still: false }; }
  if (S.hold) {
    const t = findTarget();
    if (!t || t.kind + t.id !== S.hold.key || t.no) S.hold = null;
    else { S.hold.t = (performance.now() - S.hold.t0) / 1000; if (S.hold.work) { S.hold.workT -= dt; if (S.hold.workT <= 0) { S.hold.workT = 0.7; send({ t: 'noise' }); sound.thud(t.x, 1.4, t.z, 0.8); } } if (S.hold.t >= S.hold.need) { fire(t); S.hold = null; } }
  }
  S.sendT -= dt;
  if (S.sendT <= 0 && (S.st === 'a' || S.st === 'h')) {
    S.sendT = 1 / 20;
    const hl = S.st === 'h' ? S.hideLook : null, h = hl && M.hideById(S.spot);
    send({ t: 'pos', x: +me.x.toFixed(3), z: +me.z.toFixed(3), ry: +(h ? Math.atan2(h.fx, h.fz) + hl.y : me.ry).toFixed(3), rx: +(hl ? hl.x : me.rx).toFixed(3), m: me.mode, f: me.flash && S.st === 'a' ? 1 : 0 });
  }
}

const tmpV = new THREE.Vector3();
function updateCamera(dt) {
  const me = S.me, G = S.g;
  let x = me.x, z = me.z, y, ry = me.ry, rx = me.rx, roll = 0, torchOn = me.flash, showVm = true;
  if (S.st === 'h' && S.spot) {
    const h = M.hideById(S.spot), fy = M.floorY(h.x, h.z), low = h.type === 'bed' || h.type === 'table';
    x = h.x + h.fx * (low ? 0.1 : 0.12); z = h.z + h.fz * (low ? 0.1 : 0.12);
    y = fy + (low ? 0.27 : h.type === 'bathtub' ? 0.66 : 1.38);
    ry = Math.atan2(h.fx, h.fz) + S.hideLook.y; rx = S.hideLook.x; torchOn = false; showVm = false;
  } else if (S.st === 'c') {
    S.capT += dt;
    const fy = M.floorY(x, z);
    ghost.headWorld(tmpV);
    if (G.a === 'grab') { // she hauls your face up to hers
      const k = Math.min(1, S.capT / 0.1), dx = x - tmpV.x, dz = z - tmpV.z, d = Math.hypot(dx, dz) || 1, near = 0.36 - Math.min(1, Math.max(0, (S.capT - 0.18) / 0.12)) * 0.065 + (REDUCED ? 0 : Math.sin(S.time * 31) * 0.008);
      x = lerp(x, tmpV.x + (dx / d) * near, k); z = lerp(z, tmpV.z + (dz / d) * near, k); y = lerp(fy + me.eye, tmpV.y + 0.07, k);
    } else {
      // Ground-level hauling: a slow fall, then uneven shoulder impacts.
      const fall = Math.min(1, Math.max(0, (S.capT - 1.3) / .22));
      y = fy + lerp(.66, .23, fall) + (REDUCED ? 0 : Math.pow(Math.max(0, Math.sin(S.time*8)), 6)*.045);
    }
    ry = Math.atan2(tmpV.x - x, tmpV.z - z); rx = Math.atan2(tmpV.y + 0.07 - y, Math.hypot(tmpV.x - x, tmpV.z - z));
    S.shake = Math.max(S.shake, 0.55); roll = REDUCED ? 0 : G.a === 'grab' ? Math.sin(S.time * 23) * 0.055 : -.19 + Math.sin(S.time * 6.2) * .085; torchOn = Math.random() < 0.4; showVm = false;
  } else if ((S.st === 'd' || S.st === 'e') && S.spec && avatars.get(S.spec)) {
    const a = avatars.get(S.spec), row = S.snap.p.find((p) => p[0] === S.spec), c = a.cur;
    if (row && row[7] === 'h') { const h = M.hideById(row[8]); x = h.x; z = h.z; y = M.floorY(x, z) + (h.type === 'bed' || h.type === 'table' ? 0.27 : 1.38); ry = c.ry; rx = c.rx; }
    else { x = c.x; z = c.z; y = M.floorY(x, z) + (row && row[5] === 'crouch' ? 1.0 : M.EYE) - (row && row[7] === 'c' ? 1.1 : 0); ry = c.ry; rx = c.rx; }
    torchOn = false; showVm = false;
  } else {
    me.eye = lerp(me.eye, me.crouch ? 1.0 : M.EYE, Math.min(1, dt * 9));
    y = M.floorY(x, z) + me.eye + Math.sin(me.bob * 2) * (me.mode === 'run' ? 0.05 : 0.022);
    roll = Math.sin(me.bob) * 0.006;
    if (S.st === 'd' || S.st === 'e') { torchOn = false; showVm = false; }
  }
  S.shake = Math.max(0, S.shake - dt * 1.2);
  const sh = S.shake * 0.05;
  camera.position.set(x + (Math.random() - 0.5) * sh, y + (Math.random() - 0.5) * sh, z + (Math.random() - 0.5) * sh);
  camera.rotation.set(rx + (Math.random() - 0.5) * sh, ry + Math.PI + (Math.random() - 0.5) * sh, roll);
  // torch: flickers when she is close - the oldest warning there is
  const gd = Math.hypot(G.x - x, G.z - z), near = G.v > 0.3 && gd < 7;
  const fl = near && Math.random() < 0.3 - gd * 0.03 ? 0.15 : 1;
  torch.intensity = torchOn ? 26 * fl : 0; torchFill.intensity = torchOn ? 0.9 * fl : S.st === 'h' ? 1.1 : 0.4;
  if (S.st === 'c' && G.a === 'grab') { torchFill.position.set(0.05, -0.12, 0.02); torchFill.distance = 2.2; torchFill.color.setHex(0xdfe8ff); torchFill.intensity = REDUCED ? 1.2 : 1.1 + Math.sin(S.time * 19) * 0.15; }
  else { torchFill.position.set(0, 0.1, -0.7); torchFill.distance = 7; torchFill.color.setHex(0xcfe0d6); }
  $('clip').style.visibility = S.st === 'c' ? 'hidden' : '';
  S.scare = Math.max(0, (S.scare || 0) - dt * 1.5);
  const fov = 72 + S.scare * 34; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  vm.visible = showVm;
  vm.position.set(0, Math.sin(me.bob * 2) * 0.008 - (me.crouch ? 0.01 : 0), 0);
  return { x, y, z, gd };
}

const hudCache = new Map();
const setText = (id, v) => { const k = id + ':t'; if (hudCache.get(k) === v) return; hudCache.set(k, v); $(id).textContent = v; };
const setHtml = (id, v) => { const k = id + ':h'; if (hudCache.get(k) === v) return; hudCache.set(k, v); $(id).innerHTML = v; };
const setStyle = (el, key, prop, v) => { const k = key + ':' + prop; if (hudCache.get(k) === v) return; hudCache.set(k, v); el.style[prop] = v; };
const setCls = (id, cls, on) => { const k = id + ':c:' + cls; if (hudCache.get(k) === on) return; hudCache.set(k, on); $(id).classList.toggle(cls, on); };
function updateHud(dt, t) {
  const tl = S.snap ? S.snap.tl : 0, total = S.cfg ? S.cfg.time : 1, fr = clamp(1 - tl / total, 0, 1), mins = Math.floor(fr * 360);
  setText('clock', `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
  setCls('clock', 'late', tl < 120);
  const esc2 = S.world && S.world.escapeT !== null;
  setText('clockSub', `${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')} until 06:00` + (esc2 ? ' - door closing soon' : ''));
  if (S.snap) setHtml('team', S.snap.p.map((p) => { const st = p[7]; return `<li class="${st === 'd' ? 'dead' : st === 'e' ? 'out' : ''}">${esc(nameOf(p[0]))}${p[0] === S.id ? '<small>you</small>' : ''}${st === 'c' ? '<small>CAUGHT</small>' : st === 'e' ? '<small>out</small>' : ''}${p[13] ? '<small>reconnecting</small>' : ''}</li>`; }).join(''));
  setStyle($('staminaBar').firstElementChild, 'stamina', 'width', Math.round((S.me.stamina / STAMINA.max) * 100) + '%');
  setStyle($('staminaBar'), 'staminaBar', 'opacity', S.me.stamina < STAMINA.max - 0.05 ? '1' : '0.25');
  setText('modeTxt', S.st !== 'a' ? '' : (S.me.winded ? 'out of breath' : S.me.crouch ? 'crouching - silent' : S.me.mode === 'run' ? 'running - loud' : '') + (S.rescued ? '  /  no second rescue' : ''));
  let html = '', bar = 0;
  if (S.st === 'h') html = '<b>E</b>Leave hiding spot';
  else if (S.st === 'a' && !S.note) { const t2 = findTarget(); if (t2) { html = t2.no ? `<span class="no">${esc(t2.label)}</span>` : `<b>E</b>${esc(t2.label)}${t2.hold ? ' (hold)' : ''}`; if (S.hold) bar = S.hold.t / S.hold.need; } }
  setHtml('promptText', html);
  setStyle($('promptBar'), 'promptBar', 'opacity', bar ? '1' : '0'); setStyle($('promptBar').firstElementChild, 'promptBarI', 'width', Math.round(bar * 100) + '%');
  if (S.st === 'h') {
    const cap = S.cfg.breath; setStyle($('breathFill'), 'breath', 'width', Math.round((S.breath / cap) * 100) + '%');
    setStyle($('breathFill'), 'breath', 'background', S.breath < cap * 0.3 ? '#ff5a4a' : '#c9d6cb');
    setText('breathHint', S.keys.Space ? 'Holding...' : 'Hold Space to hold your breath');
  }
  const spec = (S.st === 'd' || S.st === 'e');
  setCls('spectate', 'hidden', !spec);
  if (spec) setHtml('spectate', `${S.st === 'e' ? 'You clocked out' : 'You were taken'}<small>${S.spec ? `Watching ${esc(nameOf(S.spec))} - click or A/D to switch` : 'No one left to watch'}</small>`);
  setCls('paused', 'hidden', locked() || S.phase !== 'game');
  setStyle($('cross'), 'cross', 'opacity', S.st === 'a' ? '1' : '0');
  setCls('fps', 'hidden', !S.showFps);
  if (S.showFps) setText('fps', `${S.fps || '--'} fps  ·  ${S.quality}  ·  ${Math.round(S.dyn * 100)}% res`);
}

// ====================================================================== frame
let last = performance.now();
// Snapshot interpolation, on the server's clock. Others are drawn ~100 ms in the past so there are always
// two real samples to blend. Each player's position carries the server time it arrived, which removes the
// uneven steps you get when their send rate and the server tick drift against each other.
function viewSnap(now) {
  const n = snaps.length; if (n < 2 || S.clk === undefined) return S.snap;
  const delay = clamp(120 + (S.jit || 0) * 2.5, 120, 300), rt = now + S.clk - delay;
  const ang = (x, y, u) => { let d = y - x; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return x + d * u; };
  const near = (x0, z0, x1, z1) => Math.hypot(x1 - x0, z1 - z0) < 3;
  let i = n - 1; while (i > 0 && snaps[i - 1].t > rt) i--;
  const A = snaps[Math.max(0, i - 1)], B = snaps[i], b = B.m, a = A.m;
  const u = B.t > A.t ? clamp((rt - A.t) / (B.t - A.t), 0, 1) : 1;
  const g = near(a.g.x, a.g.z, b.g.x, b.g.z) ? { ...(u < 0.5 ? a.g : b.g), x: lerp(a.g.x, b.g.x, u), z: lerp(a.g.z, b.g.z, u), ry: ang(a.g.ry, b.g.ry, u), v: lerp(a.g.v, b.g.v, u) } : (u < 0.5 ? a.g : b.g);
  const latest = snaps[n - 1].m;
  const p = latest.p.map((row) => {
    const id = row[0];
    if (row[7] !== 'a') { // hidden / caught: the server moves them, so blend on tick time
      const ra = a.p.find((r) => r[0] === id), rb = b.p.find((r) => r[0] === id);
      if (!ra || !rb || !near(ra[1], ra[2], rb[1], rb[2])) return row;
      const r = row.slice(); r[1] = lerp(ra[1], rb[1], u); r[2] = lerp(ra[2], rb[2], u); r[3] = ang(ra[3], rb[3], u); return r;
    }
    let s0 = null, s1 = null; // the samples either side of rt, by the time each one reached the server
    for (let k = n - 1; k >= 0; k--) {
      const r = snaps[k].m.p.find((q) => q[0] === id); if (!r || !r[12]) continue;
      if (r[12] > rt) { if (!s1 || r[12] < s1[12]) s1 = r; } else { s0 = r; break; }
    }
    if (!s0 && !s1) return row;
    if (!s0 || !s1 || !near(s0[1], s0[2], s1[1], s1[2])) { const r = row.slice(), src = s0 || s1; r[1] = src[1]; r[2] = src[2]; r[3] = src[3]; r[4] = src[4]; return r; }
    const w = clamp((rt - s0[12]) / Math.max(1, s1[12] - s0[12]), 0, 1), r = row.slice();
    r[1] = lerp(s0[1], s1[1], w); r[2] = lerp(s0[2], s1[2], w); r[3] = ang(s0[3], s1[3], w); r[4] = lerp(s0[4], s1[4], w);
    return r;
  });
  return { ...latest, g, p };
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; S.time += dt;
  const t = S.time;
  let cam;
  if (S.phase === 'game' && S.snap) {
    updateSelf(dt);
    // ghost: drawn slightly in the past, interpolated between the two snapshots around that moment
    const V = viewSnap(now), sg = V.g, G = S.g, px = G.x, pz = G.z;
    if (Math.hypot(sg.x - G.x, sg.z - G.z) > 4 || G.v < 0.05) { G.x = sg.x; G.z = sg.z; G.ry = sg.ry; G.speed = 0; } else { G.x = sg.x; G.z = sg.z; G.ry = sg.ry; G.speed = lerp(G.speed, Math.hypot(G.x - px, G.z - pz) / Math.max(dt, 1e-3), 0.25); }
    G.v = sg.v; G.a = sg.a; G.s = sg.s;
    ghost.update(dt, G, M.floorY(G.x, G.z), G.speed);
    cam = updateCamera(dt);
    // other players
    const seen = new Set();
    for (const p of V.p) {
      if (p[0] === S.id) continue;
      seen.add(p[0]);
      let a = avatars.get(p[0]);
      if (!a) { a = new Avatar(scene, p[0], nameOf(p[0]), (k2) => world.itemMesh(k2)); avatars.set(p[0], a); }
      const it = S.world.items.find((i) => i.h === p[0]);
      const cx = a.cur ? a.cur.x : p[1], cz = a.cur ? a.cur.z : p[2];
      a.update(dt, p, M.floorY(cx, cz), it ? it.k : null, (S.st === 'd' || S.st === 'e') && S.spec === p[0], t);
    }
    for (const [id, a] of avatars) if (!seen.has(id)) { a.dispose(); avatars.delete(id); }
    const lit = [...avatars.values()].filter((a) => a.torch).sort((a, b) => Math.hypot(a.torch.p[0] - camera.position.x, a.torch.p[2] - camera.position.z) - Math.hypot(b.torch.p[0] - camera.position.x, b.torch.p[2] - camera.position.z));
    mateTorches.forEach((l, i) => { const a = l.visible && lit[i]; l.intensity = a ? 14 : 0; if (a) { l.position.set(...a.torch.p); l.target.position.set(...a.torch.t); } });
    // thrown bottles
    for (let i = shots.length - 1; i >= 0; i--) { const s = shots[i]; s.t += dt / s.fly; if (s.t >= 1) { scene.remove(s.m); shots.splice(i, 1); continue; } const x = lerp(s.x, s.tx, s.t), z = lerp(s.z, s.tz, s.t); s.m.position.set(x, M.floorY(x, z) + 1.3 * (1 - s.t) + Math.sin(s.t * Math.PI) * 1.1, z); s.m.rotation.x += dt * 14; }
    // fear, sound
    const los = cam.gd < 16 && M.lineOfSight(cam.x, cam.z, G.x, G.z, sound.doors);
    const fear = G.v > 0.3 ? clamp(1 - cam.gd / (los ? 11 : 5), 0, 1) : 0;
    S.warn = Math.max(0, S.warn - dt);
    post.u.fear.value = lerp(post.u.fear.value, S.st === 'c' ? 1 : fear, Math.min(1, dt * 4));
    camera.getWorldDirection(tmpV);
    sound.listener(cam, tmpV.x, tmpV.y, tmpV.z);
    sound.updateNearCatch(G, cam.gd, S.st === 'a' || S.st === 'h');
    sound.update(dt, { x: G.x, y: M.floorY(G.x, G.z), z: G.z, v: G.v, a: G.a, s: G.s }, cam.gd, S.world.callOn, { x: 17.5, y: 1.5, z: 4 }, Math.max(G.v > 0.3 && (S.st === 'a' || S.st === 'h') ? clamp(1 - cam.gd / 20, 0, 1) : 0, S.warn > 0 ? 0.9 : 0, S.st === 'c' ? 1 : 0));
    world.update(dt, t, cam, G);
    updateHud(dt, t);
    perfTick(dt);
  } else {
    // menu backdrop: drifting down the dark corridor
    const a = t * 0.05;
    camera.position.set(10 + Math.sin(a) * 4, 1.5, 11.5 + Math.sin(t * 0.21) * 0.4);
    camera.rotation.set(Math.sin(t * 0.3) * 0.03, -Math.PI / 2 + Math.sin(t * 0.13) * 0.25, 0);
    torch.intensity = 24 * (Math.sin(t * 3.1) * Math.sin(t * 7.7) > 0.7 ? 0.2 : 1); torchFill.intensity = 0.5; vm.visible = false;
    if (world) world.update(dt, t, camera.position, null);
    if (ghost) ghost.root.visible = false;
  }
  S.fade = lerp(S.fade, S.fadeTo, Math.min(1, dt * (S.fadeTo > S.fade ? 2.2 : 1.2)));
  const c0 = S.capT, blink = S.phase === 'game' && S.st === 'c' && !REDUCED && ((c0 > 0.16 && c0 < 0.22) || (c0 > 0.5 && c0 < 0.55) || (c0 > 0.86 && c0 < 0.9));
  $('fade').style.opacity = blink ? 1 : S.fade.toFixed(3);
  post.u.time.value = t;
  post.render();
}

try { const saved = JSON.parse(sessionStorage.getItem('ns_session') || 'null'); if (saved && saved.code === (Q.get('room') || '').toUpperCase()) { S.session = saved; $('name').value = saved.name; setTimeout(() => { sound.init(); reconnect(); }, 300); } } catch {}
if (!S.quality) S.quality = detectQuality();
buildScene();
applyQuality();
requestAnimationFrame(frame);
window.NS.ready = true;
