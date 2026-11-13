// Ghost voices. Speech comes from meSpeak (GPL, eSpeak) as raw audio and is then reworked per ghost.
// Words keep their natural speed and formants so they stay understandable; the character comes from layers
// and treatment: an octave-down growl, a whisper that follows the words, a stutter, an intercom, a room.
window.GhostVoice = (() => {
  const cache = new Map(); const irs = new Map();
  const BASE = { variant: 'croak', pitch: 0, speed: 104, main: 0.8, sub: 0.55, growl: 0.6, whisper: 0.18, wet: 0.24, room: 2.6, drive: 1.8, shift: 1, swell: 0.5, stutter: 0, radio: false };
  const PROFILES = {
    mother: {}, // deep, croaking, an octave-down growl locked under the words
    blind: { variant: 'whisper', pitch: 55, speed: 100, main: 0.55, sub: 0, growl: 0, whisper: 0.85, wet: 0.05, room: 0.8, drive: 1.1, swell: 0.15 }, // breathy, right at your ear
    matron: { variant: 'f4', pitch: 28, speed: 128, main: 0.9, sub: 0.08, growl: 0, whisper: 0.04, wet: 0.08, room: 1.2, drive: 2.6, swell: 0, radio: true }, // clipped, over the intercom
    surgeon: { variant: 'm3', pitch: 4, speed: 80, main: 0.85, sub: 0.32, growl: 0.15, whisper: 0.06, wet: 0.34, room: 2.2, drive: 1.3, shift: 0.94, swell: 0.2 }, // slow, flat, a tiled theatre
    mimic: { variant: 'f5', pitch: 58, speed: 138, main: 0.85, sub: 0.12, growl: 0, whisper: 0.22, wet: 0.2, room: 1.8, drive: 1.4, swell: 0.35, stutter: 0.22 }, // a nurse's voice that skips
  };
  const prof = (k) => ({ ...BASE, ...(PROFILES[k] || {}) });
  function impulse(c, secs) { const key = c.sampleRate + '|' + secs; if (irs.has(key)) return irs.get(key); const len = Math.round(c.sampleRate * secs), b = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (i < 600 ? i / 600 : 1); } irs.set(key, b); return b; }
  // pitch shift by factor r, same length (overlapping windowed grains, each read r times as fast)
  function shift(x, r, sr) {
    const N = Math.round(sr * 0.04), hop = N >> 2, out = new Float32Array(x.length), w = new Float32Array(N);
    for (let k = 0; k < N; k++) w[k] = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N);
    for (let t = 0; t < x.length; t += hop) for (let k = 0; k < N; k++) {
      const o = t - (N >> 1) + k; if (o < 0 || o >= x.length) continue;
      const p = t + (k - (N >> 1)) * r, i = Math.floor(p), f = p - i; if (i < 0 || i + 1 >= x.length) continue;
      out[o] += w[k] * (x[i] * (1 - f) + x[i + 1] * f) * 0.5;
    }
    return out;
  }
  function onePole(x, sr, fc) { const a = Math.exp((-2 * Math.PI * fc) / sr), y = new Float32Array(x.length); let s = 0; for (let i = 0; i < x.length; i++) y[i] = s = (1 - a) * x[i] + a * s; return y; }
  // the mimic's skip: short pieces repeat or play backwards, like a voice learned from a damaged tape
  function stutter(x, sr, amt) {
    const L = Math.round(sr * 0.075), out = [];
    for (let i = 0; i < x.length; i += L) {
      const seg = x.subarray(i, Math.min(x.length, i + L)), r = Math.random();
      out.push(seg);
      if (r < amt) { out.push(seg); if (Math.random() < 0.4) out.push(seg); }
      else if (r < amt * 1.25) out.push(Float32Array.from(seg).reverse());
    }
    const n = out.reduce((a, s) => a + s.length, 0), y = new Float32Array(n); let o = 0;
    for (const s of out) { y.set(s, o); o += s.length; }
    for (let i = 0; i < n; i += L) for (let k = 0; k < 64 && i + k < n; k++) { y[i + k] *= k / 64; } // no clicks at the joins
    return y;
  }
  async function render(c, text, kind = 'mother') {
    const P = prof(kind), key = c.sampleRate + '|' + kind + '|' + text; if (cache.has(key)) return cache.get(key);
    if (!window.meSpeak) throw new Error('voice engine not loaded');
    const wav = window.meSpeak.speak(text, { rawdata: 'array', variant: P.variant, pitch: P.pitch, speed: P.speed, amplitude: 150, wordgap: 4 });
    if (!wav) throw new Error('no speech');
    const d = await c.decodeAudioData(new Uint8Array(wav).buffer.slice(0)), x0 = d.getChannelData(0), sr = d.sampleRate;
    let a = 0, z = x0.length - 1; while (a < z && Math.abs(x0[a]) < 0.01) a++; while (z > a && Math.abs(x0[z]) < 0.01) z--;
    let x = x0.slice(Math.max(0, a - 200), Math.min(x0.length, z + 1500));
    if (P.stutter) x = stutter(x, sr, P.stutter);
    const n = x.length, low = P.shift === 1 ? x : shift(x, P.shift, sr), deep = P.sub ? onePole(shift(x, 0.5, sr), sr, 500) : null;
    const env = onePole(x.map(Math.abs), sr, 25); // follows the words
    const y = new Float32Array(n); let peak = 0, bp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      let v = Math.tanh(low[i] * P.drive) * P.main;
      if (deep) { const saw = ((i * 31) / sr) % 1; v += Math.tanh(deep[i] * 4) * (1 - P.growl + P.growl * saw) * P.sub; }
      const nz = Math.random() * 2 - 1; bp = nz - lp2; lp2 += 0.35 * bp; v += bp * env[i] * 2.5 * P.whisper; // hiss shaped by the words
      y[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    for (let i = 0; i < n; i++) y[i] *= 0.9 / (peak || 1);
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(y);
    const r = c.createBuffer(1, n, sr), rd = r.getChannelData(0); for (let i = 0; i < n; i++) rd[i] = y[n - 1 - i];
    const out = { b, r }; cache.set(key, out); return out;
  }
  // Plays `text` in `kind`'s voice into `out`. Returns the seconds it will take.
  async function say(c, out, text, { vol = 1, delay = 0, kind = 'mother' } = {}) {
    const P = prof(kind), { b, r } = await render(c, text, kind);
    const lead = P.swell ? Math.min(0.8, b.duration * 0.5) : 0.05, t0 = c.currentTime + 0.05 + delay, t1 = t0 + lead;
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 4; lim.ratio.value = 14; lim.attack.value = 0.002; lim.release.value = 0.2; lim.connect(out);
    const bus = c.createGain(); bus.gain.value = vol * 0.85; bus.connect(lim);
    let into = bus;
    if (P.radio) { // hospital intercom: thin, crackling, a chime before
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 420; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2900; lp.Q.value = 2;
      hp.connect(lp); lp.connect(bus); into = hp;
      const crackle = c.createBuffer(1, Math.round(c.sampleRate * (b.duration + lead + 0.8)), c.sampleRate), cd = crackle.getChannelData(0);
      for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * 0.02 + (Math.random() < 0.0008 ? (Math.random() - 0.5) * 0.6 : 0);
      const cs = c.createBufferSource(); cs.buffer = crackle; cs.connect(hp); cs.start(t0);
      for (const [f, dt] of [[880, 0], [698, 0.32]]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.35, t0 + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.5); o.connect(g); g.connect(hp); o.start(t0 + dt); o.stop(t0 + dt + 0.55); }
    }
    const verb = c.createConvolver(); verb.buffer = impulse(c, P.room); const wet = c.createGain(); wet.gain.value = P.wet; verb.connect(wet); wet.connect(into);
    const pre = c.createDelay(0.2); pre.delayTime.value = 0.06; pre.connect(verb);
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 140; body.gain.value = P.sub ? 4 : 0; body.connect(into); body.connect(pre);
    if (P.swell) { const rs = c.createBufferSource(); rs.buffer = r; const rg = c.createGain(); rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(Math.max(0.001, P.swell), t1); rg.gain.setValueAtTime(0, t1 + 0.02); rs.connect(rg); rg.connect(pre); rs.start(t0, Math.max(0, r.duration - lead)); rs.stop(t1 + 0.05); }
    const m = c.createBufferSource(); m.buffer = b; m.connect(body); m.start(t1 + (P.radio ? 0.75 : 0));
    return lead + b.duration + (P.radio ? 0.75 : 0) + 1.2;
  }
  return { say, prep: (c, text, kind) => render(c, text, kind), ready: () => !!window.meSpeak, profiles: Object.keys(PROFILES) };
})();
