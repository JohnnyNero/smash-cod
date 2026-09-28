// Every sound is synthesized with WebAudio, so there are no asset files to ship.
// Positions are panned left/right by stage x.

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.55;
    this.voiceEnabled = true;
    this.quiet = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  // Title-screen attract mode plays at low volume with no announcer.
  setQuiet(q) {
    this.quiet = q;
    if (this.master) this.master.gain.setTargetAtTime(q ? this.volume * 0.25 : this.volume, this.ctx.currentTime, 0.2);
  }

  out(x) {
    if (x === undefined || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-0.9, Math.min(0.9, x / 18));
    p.connect(this.master);
    return p;
  }

  noise(dur, { type = 'lowpass', freq = 1200, freqEnd, q = 0.8, gain = 0.5, attack = 0.002, x, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out(x));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { type = 'sine', freqEnd, gain = 0.3, attack = 0.003, x, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out(x));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Melee swing whoosh; smash attacks are heavier.
  swing(x, heavy) {
    this.noise(heavy ? 0.22 : 0.12, { type: 'bandpass', freq: heavy ? 900 : 1500, freqEnd: heavy ? 2600 : 4000, q: 2, gain: heavy ? 0.3 : 0.18, x });
  }

  // Impact scaled by damage, with a type-flavoured layer.
  hit(x, dmg, type) {
    const g = Math.min(1, 0.25 + dmg / 18);
    this.noise(0.08 + dmg * 0.01, { freq: 2500 - Math.min(1800, dmg * 90), freqEnd: 200, gain: g, x });
    this.tone(160 - Math.min(100, dmg * 5), 0.12 + dmg * 0.01, { type: 'square', freqEnd: 50, gain: g * 0.4, x });
    if (type === 'Electric') this.tone(1200, 0.12, { type: 'sawtooth', freqEnd: 300, gain: 0.12, x });
    if (type === 'Steel') this.tone(1800, 0.25, { type: 'triangle', freqEnd: 1600, gain: 0.12, x });
    if (type === 'Fire') this.noise(0.25, { type: 'bandpass', freq: 800, freqEnd: 300, gain: 0.2, x });
    if (type === 'Water') this.noise(0.2, { type: 'lowpass', freq: 1500, freqEnd: 400, gain: 0.25, x });
    if (type === 'Ghost' || type === 'Poison') this.tone(200, 0.2, { type: 'sine', freqEnd: 90, gain: 0.15, x });
  }

  special(x, type) {
    if (type === 'Electric') {
      this.noise(0.3, { type: 'bandpass', freq: 3000, q: 4, gain: 0.25, x });
      this.tone(220, 0.3, { type: 'sawtooth', freqEnd: 900, gain: 0.1, x });
    } else if (type === 'Steel') {
      this.tone(1400, 0.3, { type: 'triangle', freqEnd: 1300, gain: 0.12, x });
    } else if (type === 'Fire') {
      this.noise(0.6, { type: 'bandpass', freq: 600, freqEnd: 1400, q: 0.7, gain: 0.3, x });
    } else if (type === 'Water' || type === 'Ice') {
      this.noise(0.5, { type: 'lowpass', freq: 2500, freqEnd: 700, gain: 0.3, x });
    } else if (type === 'Ghost' || type === 'Poison' || type === 'Fighting') {
      this.tone(160, 0.4, { type: 'sawtooth', freqEnd: 420, gain: 0.08, x });
    } else {
      this.noise(0.15, { type: 'bandpass', freq: 1200, freqEnd: 3000, q: 1.5, gain: 0.2, x });
    }
  }

  superEffective(x) {
    this.tone(660, 0.12, { type: 'square', gain: 0.12, x });
    this.tone(990, 0.2, { type: 'square', gain: 0.12, delay: 0.08, x });
  }

  statUp(x) {
    for (let i = 0; i < 3; i++) this.tone(500 + i * 200, 0.12, { type: 'triangle', freqEnd: 700 + i * 200, gain: 0.1, delay: i * 0.07, x });
  }

  status(x, kind) {
    if (kind === 'sleep') this.tone(700, 0.6, { type: 'sine', freqEnd: 300, gain: 0.15, x });
    else if (kind === 'seed') this.tone(300, 0.2, { type: 'triangle', freqEnd: 600, gain: 0.12, x });
    else this.noise(0.5, { type: 'highpass', freq: 3000, gain: 0.12, x });
  }

  // Crowd roar: a swelling band of noise.
  crowd(amount = 1) {
    if (this.quiet) return;
    this.noise(1.8, { type: 'bandpass', freq: 900, freqEnd: 600, q: 0.6, gain: 0.35 * amount, attack: 0.25 });
    this.noise(1.4, { type: 'bandpass', freq: 2200, q: 1.2, gain: 0.12 * amount, attack: 0.2, delay: 0.1 });
  }

  switchIn(x) {
    this.tone(400, 0.15, { type: 'square', freqEnd: 900, gain: 0.1, x });
    this.noise(0.25, { type: 'bandpass', freq: 1500, freqEnd: 4000, q: 1, gain: 0.2, x });
  }

  grab(x) { this.noise(0.08, { type: 'bandpass', freq: 700, q: 1, gain: 0.3, x }); }
  dodge(x) { this.noise(0.12, { type: 'highpass', freq: 2500, gain: 0.12, x }); }
  ledge(x) { this.tone(500, 0.06, { type: 'triangle', freqEnd: 700, gain: 0.1, x }); }

  impact(x) { this.noise(0.05, { type: 'bandpass', freq: 4000, q: 2, gain: 0.08, x }); }
  block(x) { this.tone(1400, 0.08, { type: 'triangle', freqEnd: 900, gain: 0.15, x }); }
  shieldBreak(x) {
    this.noise(0.4, { type: 'highpass', freq: 2000, gain: 0.4, x });
    this.tone(700, 0.4, { type: 'sawtooth', freqEnd: 120, gain: 0.2, x });
  }

  jump(x, air) { this.tone(air ? 520 : 380, 0.1, { type: 'triangle', freqEnd: air ? 900 : 620, gain: 0.1, x }); }
  land(x, hard) { this.noise(hard ? 0.18 : 0.08, { freq: 500, gain: hard ? 0.35 : 0.12, x }); }
  dash(x) {
    this.tone(300, 0.2, { type: 'sawtooth', freqEnd: 1800, gain: 0.1, x });
    this.noise(0.2, { type: 'highpass', freq: 2500, gain: 0.15, x });
  }
  launch(x, power) {
    this.noise(0.5, { type: 'bandpass', freq: 1400, freqEnd: 400, q: 0.8, gain: Math.min(0.6, power * 0.02), x });
  }

  ko(x) {
    this.noise(1.6, { freq: 3000, freqEnd: 80, gain: 1.0, x });
    this.tone(55, 1.2, { freqEnd: 25, gain: 0.9, x });
    this.tone(880, 0.6, { type: 'sawtooth', freqEnd: 110, gain: 0.15, x });
  }

  ui() { this.tone(880, 0.05, { type: 'square', gain: 0.06 }); }
  uiConfirm() {
    this.tone(660, 0.08, { type: 'square', gain: 0.08 });
    this.tone(990, 0.1, { type: 'square', gain: 0.08, delay: 0.07 });
  }
  uiBack() { this.tone(440, 0.1, { type: 'square', freqEnd: 300, gain: 0.07 }); }
  beep(high) { this.tone(high ? 1320 : 660, high ? 0.5 : 0.18, { type: 'square', gain: 0.12 }); }

  say(text) {
    if (!this.voiceEnabled || this.quiet || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.pitch = 0.4;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    } catch {
      // Speech is a bonus; ignore browsers that block it.
    }
  }
}
