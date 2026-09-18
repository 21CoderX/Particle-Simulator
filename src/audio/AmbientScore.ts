// Procedural Oppenheimer-style ambient score — dark piano, low drone, sparse strings.
// 100% Web Audio API, no external assets. Inspired by the sparse, ominous Ludwig Göransson palette.

export type ScoreMood = 'void' | 'tension' | 'collapse' | 'ascension';

const MOOD_CFG: Record<ScoreMood, { root: number; mode: number[]; drone: number; dens: number; bright: number }> = {
  // dark minor with flat 2 / flat 6
  void:       { root: 55.0,  mode: [0, 1, 3, 5, 7, 8, 10], drone: 0.18, dens: 0.28, bright: 0.35 },
  tension:    { root: 58.27, mode: [0, 1, 3, 6, 7, 8, 10], drone: 0.22, dens: 0.45, bright: 0.5 },
  collapse:   { root: 51.91, mode: [0, 1, 3, 5, 6, 8, 10], drone: 0.30, dens: 0.55, bright: 0.3 },
  ascension:  { root: 65.41, mode: [0, 2, 3, 5, 7, 8, 10], drone: 0.14, dens: 0.38, bright: 0.7 },
};

export class AmbientScore {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private pianoGain: GainNode | null = null;
  private stringGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private lfo: OscillatorNode | null = null;
  private timer = 0;
  private running = false;
  private mood: ScoreMood = 'void';
  private volume = 0.45;
  private nextNoteAt = 0;
  private nextChordAt = 0;
  private bpm = 48;

  get isPlaying() { return this.running; }
  get currentMood() { return this.mood; }

  async start() {
    if (this.running) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // soft low-pass for cinematic darkness
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.22;
    this.droneGain.connect(this.filter);

    this.pianoGain = ctx.createGain();
    this.pianoGain.gain.value = 0.32;
    this.pianoGain.connect(this.filter);

    this.stringGain = ctx.createGain();
    this.stringGain.gain.value = 0.18;
    this.stringGain.connect(this.filter);

    // slow tremolo LFO on master
    this.lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    this.lfo.frequency.value = 0.08;
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.master.gain);
    this.lfo.start();

    this.spawnDrone();
    this.running = true;
    this.nextNoteAt = ctx.currentTime + 1.5;
    this.nextChordAt = ctx.currentTime + 4;
    this.tick();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.timer);
    try { this.lfo?.stop(); } catch { /* */ }
    this.ctx?.close();
    this.ctx = null;
    this.master = this.droneGain = this.pianoGain = this.stringGain = this.filter = this.lfo = null;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx!.currentTime, 0.15);
  }

  setMood(m: ScoreMood) {
    if (this.mood === m) return;
    this.mood = m;
    if (this.running) this.spawnDrone(true);
  }

  // pulse a low hit when mode switches / supernova etc.
  hit(intensity = 0.5) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(18, t + 1.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * intensity * this.volume, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 1.7);
  }

  private spawnDrone(crossfade = false) {
    if (!this.ctx || !this.droneGain) return;
    const cfg = MOOD_CFG[this.mood];
    const t = this.ctx.currentTime;
    // two detuned sines + a very low sub
    for (const [mul, type, gain] of [
      [1, 'sine', 0.5],
      [2, 'triangle', 0.18],
      [0.5, 'sine', 0.55],
    ] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = cfg.root * mul;
      g.gain.value = 0.0001;
      o.connect(g); g.connect(this.droneGain);
      o.start(t);
      const target = gain * cfg.drone;
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, target), t + (crossfade ? 2.5 : 1.2));
      // auto-stop after long life; refreshed by mood change
      o.stop(t + 120);
      g.gain.setTargetAtTime(0.0001, t + 118, 1);
    }
  }

  private playPiano(freq: number, when: number, dur = 2.4, vel = 0.4) {
    if (!this.ctx || !this.pianoGain) return;
    // additive partials for a dark felt-piano character
    const partials = [1, 2, 3, 4.05, 5.1];
    const amps = [1, 0.45, 0.18, 0.08, 0.04];
    for (let i = 0; i < partials.length; i++) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq * partials[i];
      // slight inharmonicity
      if (i > 2) o.detune.value = (Math.random() - 0.5) * 8;
      const peak = vel * amps[i] * 0.5;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), when + 0.02 + i * 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur * (1 - i * 0.08));
      o.connect(g); g.connect(this.pianoGain);
      o.start(when); o.stop(when + dur + 0.1);
    }
  }

  private playStringPad(freqs: number[], when: number, dur = 6) {
    if (!this.ctx || !this.stringGain) return;
    for (const f of freqs) {
      for (const det of [-6, 0, 7]) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        // filter each voice
        const f2 = this.ctx.createBiquadFilter();
        f2.type = 'lowpass';
        f2.frequency.value = 600 + MOOD_CFG[this.mood].bright * 1200;
        o.connect(f2); f2.connect(g); g.connect(this.stringGain);
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(0.045, when + 1.8);
        g.gain.linearRampToValueAtTime(0.0001, when + dur);
        o.start(when); o.stop(when + dur + 0.05);
      }
    }
  }

  private tick = () => {
    if (!this.running || !this.ctx) return;
    this.timer = requestAnimationFrame(this.tick);
    const t = this.ctx.currentTime;
    const cfg = MOOD_CFG[this.mood];
    const beat = 60 / this.bpm;

    if (t >= this.nextNoteAt) {
      // sparse piano notes from the mode
      if (Math.random() < cfg.dens + 0.25) {
        const deg = cfg.mode[(Math.random() * cfg.mode.length) | 0];
        const oct = Math.random() < 0.55 ? 2 : Math.random() < 0.8 ? 3 : 4;
        const freq = cfg.root * Math.pow(2, oct) * Math.pow(2, deg / 12);
        const vel = 0.25 + Math.random() * 0.45;
        this.playPiano(freq, t + 0.02, 2.2 + Math.random() * 2.5, vel);
        // occasional octave double
        if (Math.random() < 0.3) this.playPiano(freq * 0.5, t + 0.04, 3.5, vel * 0.5);
      }
      this.nextNoteAt = t + beat * (0.75 + Math.random() * 2.5);
    }

    if (t >= this.nextChordAt) {
      // dark string pad on root + minor third + fifth (or variations)
      const base = cfg.root * 2;
      const a = base * Math.pow(2, cfg.mode[0] / 12);
      const b = base * Math.pow(2, cfg.mode[2] / 12);
      const c = base * Math.pow(2, cfg.mode[4] / 12);
      const d = base * Math.pow(2, cfg.mode[Math.random() < 0.5 ? 5 : 6] / 12);
      this.playStringPad([a, b, c, d], t, 7 + Math.random() * 4);
      this.nextChordAt = t + beat * (6 + Math.random() * 8);
    }

    // breathing filter
    if (this.filter) {
      const breathe = 1800 + Math.sin(t * 0.07) * 500 + cfg.bright * 900;
      this.filter.frequency.setTargetAtTime(breathe, t, 0.5);
    }
  };
}

export const SCORE_MOODS: { id: ScoreMood; label: string; icon: string }[] = [
  { id: 'void', label: 'Void', icon: '🌑' },
  { id: 'tension', label: 'Tension', icon: '⏳' },
  { id: 'collapse', label: 'Collapse', icon: '🕳️' },
  { id: 'ascension', label: 'Ascension', icon: '✨' },
];
