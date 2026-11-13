// Ghost voice. Speech from meSpeak (GPL, eSpeak), deepened without slowing it down (so the words stay clear),
// with an octave-down growl locked underneath, a whisper shadow, a backwards swell into the first word and a corridor echo.
window.GhostVoice = (() => {
  const cache = new Map(); let ir = null;
  const P = { variant: 'croak', pitch: 0, speed: 104, main: 0.8, sub: 0.55, growl: 0.6, whisper: 0.18, wet: 0.24, drive: 1.8, shift: 1, swell: 0.5 };
  function impulse(c) { const len = Math.round(c.sampleRate * 2.6), b = c.createBuffer(2, len, c.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3) * (i < 600 ? i / 600 : 1); } return b; }
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
  async function render(c, text) {
    const key = c.sampleRate + '|' + text; if (cache.has(key)) return cache.get(key);
    if (!window.meSpeak) throw new Error('voice engine not loaded');
    const wav = window.meSpeak.speak(text, { rawdata: 'array', variant: P.variant, pitch: P.pitch, speed: P.speed, amplitude: 150, wordgap: 4 });
    if (!wav) throw new Error('no speech');
    const d = await c.decodeAudioData(new Uint8Array(wav).buffer.slice(0)), x0 = d.getChannelData(0), sr = d.sampleRate;
    let a = 0, z = x0.length - 1; while (a < z && Math.abs(x0[a]) < 0.01) a++; while (z > a && Math.abs(x0[z]) < 0.01) z--;
    const x = x0.slice(Math.max(0, a - 200), Math.min(x0.length, z + 1500)), n = x.length;
    const low = P.shift === 1 ? x : shift(x, P.shift, sr), deep = onePole(shift(x, 0.5, sr), sr, 500);
    const env = onePole(x.map(Math.abs), sr, 25); // follows the words
    const y = new Float32Array(n), wh = new Float32Array(n); let peak = 0, bp = 0, lp2 = 0;
    for (let i = 0; i < n; i++) {
      const saw = ((i * 31) / sr) % 1; // 31 Hz rasp riding the sub voice only
      const g = Math.tanh(deep[i] * 4) * (1 - P.growl + P.growl * saw);
      y[i] = Math.tanh(low[i] * P.drive) * P.main + g * P.sub;
      const nz = Math.random() * 2 - 1; bp = nz - lp2; lp2 += 0.35 * bp; wh[i] = bp * env[i] * 2.5; // hiss shaped by the words
      y[i] += wh[i] * P.whisper; if (Math.abs(y[i]) > peak) peak = Math.abs(y[i]);
    }
    for (let i = 0; i < n; i++) y[i] *= 0.9 / (peak || 1);
    const b = c.createBuffer(1, n, sr); b.getChannelData(0).set(y);
    const r = c.createBuffer(1, n, sr), rd = r.getChannelData(0); for (let i = 0; i < n; i++) rd[i] = y[n - 1 - i];
    const out = { b, r }; cache.set(key, out); return out;
  }
  // Plays `text` into `out`. Returns the seconds it will take.
  async function say(c, out, text, { vol = 1, delay = 0 } = {}) {
    const { b, r } = await render(c, text); ir ||= impulse(c);
    const lead = Math.min(0.8, b.duration * 0.5), t0 = c.currentTime + 0.05 + delay, t1 = t0 + lead;
    const bus = c.createGain(); bus.gain.value = vol; bus.connect(out);
    const verb = c.createConvolver(); verb.buffer = ir; const wet = c.createGain(); wet.gain.value = P.wet; verb.connect(wet); wet.connect(bus);
    const pre = c.createDelay(0.2); pre.delayTime.value = 0.06; pre.connect(verb);
    const body = c.createBiquadFilter(); body.type = 'peaking'; body.frequency.value = 140; body.gain.value = 4; body.connect(bus); body.connect(pre);
    const rs = c.createBufferSource(); rs.buffer = r; const rg = c.createGain(); rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(Math.max(0.001, P.swell), t1); rg.gain.setValueAtTime(0, t1 + 0.02);
    rs.connect(rg); rg.connect(pre); rs.start(t0, Math.max(0, r.duration - lead)); rs.stop(t1 + 0.05);
    const m = c.createBufferSource(); m.buffer = b; m.connect(body); m.start(t1);
    return lead + b.duration + 1.2;
  }
  return { say, prep: render, ready: () => !!window.meSpeak, P };
})();
