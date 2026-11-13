// Proximity voice chat. Each pair of players talks peer to peer (WebRTC, Opus); the game socket only carries the
// handshake. On the sign-in sheet everyone hears everyone. In the hospital a voice comes from where that nurse
// stands, fades with distance and goes muffled behind walls. Taken nurses can only hear the living, not be heard.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

export class Voice {
  constructor(send) {
    this.send = send; this.peers = new Map(); this.ice = STUN; this.me = null;
    this.mode = 'off'; this.stream = null; this.track = null; this.hold = false; this.forceMute = false;
    this.vol = 1; this.level = 0; this.speaking = false; this.error = '';
    this.ctx = null; this.out = null; this.micAn = null; this.buf = new Float32Array(512);
  }
  setIce(list) { if (Array.isArray(list) && list.length) this.ice = list; }

  // ---------------------------------------------------------------- audio graph
  attach(ctx) {
    if (!ctx || this.ctx === ctx) return;
    this.ctx = ctx; this.out = ctx.createGain(); this.out.gain.value = this.vol; this.out.connect(ctx.destination);
    if (this.stream) this.meter();
    for (const p of this.peers.values()) if (p.stream && !p.src) this.wire(p);
  }
  setVolume(v) { this.vol = v; if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  meter() { if (!this.ctx || !this.stream) return; try { const s = this.ctx.createMediaStreamSource(this.stream); this.micAn = this.ctx.createAnalyser(); this.micAn.fftSize = 512; s.connect(this.micAn); } catch {} }
  wire(p) {
    const c = this.ctx; if (!c || !p.stream) return;
    try { p.src = c.createMediaStreamSource(p.stream); } catch { return; }
    p.an = c.createAnalyser(); p.an.fftSize = 512; p.src.connect(p.an);
    p.lp = c.createBiquadFilter(); p.lp.type = 'lowpass'; p.lp.frequency.value = 20000;
    p.g = c.createGain(); p.flat = c.createGain(); p.panG = c.createGain(); p.panG.gain.value = 0;
    p.pan = c.createPanner(); p.pan.panningModel = 'HRTF'; p.pan.distanceModel = 'linear'; p.pan.refDistance = 1.5; p.pan.maxDistance = 24; p.pan.rolloffFactor = 1;
    p.src.connect(p.lp); p.lp.connect(p.g); p.g.connect(p.flat); p.flat.connect(this.out); p.g.connect(p.panG); p.panG.connect(p.pan); p.pan.connect(this.out);
  }

  // ---------------------------------------------------------------- microphone
  get sending() { return this.mode === 'open' ? !this.forceMute : this.mode === 'ptt' ? this.hold && !this.forceMute : false; }
  async setMode(mode) {
    this.error = '';
    if (mode !== 'off' && !this.track) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        this.track = this.stream.getAudioTracks()[0]; this.meter();
      } catch (e) {
        this.mode = 'off'; this.error = e && e.name === 'NotAllowedError' ? 'Microphone blocked. Allow it in the address bar, then pick a mode again.' : 'No microphone found.';
        this.send({ t: 'mic', on: false }); return false;
      }
    }
    if (mode === 'off' && this.track) { this.track.stop(); this.stream = null; this.track = null; this.micAn = null; }
    this.mode = mode;
    for (const p of this.peers.values()) if (p.tx) p.tx.sender.replaceTrack(this.track).catch(() => {});
    this.applyGate(); this.send({ t: 'mic', on: mode !== 'off' });
    return true;
  }
  applyGate() { if (this.track) this.track.enabled = this.sending; }

  // ---------------------------------------------------------------- connections (one per other player)
  // The player with the lower id always makes the offer, so two offers never cross.
  sync(me, ids) {
    this.me = me; if (!me || !window.RTCPeerConnection) return;
    for (const id of ids) if (id !== me && !this.peers.has(id)) {
      const p = { id, init: me < id, sid: null, pc: null };
      this.peers.set(id, p);
      if (p.init) this.restart(p); else this.send({ t: 'rtc', to: id, data: { k: 'hello' } });
    }
    for (const [id, p] of this.peers) if (!ids.includes(id)) { this.close(p); this.peers.delete(id); }
  }
  close(p) {
    try { p.pc && p.pc.close(); } catch {}
    try { p.src && p.src.disconnect(); p.pan && p.pan.disconnect(); p.flat && p.flat.disconnect(); } catch {}
    if (p.el) { p.el.srcObject = null; }
    Object.assign(p, { pc: null, tx: null, stream: null, src: null, an: null, el: null, level: 0, queue: [] });
  }
  make(p, sid) {
    this.close(p); p.sid = sid; p.queue = [];
    const pc = (p.pc = new RTCPeerConnection({ iceServers: this.ice }));
    pc.onicecandidate = (e) => { if (e.candidate && p.pc === pc) this.send({ t: 'rtc', to: p.id, data: { k: 'ice', sid, c: e.candidate.toJSON() } }); };
    pc.ontrack = (e) => {
      if (p.pc !== pc) return;
      p.stream = e.streams[0] || new MediaStream([e.track]);
      // Chrome only feeds a remote stream into Web Audio if a media element is also playing it (muted).
      p.el = new Audio(); p.el.muted = true; p.el.srcObject = p.stream; p.el.play().catch(() => {});
      this.wire(p);
    };
    pc.onconnectionstatechange = () => {
      if (p.pc !== pc) return;
      p.state = pc.connectionState;
      if (pc.connectionState === 'failed') setTimeout(() => { if (p.pc === pc && this.peers.get(p.id) === p) p.init ? this.restart(p) : this.send({ t: 'rtc', to: p.id, data: { k: 'hello' } }); }, 1500 + Math.random() * 1500);
    };
    return pc;
  }
  async restart(p) {
    const sid = Math.random().toString(36).slice(2, 10), pc = this.make(p, sid);
    p.tx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    if (this.track) p.tx.sender.replaceTrack(this.track).catch(() => {});
    try { const offer = await pc.createOffer(); if (p.pc !== pc) return; await pc.setLocalDescription(offer); if (p.pc === pc) this.send({ t: 'rtc', to: p.id, data: { k: 'offer', sid, sdp: pc.localDescription.toJSON() } }); } catch {}
  }
  async signal(from, d) {
    const p = this.peers.get(from); if (!p || !d) return;
    try {
      if (d.k === 'hello') { if (p.init) this.restart(p); return; }
      if (d.k === 'offer' && !p.init) {
        const pc = this.make(p, d.sid);
        await pc.setRemoteDescription(d.sdp);
        if (p.pc !== pc) return; // a newer offer arrived meanwhile
        const tx = pc.getTransceivers()[0]; if (tx) { tx.direction = 'sendrecv'; p.tx = tx; if (this.track) await tx.sender.replaceTrack(this.track); }
        const answer = await pc.createAnswer(); if (p.pc !== pc) return;
        await pc.setLocalDescription(answer);
        this.send({ t: 'rtc', to: from, data: { k: 'answer', sid: d.sid, sdp: pc.localDescription.toJSON() } });
        for (const c of p.queue.splice(0)) pc.addIceCandidate(c).catch(() => {});
        return;
      }
      if (d.sid !== p.sid || !p.pc) return; // from an older connection
      if (d.k === 'answer' && p.init) { await p.pc.setRemoteDescription(d.sdp); for (const c of p.queue.splice(0)) p.pc.addIceCandidate(c).catch(() => {}); }
      else if (d.k === 'ice') { if (p.pc.remoteDescription) p.pc.addIceCandidate(d.c).catch(() => {}); else p.queue.push(d.c); }
    } catch {}
  }

  // ---------------------------------------------------------------- per frame
  rms(an) { an.getFloatTimeDomainData(this.buf); let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i]; return Math.sqrt(s / this.buf.length); }
  // view: { spatial, alive, peers: id -> { x, y, z, alive, blocked } }
  update(view) {
    this.applyGate();
    this.level = this.micAn && this.sending ? this.level * 0.6 + this.rms(this.micAn) * 0.4 : this.level * 0.8;
    this.speaking = this.sending && this.level > 0.02;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const p of this.peers.values()) {
      if (!p.an) continue;
      p.level = p.level * 0.6 + this.rms(p.an) * 0.4; p.speaking = p.level > 0.015;
      const v = view.peers[p.id];
      let flat = 1, spat = 0, gain = 1, lp = 20000;
      if (view.spatial && v) {
        if (!v.alive) { flat = view.alive ? 0 : 1; } // the taken can be heard only by the taken
        else { flat = 0; spat = 1; p.pan.positionX.setTargetAtTime(v.x, t, 0.05); p.pan.positionY.setTargetAtTime(v.y, t, 0.05); p.pan.positionZ.setTargetAtTime(v.z, t, 0.05); if (v.blocked) { gain = 0.6; lp = 750; } }
      }
      p.flat.gain.setTargetAtTime(flat, t, 0.08); p.panG.gain.setTargetAtTime(spat, t, 0.08);
      p.g.gain.setTargetAtTime(gain, t, 0.12); p.lp.frequency.setTargetAtTime(lp, t, 0.12);
    }
  }
  talking(id) { const p = this.peers.get(+id) || this.peers.get(id); return !!(p && p.speaking); }
  connected(id) { const p = this.peers.get(+id) || this.peers.get(id); return !!(p && p.state === 'connected'); }
}
