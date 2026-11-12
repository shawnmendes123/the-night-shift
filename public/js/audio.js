// Web Audio ambience plus the approved processed near-catch recording.
import { lineOfSight } from '/shared/map.js';

export class Sound {
  constructor() { this.ok = false; this.lx = 0; this.lz = 0; this.doors = null; this.tension = 0; }
  init() {
    if (this.ok) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.out = c.createGain(); this.out.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
    this.out.connect(comp); comp.connect(c.destination);
    // jumpscare bus: skips the compressor, driven into a hard clipper so it tears
    this.raw = c.createGain(); this.raw.gain.value = 1;
    const clip = c.createWaveShaper(), cv = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 511.5 - 1) * 6; cv[i] = Math.max(-1, Math.min(1, x)) * 0.92; }
    clip.curve = cv; clip.oversample = '2x'; this.raw.connect(clip); clip.connect(c.destination);
    const mkNoise = (brown) => { const b = c.createBuffer(1, c.sampleRate * 3, c.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.5; } else d[i] = w; } return b; };
    this.white = mkNoise(false); this.brown = mkNoise(true);
    // --- room tone / drone
    this.drone = c.createGain(); this.drone.gain.value = 0; this.drone.connect(this.out);
    const n = this.loop(this.brown), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; const ng = c.createGain(); ng.gain.value = 0.55; n.connect(lp); lp.connect(ng); ng.connect(this.drone);
    for (const [f, g] of [[54, 0.09], [57.2, 0.07], [81.5, 0.03]]) { const o = c.createOscillator(); o.frequency.value = f; const og = c.createGain(); og.gain.value = g; o.connect(og); og.connect(this.drone); o.start(); const l = c.createOscillator(); l.frequency.value = 0.05 + Math.random() * 0.1; const lg = c.createGain(); lg.gain.value = g * 0.6; l.connect(lg); lg.connect(og.gain); l.start(); }
    const hiss = this.loop(this.white), hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2600; hp.Q.value = 0.4; const hg = c.createGain(); hg.gain.value = 0.006; hiss.connect(hp); hp.connect(hg); hg.connect(this.drone);
    // --- the ghost's own voice: breathing + bone clicks, positioned in 3D
    this.gp = this.panner(); this.gLow = c.createBiquadFilter(); this.gLow.type = 'lowpass'; this.gLow.frequency.value = 9000; this.gGain = c.createGain(); this.gGain.gain.value = 0;
    this.gGain.connect(this.gLow); this.gLow.connect(this.gp); this.gp.connect(this.out);
    const br = this.loop(this.white), bf = c.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 620; bf.Q.value = 2.2; this.breathG = c.createGain(); this.breathG.gain.value = 0;
    br.connect(bf); bf.connect(this.breathG); this.breathG.connect(this.gGain);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.42; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(this.breathG.gain); lfo.start(); this.breathLfo = lfo; this.breathF = bf;
    this.dragG = c.createGain(); this.dragG.gain.value = 0; const dr = this.loop(this.brown), df = c.createBiquadFilter(); df.type = 'bandpass'; df.frequency.value = 420; df.Q.value = 0.8; dr.connect(df); df.connect(this.dragG); this.dragG.connect(this.gGain);
    this.heartT = 0; this.clickT = 0; this.bellT = 0;
    this.ok = true;
    this.nearCatchBuffer = null;
    this.nearCatchLoad = fetch('/assets/near-catch.mp3')
      .then(r => { if (!r.ok) throw new Error('Near-catch audio unavailable'); return r.arrayBuffer(); })
      .then(bytes => c.decodeAudioData(bytes))
      .then(buffer => { this.nearCatchBuffer = buffer; })
      .catch(error => console.warn('Near-catch cue could not load; existing audio remains available.', error));
  }
  loop(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; }
  panner() { const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 1.6; p.maxDistance = 60; p.rolloffFactor = 1.5; return p; }
  listener(cam, fx, fy, fz) {
    if (!this.ok) return;
    const l = this.ctx.listener; this.lx = cam.x; this.lz = cam.z;
    if (l.positionX) { l.positionX.value = cam.x; l.positionY.value = cam.y; l.positionZ.value = cam.z; l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(cam.x, cam.y, cam.z); l.setOrientation(fx, fy, fz, 0, 1, 0); }
  }
  // Positioned output node; muffled when a wall or closed door is in the way.
  at(x, y, z, vol = 1) {
    const c = this.ctx, p = this.panner(); p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    const g = c.createGain(), f = c.createBiquadFilter(); f.type = 'lowpass';
    const clear = Math.hypot(x - this.lx, z - this.lz) < 0.6 || lineOfSight(this.lx, this.lz, x, z, this.doors);
    f.frequency.value = clear ? 14000 : 750; g.gain.value = vol * (clear ? 1 : 0.6);
    g.connect(f); f.connect(p); p.connect(this.out);
    return g;
  }
  flat(vol = 1, pan = 0) { const g = this.ctx.createGain(); g.gain.value = vol; if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.out); } else g.connect(this.out); return g; }
  burst(dst, { buf = this.white, type = 'lowpass', f = 800, f2, q = 1, dur = 0.2, vol = 1, attack = 0.005, when = 0, rate = 1 }) {
    const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dst); s.start(t, Math.random() * 2, dur + 0.05);
  }
  tone(dst, { type = 'sine', f = 200, f2, dur = 0.3, vol = 0.5, attack = 0.005, when = 0 }) {
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- one-shots
  step(x, y, z, vol = 0.5, self = false) { if (!this.ok) return; const d = self ? this.flat(vol) : this.at(x, y, z, vol); this.burst(d, { f: 300 + Math.random() * 200, dur: 0.09, vol: 0.9 }); this.tone(d, { f: 75, f2: 45, dur: 0.08, vol: 0.5 }); }
  ghostStep(x, y, z, kind) {
    if (!this.ok) return; const d = this.at(x, y, z, 1.5);
    if (kind === 'drag') this.burst(d, { buf: this.brown, type: 'bandpass', f: 500, f2: 250, q: 0.7, dur: 0.42, vol: 1.1, attack: 0.08 });
    else { this.burst(d, { f: 220, dur: 0.12, vol: 1.3 }); this.tone(d, { f: 62, f2: 38, dur: 0.16, vol: 1.2 }); this.burst(d, { type: 'highpass', f: 2500, dur: 0.03, vol: 0.14, when: 0.02 }); }
  }
  creak(x, y, z, slam) {
    if (!this.ok) return; const d = this.at(x, y, z, slam ? 1.6 : 0.8);
    if (slam) { this.burst(d, { f: 500, f2: 90, dur: 0.35, vol: 2 }); this.tone(d, { f: 90, f2: 40, dur: 0.4, vol: 1.6 }); this.burst(d, { type: 'highpass', f: 1800, dur: 0.06, vol: 0.5 }); return; }
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(); o.type = 'sawtooth'; const f0 = 120 + Math.random() * 80;
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 1.9, t + 0.3); o.frequency.linearRampToValueAtTime(f0 * 1.3, t + 0.65);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 6; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.08); g.gain.linearRampToValueAtTime(0.1, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    const trem = c.createOscillator(); trem.frequency.value = 23; const tg = c.createGain(); tg.gain.value = 0.1; trem.connect(tg); tg.connect(g.gain);
    o.connect(bp); bp.connect(g); g.connect(d); o.start(t); o.stop(t + 0.75); trem.start(t); trem.stop(t + 0.75);
    this.burst(d, { f: 400, dur: 0.07, vol: 0.5, when: 0.66 });
  }
  knock(x, y, z) { if (!this.ok) return; const d = this.at(x, y, z, 2.2); for (let i = 0; i < 3; i++) { const w = i * 0.42 + (i === 2 ? 0.25 : 0); this.tone(d, { f: 110, f2: 55, dur: 0.14, vol: 1.4, when: w }); this.burst(d, { f: 600, dur: 0.05, vol: 0.8, when: w }); } }
  whisper(pan = 0) {
    if (!this.ok) return; const d = this.flat(0.5, pan);
    let t = 0; for (let i = 0; i < 7; i++) { const dur = 0.09 + Math.random() * 0.2; this.burst(d, { type: 'bandpass', f: 1400 + Math.random() * 2200, f2: 1000 + Math.random() * 2500, q: 5, dur, vol: 0.5 + Math.random() * 0.5, attack: 0.04, when: t }); t += dur * (0.7 + Math.random() * 0.6); }
  }
  scream(x, y, z, vol = 1) {
    if (!this.ok) return; const c = this.ctx, d = this.at(x, y, z, 2.4 * vol), t = c.currentTime;
    for (const [f, det] of [[420, 0], [437, 9], [860, -14], [1290, 5]]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; o.frequency.setValueAtTime(f * 0.6, t); o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.25); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 1.1);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15); const v = c.createOscillator(); v.frequency.value = 31; const vg = c.createGain(); vg.gain.value = f * 0.07; v.connect(vg); vg.connect(o.frequency);
      o.connect(g); g.connect(d); o.start(t); o.stop(t + 1.2); v.start(t); v.stop(t + 1.2); }
    this.burst(d, { type: 'bandpass', f: 2400, f2: 900, q: 1.2, dur: 1.0, vol: 0.9, attack: 0.03 });
  }
  // The capture scream. Victim hears it dry, in their skull; bystanders hear it from where it happens.
  grabScream(self, x, y, z) {
    if (!this.ok) return;
    const c = this.ctx, t = c.currentTime, dur = 2.6;
    let d;
    if (self) { d = c.createGain(); d.gain.value = 1; d.connect(this.raw); this.out.gain.cancelScheduledValues(t); this.out.gain.setValueAtTime(0.15, t); this.out.gain.linearRampToValueAtTime(0.9, t + 3.2); }
    else d = this.at(x, y, z, 3.2);
    const v = self ? 1 : 0.5;
    // 1. the hit: full-band crack + a sub drop you feel
    this.burst(d, { type: 'highpass', f: 60, dur: 0.09, vol: 2.2 * v, attack: 0.001 });
    this.tone(d, { type: 'sine', f: 95, f2: 24, dur: 1.4, vol: 1.5 * v, attack: 0.002 });
    // 2. the voice: two throats, a tritone apart, breaking upward, shaking apart
    const voice = (f0, peak, delay, len, gain) => {
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + delay); g.gain.linearRampToValueAtTime(gain * v, t + delay + 0.025); g.gain.setValueAtTime(gain * v, t + delay + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + len);
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1150; f1.Q.value = 2.5;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2900; f2.Q.value = 4;
      const f3 = c.createBiquadFilter(); f3.type = 'highpass'; f3.frequency.value = 500;
      f1.connect(g); f2.connect(g); f3.connect(g); g.connect(d);
      const rough = c.createOscillator(); rough.type = 'square'; rough.frequency.setValueAtTime(38, t + delay); rough.frequency.linearRampToValueAtTime(71, t + delay + len);
      const rg = c.createGain(); rg.gain.value = 0.55; rough.connect(rg); rg.connect(g.gain); rough.start(t + delay); rough.stop(t + delay + len + 0.05);
      for (const det of [-31, -9, 0, 13, 27, 1210]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.detune.value = det;
        o.frequency.setValueAtTime(f0 * 0.45, t + delay); o.frequency.exponentialRampToValueAtTime(peak, t + delay + 0.11);
        o.frequency.setValueAtTime(peak, t + delay + len * 0.35); o.frequency.exponentialRampToValueAtTime(peak * 1.22, t + delay + len * 0.5); // the crack
        o.frequency.exponentialRampToValueAtTime(peak * 0.62, t + delay + len);
        const jit = c.createOscillator(); jit.type = 'sawtooth'; jit.frequency.value = 23 + Math.random() * 40; const jg = c.createGain(); jg.gain.value = peak * 0.09; jit.connect(jg); jg.connect(o.frequency);
        const og = c.createGain(); og.gain.value = 0.3; o.connect(og); og.connect(f1); og.connect(f2); og.connect(f3);
        o.start(t + delay); o.stop(t + delay + len + 0.05); jit.start(t + delay); jit.stop(t + delay + len + 0.05);
      }
    };
    voice(620, 1180, 0, dur, 0.9);
    voice(877, 1669, 0.03, dur * 0.85, 0.6);
    voice(310, 420, 0.05, dur, 0.5); // the low one underneath, like a second thing in the room
    // 3. breath and tearing: noise that slides down as the lungs empty
    this.burst(d, { type: 'bandpass', f: 4200, f2: 1300, q: 1.1, dur: dur * 0.9, vol: 1.4 * v, attack: 0.01 });
    for (let i = 0; i < 14; i++) this.burst(d, { type: 'bandpass', f: 1800 + Math.random() * 3000, q: 8, dur: 0.03, vol: 1.2 * v, attack: 0.001, when: 0.25 + Math.random() * (dur - 0.5) });
    // 4. after it: a wet rattle in the dark
    this.croak(d, 1.5 * v, dur - 0.3);
  }
  // Dry throat rattle: a slow train of clicks that speeds up and dies.
  croak(dst, vol = 1, when = 0) {
    if (!this.ok) return;
    const d = dst || this.gGain; let w = when, gap = 0.085;
    for (let i = 0; i < 16; i++) { this.burst(d, { type: 'bandpass', f: 380 + Math.random() * 260, q: 5, dur: 0.035, vol: vol * (0.6 + Math.random() * 0.6), attack: 0.001, when: w }); this.tone(d, { type: 'square', f: 92 + Math.random() * 14, dur: 0.03, vol: vol * 0.35, attack: 0.001, when: w }); w += gap; gap *= i < 9 ? 0.93 : 1.16; }
  }
  sting() { if (!this.ok) return; const d = this.flat(0.7); this.tone(d, { f: 46, f2: 30, dur: 2.2, vol: 1, attack: 0.02 }); this.burst(d, { buf: this.brown, f: 160, dur: 1.8, vol: 0.9, attack: 0.01 }); }
  clunk(x, y, z, on = true) { if (!this.ok) return; const d = this.at(x, y, z, 2); this.tone(d, { f: 140, f2: 50, dur: 0.25, vol: 1.6 }); this.burst(d, { f: 1800, dur: 0.05, vol: 1.2 }); if (on) { this.tone(this.flat(0.25), { type: 'sawtooth', f: 100, f2: 100, dur: 1.4, vol: 0.4, attack: 0.5 }); this.burst(this.flat(0.2), { type: 'bandpass', f: 6000, q: 3, dur: 0.6, vol: 0.5, when: 0.2 }); } }
  shatter(x, y, z) { if (!this.ok) return; const d = this.at(x, y, z, 2.2); this.burst(d, { type: 'highpass', f: 2600, dur: 0.5, vol: 1.6 }); for (let i = 0; i < 9; i++) this.tone(d, { f: 2200 + Math.random() * 5000, dur: 0.05 + Math.random() * 0.25, vol: 0.25, when: Math.random() * 0.3 }); }
  bell(x, y, z, vol = 1) { if (!this.ok) return; const d = this.at(x, y, z, vol); for (const [f, v] of [[1318, 0.5], [1976, 0.2], [2637, 0.1]]) this.tone(d, { f, f2: f * 0.995, dur: 0.9, vol: v }); }
  buzz(x, y, z) { if (!this.ok) return; const d = this.at(x, y, z, 0.6); for (let i = 0; i < 6; i++) this.tone(d, { type: 'sawtooth', f: 100, dur: 0.04 + Math.random() * 0.1, vol: 0.5, when: Math.random() * 1.6 }); for (let i = 0; i < 5; i++) this.burst(d, { type: 'highpass', f: 5000, dur: 0.02, vol: 0.5, when: Math.random() * 1.6 }); }
  thud(x, y, z, vol = 1) { if (!this.ok) return; const d = this.at(x, y, z, vol); this.burst(d, { f: 400, dur: 0.1, vol: 1 }); this.tone(d, { f: 90, f2: 50, dur: 0.12, vol: 0.8 }); }
  ui(kind) {
    if (!this.ok) return; const d = this.flat(0.3);
    if (kind === 'pick') { this.burst(d, { type: 'highpass', f: 1800, dur: 0.05, vol: 0.6 }); this.tone(d, { f: 520, dur: 0.05, vol: 0.2 }); }
    else if (kind === 'paper') this.burst(d, { type: 'bandpass', f: 3200, q: 0.8, dur: 0.22, vol: 0.5, attack: 0.05 });
    else if (kind === 'task') { this.tone(d, { f: 660, dur: 0.18, vol: 0.35 }); this.tone(d, { f: 880, dur: 0.3, vol: 0.3, when: 0.14 }); }
    else if (kind === 'locked') { this.burst(d, { f: 900, dur: 0.05, vol: 0.9 }); this.burst(d, { f: 700, dur: 0.05, vol: 0.7, when: 0.12 }); }
    else if (kind === 'gasp') { this.burst(d, { type: 'bandpass', f: 900, f2: 2200, q: 1.5, dur: 0.5, vol: 1.6, attack: 0.02 }); }
    else if (kind === 'heart') { this.tone(d, { f: 58, f2: 40, dur: 0.12, vol: 1.6 }); this.tone(d, { f: 52, f2: 36, dur: 0.14, vol: 1.2, when: 0.17 }); }
    else if (kind === 'scratch') { for (let i = 0; i < 4; i++) this.burst(d, { type: 'bandpass', f: 2600 + Math.random() * 800, q: 3, dur: 0.16, vol: 0.5, attack: 0.03, when: i * 0.24 + Math.random() * 0.05 }); }
    else if (kind === 'free') { this.burst(d, { f: 600, dur: 0.2, vol: 1 }); }
    else if (kind === 'unlock') { this.burst(d, { type: 'highpass', f: 1500, dur: 0.04, vol: 0.8 }); this.tone(d, { f: 300, f2: 200, dur: 0.08, vol: 0.5, when: 0.1 }); this.burst(d, { f: 800, dur: 0.07, vol: 0.9, when: 0.22 }); }
    else if (kind === 'toll') { for (const [f, v] of [[196, 0.6], [293, 0.3], [392, 0.2]]) this.tone(this.flat(0.5), { f, f2: f * 0.99, dur: 3.5, vol: v, attack: 0.01 }); }
  }

  // Local presentation only: never sends noise or changes ghost behaviour.
  updateNearCatch(g, dist, active) {
    if (!this.ok) return;
    const chasing = active && g.v > .3 && (g.s === 'chase' || g.a === 'run' || g.a === 'reach');
    const clear = chasing && lineOfSight(this.lx, this.lz, g.x, g.z, this.doors);
    // Hysteresis prevents restarts at the distance boundary.
    if (!clear || dist > 7) { this.stopNearCatch(); return; }
    if (dist < 5 && !this.nearCatchPlayed && this.nearCatchBuffer) {
      const source = this.ctx.createBufferSource(), gain = this.ctx.createGain();
      source.buffer = this.nearCatchBuffer; gain.gain.value = 0;
      source.connect(gain); gain.connect(this.out);
      const voice = {source, gain}; this.nearCatchVoice = voice; this.nearCatchPlayed = true;
      source.onended = () => { source.disconnect(); gain.disconnect(); if(this.nearCatchVoice === voice) this.nearCatchVoice = null; };
      source.start();
    }
    if (this.nearCatchVoice) {
      const urgency = Math.max(0, Math.min(1, (5 - dist) / 4));
      this.nearCatchVoice.gain.gain.setTargetAtTime(.22 + urgency * .58, this.ctx.currentTime, .12);
    }
  }
  stopNearCatch() {
    this.nearCatchPlayed = false;
    const voice = this.nearCatchVoice;
    if (!voice) return;
    this.nearCatchVoice = null;
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, .025);
    voice.source.stop(now + .15);
  }

  // ---------------------------------------------------------------- continuous
  // g: ghost {x,y,z,v,a,s}; dist: listener distance; near: 0..1 danger; hidden: listener hiding
  update(dt, g, dist, calling, callPos, selfHeart) {
    if (!this.ok) return;
    const c = this.ctx, now = c.currentTime;
    const present = g && g.v > 0.3;
    // silence as a warning: the room tone drops away when she is close or fixed on someone
    const hush = present && (dist < 9 || ['stalk', 'notice', 'listen', 'look'].includes(g.s)) && dist < 20 ? 1 : 0;
    this.tension += (hush - this.tension) * Math.min(1, dt * 1.2);
    this.drone.gain.setTargetAtTime(0.5 * (1 - this.tension * 0.92), now, 0.3);
    if (present) {
      this.gp.positionX.value = g.x; this.gp.positionY.value = g.y + 1.5; this.gp.positionZ.value = g.z;
      const clear = lineOfSight(this.lx, this.lz, g.x, g.z, this.doors);
      this.gLow.frequency.setTargetAtTime(clear ? 9000 : 650, now, 0.15);
      this.gGain.gain.setTargetAtTime(clear ? 1 : 0.55, now, 0.2);
      const fast = g.a === 'run' || g.a === 'grab' || g.a === 'scream';
      this.breathG.gain.setTargetAtTime(g.a === 'listen' ? 2.2 : fast ? 2.6 : 1.3, now, 0.2);
      this.breathLfo.frequency.setTargetAtTime(fast ? 1.9 : g.a === 'listen' ? 0.7 : 0.42, now, 0.3);
      this.breathF.frequency.setTargetAtTime(fast ? 900 : 560, now, 0.3);
      this.dragG.gain.setTargetAtTime(g.a === 'drag' ? 3.2 : 0, now, g.a === 'drag' ? 0.2 : 0.01); // cuts dead when she is gone
      this.clickT -= dt;
      if (this.clickT <= 0 && dist < 16) { // close-range bone clicking
        this.clickT = fast ? 0.12 + Math.random() * 0.2 : 0.5 + Math.random() * 2.2;
        const n = 1 + ((Math.random() * 4) | 0);
        for (let i = 0; i < n; i++) this.burst(this.gGain, { type: 'bandpass', f: 1500 + Math.random() * 1800, q: 9, dur: 0.018, vol: 1.6, attack: 0.001, when: i * (0.035 + Math.random() * 0.03) });
      }
    } else { this.gGain.gain.setTargetAtTime(0, now, 0.02); this.dragG.gain.setTargetAtTime(0, now, 0.01); }
    // own heartbeat rises with danger
    this.heartT -= dt;
    if (selfHeart > 0.03 && this.heartT <= 0) { // ~52 bpm far away, ~185 bpm when she is on you
      this.heartT = 1.15 - 0.825 * Math.min(1, selfHeart);
      const h = Math.min(1, selfHeart), d = this.flat(0.3 + h * 1.5), gap = 0.2 - h * 0.08;
      this.tone(d, { f: 64, f2: 36, dur: 0.15, vol: 1.6, attack: 0.004 }); this.burst(d, { buf: this.brown, f: 120, dur: 0.07, vol: 1.2, attack: 0.003 });
      this.tone(d, { f: 54, f2: 32, dur: 0.17, vol: 1.2, attack: 0.004, when: gap }); this.burst(d, { buf: this.brown, f: 100, dur: 0.07, vol: 0.8, attack: 0.003, when: gap });
    }
    this.croakT = (this.croakT ?? 6) - dt;
    if (present && dist < 11 && this.croakT <= 0 && !['run', 'grab', 'scream', 'drag'].includes(g.a)) { this.croakT = 5 + Math.random() * 9; this.croak(null, 1.1); }
    this.bellT -= dt;
    if (calling && this.bellT <= 0) { this.bellT = 2.6; this.bell(callPos.x, callPos.y, callPos.z, 0.55); }
  }
  setDrone(on) { if (!on) this.stopNearCatch(); if (this.ok) this.drone.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.5); }
}
