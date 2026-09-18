// ─────────────────────────────────────────────────────────────────────────────
// PARTICLE FORGE v3 — ultra-optimised Canvas2D engine
//  • Float32Array SoA state, precomputed rotation + inverse matrices
//  • Bucketed palette rendering, visual styles (dots/trails/glow/neon/crystal/dust)
//  • Camera: user yaw/pitch + zoom + auto-rotate
//  • Simulation knobs: bloom, trail, size, gravity, turbulence, hue shift
// ─────────────────────────────────────────────────────────────────────────────

export type ModeId =
  | 'galaxy' | 'blackhole' | 'supernova' | 'solarsystem'
  | 'tesseract' | 'hypersphere' | 'thunder' | 'vortex'
  | 'dna' | 'nebula' | 'aurora' | 'fireworks'
  | 'swarm' | 'lorenz' | 'matrix' | 'snow'
  | 'fire' | 'ocean' | 'magnetic' | 'lissajous' | 'fractal';

export type VisualStyle = 'dots' | 'trails' | 'glow' | 'neon' | 'crystal' | 'dust';

export interface ModeMeta { label: string; icon: string; desc: string; tag: string; }

export const MODES: Record<ModeId, ModeMeta> = {
  galaxy:      { label: 'Galaxy',         icon: '🌌', tag: 'Spiral',      desc: 'Differentially rotating spiral arms' },
  blackhole:   { label: 'Black Hole',     icon: '🕳️', tag: 'Gravity',     desc: 'Accretion disk + event horizon' },
  supernova:   { label: 'Supernova',      icon: '💥', tag: 'Explosion',   desc: 'Shockwave with collapsing filaments' },
  solarsystem: { label: 'Solar System',   icon: '🪐', tag: 'Orbits',      desc: 'Nested Keplerian orbits' },
  tesseract:   { label: 'Tesseract 4D',   icon: '🔷', tag: '4D',          desc: 'Hypercube rotating in 4D planes' },
  hypersphere: { label: 'Hypersphere 4D', icon: '🪩', tag: '4D',          desc: '3-sphere in double rotation' },
  thunder:     { label: 'Thunder',        icon: '⚡', tag: 'Plasma',      desc: 'Branching lightning + storm clouds' },
  vortex:      { label: 'Vortex',         icon: '🌪️', tag: 'Flow',        desc: 'Twisting tornado funnel' },
  dna:         { label: 'DNA Helix',      icon: '🧬', tag: 'Organic',     desc: 'Double helix with base pairs' },
  nebula:      { label: 'Nebula',         icon: '☁️', tag: 'Gas',         desc: 'Turbulent curl-flow gas cloud' },
  aurora:      { label: 'Aurora',         icon: '🌌', tag: 'Atmospheric', desc: 'Borealis field lines' },
  fireworks:   { label: 'Fireworks',      icon: '🎆', tag: 'Burst',       desc: 'Popping particle shells' },
  swarm:       { label: 'Fireflies',      icon: '✨', tag: 'Boids',       desc: 'Emergent flocking behaviour' },
  lorenz:      { label: 'Lorenz',         icon: '🦋', tag: 'Chaos',       desc: 'Strange attractor butterfly' },
  matrix:      { label: 'Matrix Rain',    icon: '🟢', tag: 'Cyber',       desc: 'Falling glyph rain' },
  snow:        { label: 'Snowfall',       icon: '❄️', tag: 'Weather',     desc: 'Drifting 3D snow flakes' },
  fire:        { label: 'Campfire',       icon: '🔥', tag: 'Thermal',     desc: 'Rising flames and embers' },
  ocean:       { label: 'Ocean',          icon: '🌊', tag: 'Waves',       desc: 'Sine-wave particle sea' },
  magnetic:    { label: 'Magnetic Field', icon: '🧲', tag: 'Field',       desc: 'Dipole field lines' },
  lissajous:   { label: 'Lissajous',      icon: '➰', tag: 'Harmonic',    desc: '3D harmonic Lissajous knots' },
  fractal:     { label: 'Sierpiński',     icon: '🔺', tag: 'Fractal',     desc: 'Sierpiński tetrahedron chaos' },
};

export const MODE_ORDER: ModeId[] = Object.keys(MODES) as ModeId[];

export const VISUAL_STYLES: { id: VisualStyle; label: string; icon: string }[] = [
  { id: 'dots',    label: 'Dots',    icon: '·' },
  { id: 'trails',  label: 'Trails',  icon: '⎯' },
  { id: 'glow',    label: 'Glow',    icon: '◉' },
  { id: 'neon',    label: 'Neon',    icon: '◈' },
  { id: 'crystal', label: 'Crystal', icon: '◆' },
  { id: 'dust',    label: 'Dust',    icon: '∴' },
];

export type HandKind = 'attract' | 'repel' | 'vortex' | 'freeze';
export interface HandForce { x: number; y: number; kind: HandKind; strength: number; }

interface ModeCfg { trail: number; pitch: number; yawSpeed: number; pSize: number; spring: number; damp: number; }

const CFG: Record<ModeId, ModeCfg> = {
  galaxy:      { trail: 0.28, pitch: 0.92, yawSpeed: 0.05, pSize: 1.55, spring: 4.4, damp: 3.8 },
  blackhole:   { trail: 0.14, pitch: 1.05, yawSpeed: 0.04, pSize: 1.5,  spring: 0,   damp: 0.12 },
  supernova:   { trail: 0.18, pitch: 0.35, yawSpeed: 0.12, pSize: 1.7,  spring: 0,   damp: 0.55 },
  solarsystem: { trail: 0.22, pitch: 0.55, yawSpeed: 0.0,  pSize: 1.6,  spring: 0,   damp: 0.02 },
  tesseract:   { trail: 0.28, pitch: 0.25, yawSpeed: 0.20, pSize: 1.8,  spring: 9,   damp: 5.8 },
  hypersphere: { trail: 0.26, pitch: 0.10, yawSpeed: 0.16, pSize: 1.8,  spring: 8,   damp: 5.4 },
  thunder:     { trail: 0.32, pitch: 0,    yawSpeed: 0,    pSize: 1.7,  spring: 28,  damp: 10 },
  vortex:      { trail: 0.22, pitch: 0.40, yawSpeed: 0.0,  pSize: 1.7,  spring: 6.8, damp: 4.8 },
  dna:         { trail: 0.30, pitch: 0.35, yawSpeed: 0.0,  pSize: 2.0,  spring: 8.5, damp: 5.6 },
  nebula:      { trail: 0.08, pitch: 0.15, yawSpeed: 0.05, pSize: 1.9,  spring: 0,   damp: 0.4 },
  aurora:      { trail: 0.14, pitch: 0,    yawSpeed: 0,    pSize: 2.0,  spring: 5.5, damp: 3.2 },
  fireworks:   { trail: 0.22, pitch: 0.45, yawSpeed: 0.10, pSize: 1.8,  spring: 0,   damp: 0.9 },
  swarm:       { trail: 0.12, pitch: 0.35, yawSpeed: 0.0,  pSize: 1.7,  spring: 0,   damp: 0.6 },
  lorenz:      { trail: 0.04, pitch: 0.35, yawSpeed: 0.20, pSize: 1.5,  spring: 0,   damp: 0.5 },
  matrix:      { trail: 0.18, pitch: 0,    yawSpeed: 0,    pSize: 1.6,  spring: 14,  damp: 7.5 },
  snow:        { trail: 0.10, pitch: 0.0,  yawSpeed: 0.04, pSize: 1.7,  spring: 3,   damp: 2.0 },
  fire:        { trail: 0.22, pitch: 0,    yawSpeed: 0,    pSize: 2.1,  spring: 0,   damp: 1.6 },
  ocean:       { trail: 0.20, pitch: 0.55, yawSpeed: 0.08, pSize: 1.8,  spring: 24,  damp: 9.0 },
  magnetic:    { trail: 0.20, pitch: 0.7,  yawSpeed: 0.10, pSize: 1.6,  spring: 0,   damp: 0.25 },
  lissajous:   { trail: 0.20, pitch: 0.5,  yawSpeed: 0.22, pSize: 1.7,  spring: 14,  damp: 8 },
  fractal:     { trail: 0.10, pitch: -0.25,yawSpeed: 0.1,  pSize: 1.8,  spring: 0,   damp: 0.2 },
};

const NBUCKETS = 16;
const hsla = (h: number, s: number, l: number, a: number) =>
  `hsla(${h | 0},${s | 0}%,${l | 0}%,${a.toFixed(2)})`;

function buildPalette(mode: ModeId, hueShift: number): string[] {
  const out: string[] = new Array(NBUCKETS);
  const hs = hueShift;
  for (let i = 0; i < NBUCKETS; i++) {
    const f = i / (NBUCKETS - 1);
    switch (mode) {
      case 'galaxy':      out[i] = f < 0.25 ? hsla(45 + f * 40 + hs, 92, 80 - f * 30, 0.85) : hsla(215 + f * 60 + hs, 88, 62, 0.7); break;
      case 'blackhole':   out[i] = hsla((f < 0.4 ? 210 - f * 100 : 38 - (f - 0.4) * 20) + hs, 96, 82 - f * 32, 0.82); break;
      case 'supernova':   out[i] = hsla(20 + f * 50 + hs, 95, 80 - f * 35, 0.85); break;
      case 'solarsystem': out[i] = hsla(40 + f * 30 + hs, 85, 78 - f * 30, 0.85); break;
      case 'tesseract':   out[i] = hsla(185 + f * 115 + hs, 96, 62 + f * 10, 0.82); break;
      case 'hypersphere': out[i] = hsla(140 + f * 90 + hs, 90, 60 + f * 10, 0.75); break;
      case 'thunder':     out[i] = f < 0.7 ? hsla(215 + f * 40 + hs, 100, 72 + f * 20, 0.9) : hsla(260 + hs, 60, 40, 0.5); break;
      case 'vortex':      out[i] = hsla(170 + f * 40 + hs, 82, 56 + f * 20, 0.72); break;
      case 'dna':         out[i] = f < 0.4 ? hsla(190 + hs, 96, 60, 0.85) : f < 0.8 ? hsla(310 + hs, 92, 62, 0.85) : hsla(55 + hs, 96, 80, 0.9); break;
      case 'nebula':      out[i] = hsla(230 + f * 110 + hs, 86, 58 + f * 14, 0.55); break;
      case 'aurora':      out[i] = hsla(120 + f * 120 + hs, 90, 58 + f * 14, 0.7); break;
      case 'fireworks':   out[i] = hsla(f * 360 + hs, 96, 62 + f * 8, 0.85); break;
      case 'swarm':       out[i] = hsla(50 + f * 40 + hs, 95, 70 + f * 12, 0.8); break;
      case 'lorenz':      out[i] = hsla(20 + f * 200 + hs, 90, 60, 0.75); break;
      case 'matrix':      out[i] = hsla(120 + f * 25 + hs, 100, 35 + f * 30, f < 0.3 ? 0.95 : 0.6); break;
      case 'snow':        out[i] = hsla(200 + f * 40 + hs, 20, 80 + f * 10, 0.7 + f * 0.2); break;
      case 'fire':        out[i] = hsla(10 + f * 45 + hs, 100, 60 + f * 20, 0.85 - f * 0.2); break;
      case 'ocean':       out[i] = hsla(185 + f * 40 + hs, 85, 45 + f * 20, 0.75); break;
      case 'magnetic':    out[i] = hsla(280 + f * 140 + hs, 88, 62 + f * 8, 0.8); break;
      case 'lissajous':   out[i] = hsla(f * 360 + hs, 90, 62, 0.8); break;
      case 'fractal':     out[i] = hsla(320 + f * 80 + hs, 90, 60 + f * 10, 0.8); break;
    }
  }
  return out;
}

// ── lightning ────────────────────────────────────────────────────────────────
interface Bolt { pts: Float32Array; strokes: number[][]; n: number; born: number; life: number; }

function midBolt(x0: number, y0: number, x1: number, y1: number, iters: number, rough: number): number[] {
  let pts = [x0, y0, x1, y1];
  let off = rough;
  for (let it = 0; it < iters; it++) {
    const next: number[] = [];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
      next.push(ax, ay);
      const mx = (ax + bx) * 0.5, my = (ay + by) * 0.5;
      const dx = bx - ax, dy = by - ay;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const d = (Math.random() - 0.5) * off;
      next.push(mx + (-dy / len) * d, my + (dx / len) * d);
    }
    next.push(pts[pts.length - 2], pts[pts.length - 1]);
    pts = next; off *= 0.55;
  }
  return pts;
}
function makeBolt(now: number): Bolt {
  const x0 = (Math.random() - 0.5) * 1.5;
  const x1 = x0 + (Math.random() - 0.5) * 0.7;
  const main = midBolt(x0, -1.05, x1, 0.92, 6, 0.55);
  const all: number[] = main.slice();
  const strokes: number[][] = [[0, main.length]];
  const nb = 2 + ((Math.random() * 3) | 0);
  for (let b = 0; b < nb; b++) {
    const at = (8 + ((Math.random() * (main.length / 2 - 20)) | 0)) * 2;
    const sx = main[at], sy = main[at + 1];
    const br = midBolt(sx, sy, sx + (Math.random() - 0.5) * 0.8, sy + 0.25 + Math.random() * 0.45, 4, 0.3);
    strokes.push([all.length, all.length + br.length]);
    for (let k = 0; k < br.length; k++) all.push(br[k]);
  }
  return { pts: new Float32Array(all), strokes, n: all.length >> 1, born: now, life: 0.7 + Math.random() * 0.9 };
}

let tessCache: { V: number[][]; E: number[][] } | null = null;
function getTesseract() {
  if (tessCache) return tessCache;
  const V: number[][] = [];
  for (let i = 0; i < 16; i++)
    V.push([(i & 1) * 2 - 1, ((i >> 1) & 1) * 2 - 1, ((i >> 2) & 1) * 2 - 1, ((i >> 3) & 1) * 2 - 1]);
  const E: number[][] = [];
  for (let i = 0; i < 16; i++)
    for (let b = 0; b < 4; b++) { const j = i ^ (1 << b); if (j > i) E.push([i, j]); }
  tessCache = { V, E };
  return tessCache;
}

// ── engine ───────────────────────────────────────────────────────────────────
export class ParticleEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  w = 0; h = 0; dpr = 1;

  mode: ModeId = 'galaxy';
  count = 12000;
  timeScale = 1;
  forceScale = 1;
  slowMo = false;
  freeze = false;
  hands: HandForce[] = [];

  // visual / sim knobs
  visualStyle: VisualStyle = 'glow';
  bloom = 0.55;
  trailMul = 1;
  sizeMul = 1;
  gravity = 0;
  turbulence = 0;
  hueShift = 0;
  autoRotate = true;

  // camera (user-controlled)
  camYaw = 0;
  camPitch = 0;
  zoom = 1;

  t = 0;
  private m00 = 1; private m01 = 0; private m02 = 0;
  private m10 = 0; private m11 = 1; private m12 = 0;
  private m20 = 0; private m21 = 0; private m22 = 1;
  private i00 = 1; private i01 = 0; private i02 = 0;
  private i10 = 0; private i11 = 1; private i12 = 0;
  private i20 = 0; private i21 = 0; private i22 = 1;
  private pitch = 0; private yaw = 0; private pitchT = 0;

  private px!: Float32Array; private py!: Float32Array; private pz!: Float32Array;
  private vx!: Float32Array; private vy!: Float32Array; private vz!: Float32Array;
  private sa!: Float32Array; private sb!: Float32Array; private sc!: Float32Array;
  private sd!: Float32Array; private se!: Float32Array; private sf!: Float32Array;
  private sx!: Float32Array; private sy!: Float32Array; private ss!: Float32Array;
  // previous screen pos for trails
  private lx!: Float32Array; private ly!: Float32Array;
  private buckets: number[][] = [];
  private colors: string[] = [];
  private morph = 1;
  private bolts: Bolt[] = [];
  private flash = 0;
  private paletteDirty = true;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.alloc(this.count);
    this.setMode('galaxy', true);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.max(1, (rect.width * this.dpr) | 0);
    this.h = Math.max(1, (rect.height * this.dpr) | 0);
    this.canvas.width = this.w; this.canvas.height = this.h;
    this.ctx.fillStyle = '#02040c'; this.ctx.fillRect(0, 0, this.w, this.h);
  }

  setCount(n: number) {
    if (n === this.count) return;
    this.count = n; this.alloc(n); this.setMode(this.mode, true);
  }

  setHueShift(h: number) {
    if (h === this.hueShift) return;
    this.hueShift = h; this.paletteDirty = true;
  }

  private alloc(n: number) {
    this.px = new Float32Array(n); this.py = new Float32Array(n); this.pz = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n); this.vz = new Float32Array(n);
    this.sa = new Float32Array(n); this.sb = new Float32Array(n); this.sc = new Float32Array(n);
    this.sd = new Float32Array(n); this.se = new Float32Array(n); this.sf = new Float32Array(n);
    this.sx = new Float32Array(n); this.sy = new Float32Array(n); this.ss = new Float32Array(n);
    this.lx = new Float32Array(n); this.ly = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = (Math.random() - 0.5) * 2.5;
      this.py[i] = (Math.random() - 0.5) * 2.5;
      this.pz[i] = (Math.random() - 0.5) * 2.5;
    }
  }

  setMode(mode: ModeId, hard = false) {
    this.mode = mode;
    this.paletteDirty = true;
    this.morph = hard ? 1 : 0;
    const n = this.count;
    const bucketOf = new Uint8Array(n);
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.6666667;
    const rand = Math.random;

    for (let i = 0; i < n; i++) {
      const r1 = rand(), r2 = rand(), r3 = rand(), r4 = rand();
      this.vx[i] = this.vy[i] = this.vz[i] = 0;
      switch (mode) {
        case 'galaxy': {
          if (r1 < 0.14) {
            this.sa[i] = -1; this.sb[i] = g() * 0.16; this.sc[i] = g() * 0.16; this.sd[i] = g() * 0.13;
            bucketOf[i] = (rand() * 4) | 0;
          } else {
            const r = 0.1 + Math.pow(r2, 0.72) * 1.05;
            this.sa[i] = r; this.sb[i] = (rand() * 3) | 0;
            this.sc[i] = g() * 0.32 * (1.25 - r * 0.55);
            this.sd[i] = g() * 0.07 * (1.35 - r * 0.6);
            bucketOf[i] = Math.min(NBUCKETS - 1, 4 + ((r / 1.15) * 12) | 0);
          }
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'blackhole': {
          const r = 0.24 + Math.pow(r1, 0.85) * 1.15;
          const th = r2 * Math.PI * 2;
          this.px[i] = Math.cos(th) * r; this.py[i] = Math.sin(th) * r; this.pz[i] = g() * 0.03 * r;
          const v = Math.sqrt(0.34 / r) * (0.94 + r3 * 0.12);
          this.vx[i] = -Math.sin(th) * v; this.vy[i] = Math.cos(th) * v;
          this.sa[i] = r4;
          bucketOf[i] = Math.min(NBUCKETS - 1, (((r - 0.24) / 1.15) * NBUCKETS) | 0);
          break;
        }
        case 'supernova': {
          this.sa[i] = r1 * Math.PI * 2; this.sb[i] = Math.acos(2 * r2 - 1);
          this.sc[i] = 0.2 + Math.pow(r3, 2) * 1.2; this.se[i] = rand() * 0.2;
          bucketOf[i] = Math.min(NBUCKETS - 1, (this.sc[i] * NBUCKETS * 0.9) | 0);
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'solarsystem': {
          const p = Math.pow(r1, 0.6);
          const r = 0.18 + p * 1.0;
          this.sa[i] = r; this.sb[i] = rand() * Math.PI * 2;
          this.sc[i] = Math.sqrt(0.28 / r); this.sd[i] = g() * 0.012; this.se[i] = g() * 0.012;
          this.sf[i] = r2 * 0.08;
          bucketOf[i] = Math.min(NBUCKETS - 1, (p * NBUCKETS) | 0);
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'tesseract': {
          this.sa[i] = i % 32; this.sb[i] = (i / n) % 1;
          this.sc[i] = g() * 0.012; this.sd[i] = g() * 0.012;
          bucketOf[i] = (this.sa[i] | 0) % NBUCKETS;
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'hypersphere': {
          let a = g(), b = g(), c = g(), d = g();
          const l = Math.sqrt(a * a + b * b + c * c + d * d) || 1;
          this.sa[i] = a / l; this.sb[i] = b / l; this.sc[i] = c / l; this.sd[i] = d / l;
          bucketOf[i] = Math.min(NBUCKETS - 1, (((this.sd[i] + 1) * 0.5) * NBUCKETS) | 0);
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'thunder': {
          const ambient = r1 < 0.3;
          this.sa[i] = ambient ? -1 : r2; this.sb[i] = i % 3;
          this.sc[i] = g(); this.sd[i] = g();
          bucketOf[i] = ambient ? 12 + ((rand() * 4) | 0) : (rand() * 10) | 0;
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'vortex': {
          const u = Math.pow(r1, 0.85);
          this.sa[i] = u; this.sb[i] = r2 * Math.PI * 2;
          this.sc[i] = 0.75 + r3 * 0.5; this.sd[i] = g();
          bucketOf[i] = Math.min(NBUCKETS - 1, (u * NBUCKETS) | 0);
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'dna': {
          const kind = r1 < 0.42 ? 0 : r1 < 0.84 ? 1 : 2;
          this.sa[i] = kind; this.sb[i] = r2;
          if (kind === 2) { this.sb[i] = ((r2 * 28) | 0) / 28; this.sc[i] = r3 * 2 - 1; }
          else this.sc[i] = g() * 0.02;
          this.sd[i] = g() * 0.02;
          bucketOf[i] = kind === 0 ? (rand() * 6) | 0 : kind === 1 ? 7 + ((rand() * 5) | 0) : 13 + ((rand() * 3) | 0);
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'nebula': {
          this.px[i] = g() * 0.8; this.py[i] = g() * 0.55; this.pz[i] = g() * 0.5;
          this.sa[i] = r1; this.sb[i] = r2 * Math.PI * 2; this.sc[i] = 0.5 + r3;
          bucketOf[i] = (r4 * NBUCKETS) | 0;
          break;
        }
        case 'aurora': {
          this.sa[i] = r1; this.sb[i] = (r2 - 0.5) * 2.2; this.sc[i] = r3; this.sd[i] = g() * 0.04;
          bucketOf[i] = Math.min(NBUCKETS - 1, (r1 * NBUCKETS) | 0);
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'fireworks': {
          this.sa[i] = rand() * 6 + 2; this.sb[i] = rand() * Math.PI * 2;
          this.sc[i] = rand() * Math.PI; this.sd[i] = 0.5 + rand() * 0.9; this.sf[i] = rand();
          bucketOf[i] = (this.sf[i] * NBUCKETS) | 0;
          this.px[i] = (rand() - 0.5) * 1.6; this.py[i] = (rand() - 0.5) * 0.9; this.pz[i] = (rand() - 0.5) * 0.3;
          break;
        }
        case 'swarm': {
          this.px[i] = (rand() - 0.5) * 2.2; this.py[i] = (rand() - 0.5) * 1.6; this.pz[i] = (rand() - 0.5) * 1.2;
          this.vx[i] = (rand() - 0.5) * 0.6; this.vy[i] = (rand() - 0.5) * 0.6; this.vz[i] = (rand() - 0.5) * 0.6;
          this.sa[i] = rand(); this.sb[i] = rand();
          bucketOf[i] = (rand() * NBUCKETS) | 0;
          break;
        }
        case 'lorenz': {
          this.px[i] = 0.01 + rand() * 0.01; this.py[i] = 0; this.pz[i] = 0;
          this.sa[i] = r1 * 0.2;
          bucketOf[i] = (r2 * NBUCKETS) | 0;
          break;
        }
        case 'matrix': {
          this.sa[i] = (rand() - 0.5) * 3.4; this.sb[i] = 0.4 + rand() * 2.0;
          this.sc[i] = rand(); this.sd[i] = rand() * 2;
          bucketOf[i] = Math.min(NBUCKETS - 1, ((this.sc[i] * 0.7 + 0.3) * (NBUCKETS - 1)) | 0);
          this.py[i] = (rand() - 0.5) * 2; this.px[i] = this.sa[i]; this.pz[i] = 0;
          break;
        }
        case 'snow': {
          this.sa[i] = (rand() - 0.5) * 3.0; this.sb[i] = 0.15 + rand() * 0.35;
          this.sc[i] = rand() * Math.PI * 2; this.sd[i] = rand() * 0.8 + 0.2;
          this.se[i] = (rand() - 0.5) * 0.9; this.sf[i] = rand() * 2 + 1;
          bucketOf[i] = (rand() * NBUCKETS) | 0;
          this.px[i] = this.sa[i]; this.py[i] = rand() * 2 - 1; this.pz[i] = this.se[i];
          break;
        }
        case 'fire': {
          this.sa[i] = (rand() - 0.5) * 0.25; this.sb[i] = rand() * 0.9 + 0.25;
          this.sc[i] = rand() * 3; this.sd[i] = rand();
          bucketOf[i] = Math.min(NBUCKETS - 1, (this.sd[i] * NBUCKETS) | 0);
          this.px[i] = this.sa[i]; this.py[i] = -0.85; this.pz[i] = (rand() - 0.5) * 0.05;
          break;
        }
        case 'ocean': {
          this.sa[i] = r1; this.sb[i] = r2; this.sc[i] = r1 * 7.3 + r2 * 5.7;
          bucketOf[i] = Math.min(NBUCKETS - 1, ((0.5 + 0.5 * Math.sin(this.sc[i])) * NBUCKETS) | 0);
          this.px[i] = (r1 - 0.5) * 2.2; this.py[i] = 0; this.pz[i] = (r2 - 0.5) * 2.2;
          break;
        }
        case 'magnetic': {
          this.sa[i] = r1; this.sb[i] = r2 * Math.PI * 2; this.sc[i] = (r3 - 0.5) * Math.PI;
          bucketOf[i] = (r1 * NBUCKETS) | 0;
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'lissajous': {
          this.sa[i] = r1 * Math.PI * 2;
          this.sb[i] = 2 + (i % 5); this.sc[i] = 3 + ((i * 3) % 4); this.sd[i] = 4 + ((i * 7) % 3);
          this.se[i] = r2; this.sf[i] = r3;
          bucketOf[i] = (r4 * NBUCKETS) | 0;
          this.px[i] = this.py[i] = this.pz[i] = 0;
          break;
        }
        case 'fractal': {
          this.px[i] = (rand() - 0.5) * 0.2; this.py[i] = (rand() - 0.5) * 0.2; this.pz[i] = (rand() - 0.5) * 0.2;
          this.sa[i] = i % 4;
          bucketOf[i] = ((i % 4) * 4) | 0;
          break;
        }
      }
    }

    this.buckets = Array.from({ length: NBUCKETS }, () => [] as number[]);
    for (let i = 0; i < n; i++) this.buckets[bucketOf[i]].push(i);
    if (mode === 'thunder') this.bolts = [makeBolt(this.t), makeBolt(this.t), makeBolt(this.t)];
  }

  // ── camera ─────────────────────────────────────────────────────────────────
  addLook(dx: number, dy: number) {
    this.camYaw += dx;
    this.camPitch = Math.max(-1.35, Math.min(1.35, this.camPitch + dy));
  }
  addZoom(dz: number) {
    this.zoom = Math.max(0.35, Math.min(3.2, this.zoom + dz));
  }
  resetCamera() {
    this.camYaw = 0; this.camPitch = 0; this.zoom = 1;
  }

  private updateRot(dtRaw: number) {
    const cfg = CFG[this.mode];
    this.pitchT += (cfg.pitch - this.pitchT) * Math.min(1, dtRaw * 3);
    if (this.autoRotate) this.yaw += cfg.yawSpeed * dtRaw * this.timeScale;
    this.pitch = this.pitchT + this.camPitch;
    const totalYaw = this.yaw + this.camYaw;
    const cy = Math.cos(totalYaw), sy = Math.sin(totalYaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.m00 = cy; this.m01 = 0; this.m02 = sy;
    this.m10 = sy * sp; this.m11 = cp; this.m12 = -cy * sp;
    this.m20 = -sy * cp; this.m21 = sp; this.m22 = cy * cp;
    this.i00 = cy; this.i10 = 0; this.i20 = -sy;
    this.i01 = sy * sp; this.i11 = cp; this.i21 = sp;
    this.i02 = sy * cp; this.i12 = -sp; this.i22 = cy;
  }

  private worldScale() { return Math.min(this.w, this.h) * 0.42 * this.zoom; }

  // ── frame ──────────────────────────────────────────────────────────────────
  frame(dtRaw: number) {
    if (this.paletteDirty) {
      this.colors = buildPalette(this.mode, this.hueShift);
      this.paletteDirty = false;
    }
    const cfg = CFG[this.mode];
    this.updateRot(dtRaw);
    const dt = Math.min(dtRaw, 0.033) * this.timeScale * (this.slowMo ? 0.18 : 1) * (this.freeze ? 0 : 1);
    if (!this.freeze) this.t += dt;
    this.morph = Math.min(1, this.morph + dtRaw * 1.4);
    this.update(dt, cfg);
    this.project();
    this.render(cfg, dtRaw);
  }

  private update(dt: number, cfg: ModeCfg) {
    const n = this.count;
    const t = this.t;
    const k = cfg.spring * (0.35 + 0.65 * this.morph);
    const dampF = Math.exp(-cfg.damp * dt);
    const VMAX = 3.4, VMAX2 = VMAX * VMAX;
    const px = this.px, py = this.py, pz = this.pz;
    const vx = this.vx, vy = this.vy, vz = this.vz;
    const sa = this.sa, sb = this.sb, sc = this.sc, sd = this.sd, se = this.se, sf = this.sf;
    const turb = this.turbulence;
    const grav = this.gravity;

    switch (this.mode) {
      case 'galaxy': {
        for (let i = 0; i < n; i++) {
          let tx: number, ty: number, tz: number;
          if (sa[i] < 0) {
            const wob = 1 + 0.06 * Math.sin(t * 0.7 + i);
            tx = sb[i] * wob; ty = sc[i] * wob; tz = sd[i];
          } else {
            const r = sa[i];
            const th = sb[i] * 2.094395 + r * 2.7 + sc[i] + t * (0.85 / (0.18 + r));
            tx = Math.cos(th) * r; ty = Math.sin(th) * r * 0.98; tz = sd[i];
          }
          vx[i] = (vx[i] + (tx - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (ty - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (tz - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'blackhole': {
        const GM = 0.34, rh = 0.13;
        for (let i = 0; i < n; i++) {
          const x = px[i], y = py[i], z = pz[i];
          const r2 = x * x + y * y + z * z + 0.002;
          const r = Math.sqrt(r2);
          const a = -GM / (r2 * r);
          vx[i] += x * a * dt; vy[i] += y * a * dt; vz[i] += (z * a - z * 6) * dt;
          vx[i] *= 1 - 0.028 * dt; vy[i] *= 1 - 0.028 * dt; vz[i] *= 1 - 0.5 * dt;
          if (r < rh || r > 2.6) {
            const nr = 1.05 + sa[i] * 0.35;
            const th = Math.random() * 6.283185;
            px[i] = Math.cos(th) * nr; py[i] = Math.sin(th) * nr; pz[i] = (Math.random() - 0.5) * 0.05;
            const v = Math.sqrt(GM / nr) * 0.98;
            vx[i] = -Math.sin(th) * v; vy[i] = Math.cos(th) * v; vz[i] = 0;
          }
        }
        break;
      }
      case 'supernova': {
        const phase = (t * 0.35) % 1;
        const pulse = phase < 0.55 ? phase * 2.2 : (1 - phase) * 1.2;
        for (let i = 0; i < n; i++) {
          const th = sa[i], ph = sb[i];
          const sp0 = Math.sin(ph), cp0 = Math.cos(ph);
          const rr = Math.max(0.02, sc[i] * pulse + se[i] * Math.sin(t * 2 + i));
          const tx = Math.cos(th) * sp0 * rr, ty = cp0 * rr * 0.55, tz = Math.sin(th) * sp0 * rr;
          vx[i] = vx[i] * dampF + (tx - px[i]) * 4 * dt;
          vy[i] = vy[i] * dampF + (ty - py[i]) * 4 * dt;
          vz[i] = vz[i] * dampF + (tz - pz[i]) * 4 * dt;
        }
        break;
      }
      case 'solarsystem': {
        for (let i = 0; i < n; i++) {
          const r = sa[i]; sb[i] += sc[i] * dt;
          const th = sb[i], inc = sf[i];
          const tx = Math.cos(th) * r + sd[i];
          const ty = Math.sin(th) * r * 0.25 * inc + se[i];
          const tz = Math.sin(th) * r + se[i];
          vx[i] += (tx - px[i]) * 1.6 * dt; vy[i] += (ty - py[i]) * 1.6 * dt; vz[i] += (tz - pz[i]) * 1.6 * dt;
          vx[i] *= 1 - cfg.damp * dt; vy[i] *= 1 - cfg.damp * dt; vz[i] *= 1 - cfg.damp * dt;
        }
        break;
      }
      case 'tesseract': {
        const { V, E } = getTesseract();
        const a1 = t * 0.55, a2 = t * 0.34, a3 = t * 0.21;
        const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2), c3 = Math.cos(a3), s3 = Math.sin(a3);
        for (let i = 0; i < n; i++) {
          const e = E[sa[i] | 0]; const f = sb[i];
          const A = V[e[0]], B = V[e[1]];
          let x = (A[0] + (B[0] - A[0]) * f) * 0.62;
          let y = (A[1] + (B[1] - A[1]) * f) * 0.62;
          let z = (A[2] + (B[2] - A[2]) * f) * 0.62;
          let w = (A[3] + (B[3] - A[3]) * f) * 0.62;
          let tmp = x * c1 - w * s1; w = x * s1 + w * c1; x = tmp;
          tmp = y * c2 - z * s2; z = y * s2 + z * c2; y = tmp;
          tmp = z * c3 - w * s3; w = z * s3 + w * c3; z = tmp;
          const pf = 2.1 / (2.1 - w);
          vx[i] = (vx[i] + (x * pf + sc[i] - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (y * pf + sd[i] - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (z * pf - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'hypersphere': {
        const a1 = t * 0.5, a2 = t * 0.31;
        const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
        for (let i = 0; i < n; i++) {
          let x = sa[i], y = sb[i], z = sc[i], w = sd[i];
          let tmp = x * c1 - w * s1; w = x * s1 + w * c1; x = tmp;
          tmp = y * c2 - z * s2; z = y * s2 + z * c2; y = tmp;
          const pf = 1.9 / (1.9 - w * 0.95) * 0.72;
          vx[i] = (vx[i] + (x * pf - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (y * pf - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (z * pf - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'thunder': {
        for (let b = 0; b < this.bolts.length; b++)
          if (t - this.bolts[b].born > this.bolts[b].life) { this.bolts[b] = makeBolt(t); this.flash = 1; }
        for (let i = 0; i < n; i++) {
          let tx: number, ty: number, tz: number;
          if (sa[i] < 0) {
            const s = sc[i], q = sd[i];
            tx = s * 0.9 + 0.22 * Math.sin(t * 0.5 + q * 7);
            ty = -0.88 + q * 0.13 + 0.05 * Math.sin(t * 0.8 + s * 9);
            tz = Math.sin(s * 13 + q * 5) * 0.25;
          } else {
            const bolt = this.bolts[sb[i] | 0];
            const idx = Math.min(bolt.n - 1, (sa[i] * bolt.n) | 0) << 1;
            tx = bolt.pts[idx] + sc[i] * 0.012; ty = bolt.pts[idx + 1] + sd[i] * 0.012; tz = 0;
          }
          vx[i] = (vx[i] + (tx - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (ty - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (tz - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'vortex': {
        for (let i = 0; i < n; i++) {
          const u = sa[i];
          const rad = (0.07 + Math.pow(u, 1.75) * 0.72) * sc[i];
          const th = sb[i] + t * (3.2 / (0.22 + rad)) * 0.55;
          const sway = 0.16 * Math.sin(t * 0.9 + u * 4) * (1 - u);
          vx[i] = (vx[i] + (Math.cos(th) * rad + sway - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (0.92 - u * 1.85 + 0.02 * sd[i] - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (Math.sin(th) * rad - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'dna': {
        const turns = 16.336; // 2.6 * 2π
        for (let i = 0; i < n; i++) {
          const s = sb[i]; const y = (s - 0.5) * 1.9; const base = s * turns + t * 0.7;
          let tx: number, tz: number;
          if (sa[i] === 2) {
            tx = Math.cos(base) * 0.38 * sc[i]; tz = Math.sin(base) * 0.38 * sc[i];
          } else {
            const ang = base + (sa[i] === 1 ? Math.PI : 0);
            tx = Math.cos(ang) * 0.38 + sc[i]; tz = Math.sin(ang) * 0.38 + sd[i];
          }
          vx[i] = (vx[i] + (tx - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (y - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (tz - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'nebula': {
        const fdamp = Math.exp(-cfg.damp * dt);
        for (let i = 0; i < n; i++) {
          const x = px[i], y = py[i], z = pz[i];
          const fx = Math.sin(y * 2.1 + t * 0.35) + Math.sin(z * 1.7 - t * 0.22) * 0.7;
          const fy = Math.sin(z * 2.3 + t * 0.28) + Math.sin(x * 1.9 + t * 0.31) * 0.7;
          const fz = Math.sin(x * 2.0 - t * 0.24) + Math.sin(y * 2.2 + t * 0.26) * 0.7;
          const sp = 0.16 * sc[i];
          vx[i] = (vx[i] + fx * sp * dt * 4) * fdamp;
          vy[i] = (vy[i] + fy * sp * dt * 4) * fdamp;
          vz[i] = (vz[i] + fz * sp * dt * 4) * fdamp;
          const r2 = x * x + y * y * 2 + z * z;
          if (r2 > 1.1) { const pull = (r2 - 1.1) * 0.9 * dt; vx[i] -= x * pull; vy[i] -= y * pull; vz[i] -= z * pull; }
        }
        break;
      }
      case 'aurora': {
        for (let i = 0; i < n; i++) {
          const u = sa[i], h = sb[i];
          const wig = Math.sin(u * 18 + t * 0.6) * 0.25 * (1 - Math.abs(u - 0.5) * 1.6);
          vx[i] = (vx[i] + (h + wig + sd[i] - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + ((u - 0.5) * 1.8 - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (0.35 * Math.sin(u * 9 + t * 0.4) + sc[i] * 0.1 - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'fireworks': {
        for (let i = 0; i < n; i++) {
          let age = t - sa[i];
          if (age > 6) {
            sa[i] = t + Math.random() * 3;
            px[i] = (Math.random() - 0.5) * 1.6; py[i] = (Math.random() - 0.5) * 0.9; pz[i] = (Math.random() - 0.5) * 0.3;
            vx[i] = vy[i] = vz[i] = 0; age = 0;
          }
          if (age < 0) { px[i] += -0.2 * dt; continue; }
          if (age < 0.3) {
            const th = sb[i], ph = sc[i], sp = sd[i] * 2.2;
            vx[i] = Math.cos(th) * Math.sin(ph) * sp;
            vy[i] = Math.cos(ph) * sp;
            vz[i] = Math.sin(th) * Math.sin(ph) * sp;
          }
          vx[i] *= 0.985; vy[i] = vy[i] * 0.985 - 0.55 * dt; vz[i] *= 0.985;
        }
        break;
      }
      case 'swarm': {
        for (let i = 0; i < n; i++) {
          const x = px[i], y = py[i], z = pz[i];
          const wx = Math.sin(t * 0.4 + x * 3.7 + y * 2.1) * 0.18;
          const wy = Math.cos(t * 0.3 + y * 2.9 + z * 1.7) * 0.18 + 0.05 * Math.sin(t + i);
          const wz = Math.sin(t * 0.35 + z * 3.1 + x * 1.3) * 0.18;
          const cx = Math.sin(t * 0.2) * 0.5, cy = Math.cos(t * 0.15) * 0.3, cz = Math.sin(t * 0.25) * 0.4;
          vx[i] = (vx[i] + (wx + (cx - x) * 0.35) * dt * 4) * dampF;
          vy[i] = (vy[i] + (wy + (cy - y) * 0.35) * dt * 4) * dampF;
          vz[i] = (vz[i] + (wz + (cz - z) * 0.35) * dt * 4) * dampF;
        }
        for (let i = 0; i < n; i += 8) {
          const x = px[i], y = py[i], z = pz[i];
          let rx = 0, ry = 0, rz = 0;
          const end = i + 128 < n ? i + 128 : n;
          for (let j = i + 8; j < end; j += 8) {
            const dx = x - px[j], dy = y - py[j], dz = z - pz[j];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < 0.015) { const f = 0.008 / (d2 + 0.001); rx += dx * f; ry += dy * f; rz += dz * f; }
          }
          vx[i] += rx; vy[i] += ry; vz[i] += rz;
        }
        break;
      }
      case 'lorenz': {
        const s = 10, b = 8 / 3, r = 28, h = dt * 0.32;
        for (let i = 0; i < n; i++) {
          let x = px[i], y = py[i], z = pz[i];
          for (let k2 = 0; k2 < 2; k2++) {
            const dx = s * (y - x), dy = x * (r - z) - y, dz = x * y - b * z;
            x += dx * h; y += dy * h; z += dz * h;
          }
          px[i] = x * 0.035; py[i] = y * 0.035; pz[i] = (z - 25) * 0.035;
          vx[i] = vy[i] = vz[i] = 0;
        }
        break;
      }
      case 'matrix': {
        for (let i = 0; i < n; i++) {
          vx[i] = vy[i] = vz[i] = 0;
          py[i] += sb[i] * dt; px[i] = sa[i];
          if (py[i] > 1.2) { py[i] = -1.2 - Math.random() * 0.6; sa[i] = (Math.random() - 0.5) * 3.4; sb[i] = 0.4 + Math.random() * 2.0; }
          pz[i] = Math.sin(t * 0.5 + i * 0.07) * 0.25;
        }
        break;
      }
      case 'snow': {
        for (let i = 0; i < n; i++) {
          vx[i] = vy[i] = vz[i] = 0;
          sc[i] += dt * sf[i];
          py[i] -= sb[i] * dt;
          px[i] = sa[i] + Math.sin(sc[i]) * sd[i] * 0.35;
          pz[i] = se[i] + Math.cos(sc[i] * 0.7) * 0.06;
          if (py[i] < -1.1) {
            py[i] = 1.1; sa[i] = (Math.random() - 0.5) * 3.0; se[i] = (Math.random() - 0.5) * 0.9;
            sb[i] = 0.15 + Math.random() * 0.35; sd[i] = Math.random() * 0.8 + 0.2;
          }
        }
        break;
      }
      case 'fire': {
        for (let i = 0; i < n; i++) {
          sc[i] += dt;
          if (sc[i] > 1.8 || py[i] > 1.05) {
            px[i] = (Math.random() - 0.5) * 0.35 + (Math.random() - 0.5) * 0.1;
            py[i] = -0.88; pz[i] = (Math.random() - 0.5) * 0.1;
            vx[i] = (Math.random() - 0.5) * 0.2;
            vy[i] = sb[i] * (0.9 + Math.random() * 0.4);
            vz[i] = (Math.random() - 0.5) * 0.1; sc[i] = 0;
          } else {
            vx[i] += (Math.sin(sc[i] * 6 + i) * 0.6 - px[i] * 0.3) * dt;
            vy[i] += (0.2 - py[i] * 0.1) * dt;
            vz[i] += Math.sin(sc[i] * 4) * 0.2 * dt;
            vx[i] *= 0.985; vy[i] *= 0.995; vz[i] *= 0.985;
          }
        }
        break;
      }
      case 'ocean': {
        const amp = 0.22;
        for (let i = 0; i < n; i++) {
          const u = sa[i], v = sb[i];
          const tx = (u - 0.5) * 2.2, tz = (v - 0.5) * 2.2;
          const ty = Math.sin(sc[i] + t * 1.2) * amp + Math.cos(u * 11 + t * 0.9) * 0.05;
          vx[i] = (vx[i] + (tx - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (ty - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (tz - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'magnetic': {
        for (let i = 0; i < n; i++) {
          const u = (sa[i] + t * 0.04) % 1;
          const th = sb[i] + t * 0.07;
          const uu = u * Math.PI;
          const rr = Math.sin(uu) * Math.sin(uu) * 0.95;
          const yy = Math.cos(uu) * 0.95;
          const tx = rr * Math.cos(th), ty = yy, tz = rr * Math.sin(th);
          vx[i] += (tx - px[i]) * 3.5 * dt; vy[i] += (ty - py[i]) * 3.5 * dt; vz[i] += (tz - pz[i]) * 3.5 * dt;
          vx[i] *= 1 - cfg.damp * dt; vy[i] *= 1 - cfg.damp * dt; vz[i] *= 1 - cfg.damp * dt;
        }
        break;
      }
      case 'lissajous': {
        for (let i = 0; i < n; i++) {
          const tt = sa[i] + t * 0.5;
          const fx = sb[i] | 0, fy = sc[i] | 0, fz = sd[i] | 0;
          vx[i] = (vx[i] + (Math.cos(fx * tt + se[i] * Math.PI) * 0.75 - px[i]) * k * dt) * dampF;
          vy[i] = (vy[i] + (Math.sin(fy * tt + sf[i] * Math.PI) * 0.75 - py[i]) * k * dt) * dampF;
          vz[i] = (vz[i] + (Math.sin(fz * tt) * 0.75 - pz[i]) * k * dt) * dampF;
        }
        break;
      }
      case 'fractal': {
        const C0x = 0, C0y = 0.9, C0z = 0;
        const C1x = -0.85, C1y = -0.45, C1z = 0.6;
        const C2x = 0.85, C2y = -0.45, C2z = 0.6;
        const C3x = 0, C3y = -0.45, C3z = -0.85;
        const step = dt * 60;
        for (let i = 0; i < n; i++) {
          const id = sa[i] | 0;
          let cx: number, cy: number, cz: number;
          if (id === 0) { cx = C0x; cy = C0y; cz = C0z; }
          else if (id === 1) { cx = C1x; cy = C1y; cz = C1z; }
          else if (id === 2) { cx = C2x; cy = C2y; cz = C2z; }
          else { cx = C3x; cy = C3y; cz = C3z; }
          px[i] += (cx - px[i]) * 0.5 * step;
          py[i] += (cy - py[i]) * 0.5 * step;
          pz[i] += (cz - pz[i]) * 0.5 * step;
          if (Math.random() < 0.03) sa[i] = (Math.random() * 4) | 0;
          vx[i] = vy[i] = vz[i] = 0;
        }
        break;
      }
    }

    // global gravity + turbulence
    if (grav !== 0 || turb > 0) {
      for (let i = 0; i < n; i++) {
        if (grav) vy[i] += grav * dt;
        if (turb > 0) {
          const ti = t * 1.7 + i * 0.13;
          vx[i] += Math.sin(ti) * turb * dt;
          vy[i] += Math.cos(ti * 1.3) * turb * dt;
          vz[i] += Math.sin(ti * 0.7) * turb * dt;
        }
      }
    }

    // hand forces
    if (this.hands.length > 0 && dt > 0) {
      const ax = this.i02, ay = this.i12, az = this.i22;
      const ws = this.worldScale();
      const R2 = (160 * this.dpr / ws) * (160 * this.dpr / ws);
      for (let h = 0; h < this.hands.length; h++) {
        const hand = this.hands[h];
        if (hand.strength <= 0.05) continue;
        const hx = (hand.x * this.dpr - this.w * 0.5) / ws;
        const hy = (hand.y * this.dpr - this.h * 0.5) / ws;
        const sx = this.i00 * hx + this.i01 * hy;
        const sy = this.i10 * hx + this.i11 * hy;
        const sz = this.i20 * hx + this.i21 * hy;
        const S = hand.strength * this.forceScale;
        let fA = 0, fR = 0, fV = 0;
        if (hand.kind === 'attract') { fA = 1.7 * S * dt; fV = 0.55 * S * dt; }
        else if (hand.kind === 'repel') { fR = 2.4 * S * dt; }
        else if (hand.kind === 'vortex') { fA = 0.4 * S * dt; fV = 2.4 * S * dt; }
        else if (hand.kind === 'freeze') { this.freeze = true; continue; }
        for (let i = 0; i < n; i++) {
          const dx = px[i] - sx, dy = py[i] - sy, dz = (pz[i] - sz) * 0.6;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > R2 || d2 < 0.002) continue;
          const inv = 1 / d2;
          const fLin = (fA + fR) * (inv > 1.6 ? 1.6 : inv);
          if (fA) { vx[i] -= dx * fLin; vy[i] -= dy * fLin; vz[i] -= dz * fLin; }
          if (fR) { vx[i] += dx * fLin; vy[i] += dy * fLin; vz[i] += dz * fLin; }
          if (fV) {
            const fs = fV * (inv > 1.3 ? 1.3 : inv);
            vx[i] += (ay * dz - az * dy) * fs - dx * fA * 0.3;
            vy[i] += (az * dx - ax * dz) * fs - dy * fA * 0.3;
            vz[i] += (ax * dy - ay * dx) * fs - dz * fA * 0.3;
          }
        }
      }
    } else {
      this.freeze = false;
    }

    // integrate
    for (let i = 0; i < n; i++) {
      let vxi = vx[i], vyi = vy[i], vzi = vz[i];
      const v2 = vxi * vxi + vyi * vyi + vzi * vzi;
      if (v2 > VMAX2) {
        const s = VMAX / Math.sqrt(v2);
        vxi *= s; vyi *= s; vzi *= s;
        vx[i] = vxi; vy[i] = vyi; vz[i] = vzi;
      }
      px[i] += vxi * dt; py[i] += vyi * dt; pz[i] += vzi * dt;
    }
  }

  private project() {
    const n = this.count;
    const m00 = this.m00, m01 = this.m01, m02 = this.m02;
    const m10 = this.m10, m11 = this.m11, m12 = this.m12;
    const m20 = this.m20, m21 = this.m21, m22 = this.m22;
    const ws = this.worldScale();
    const cx = this.w * 0.5, cyy = this.h * 0.5, FOV = 3.0;
    const px = this.px, py = this.py, pz = this.pz;
    const sx = this.sx, sy = this.sy, ss = this.ss;
    const lx = this.lx, ly = this.ly;
    for (let i = 0; i < n; i++) {
      lx[i] = sx[i]; ly[i] = sy[i];
      const x = px[i], y = py[i], z = pz[i];
      const xr = m00 * x + m01 * y + m02 * z;
      const zr = m20 * x + m21 * y + m22 * z;
      const yr = m10 * x + m11 * y + m12 * z;
      const s = FOV / (FOV - (zr > 2.5 ? 2.5 : zr < -2.5 ? -2.5 : zr));
      ss[i] = s; sx[i] = cx + xr * ws * s; sy[i] = cyy + yr * ws * s;
    }
  }

  private simToScreen(x: number, y: number, z: number): [number, number, number] {
    const xr = this.m00 * x + this.m01 * y + this.m02 * z;
    const yr = this.m10 * x + this.m11 * y + this.m12 * z;
    const zr = this.m20 * x + this.m21 * y + this.m22 * z;
    const ws = this.worldScale();
    const s = 3.0 / (3.0 - zr);
    return [this.w * 0.5 + xr * ws * s, this.h * 0.5 + yr * ws * s, s];
  }

  private render(cfg: ModeCfg, dtRaw: number) {
    const ctx = this.ctx;
    const style = this.visualStyle;
    const trailBase = cfg.trail / this.trailMul;
    const trail = style === 'trails' ? Math.min(0.55, trailBase * 0.55)
      : style === 'dust' ? Math.min(0.5, trailBase * 0.7)
        : Math.min(0.92, Math.max(0.04, trailBase));

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(2,4,12,${trail})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = 'lighter';

    const base = cfg.pSize * this.dpr * this.sizeMul;
    const sizeAdj = Math.sqrt(12000 / Math.max(1500, this.count));
    const bloom = this.bloom;
    const sx = this.sx, sy = this.sy, ss = this.ss, lx = this.lx, ly = this.ly;

    for (let b = 0; b < NBUCKETS; b++) {
      const list = this.buckets[b];
      const len = list.length;
      if (len === 0) continue;
      ctx.fillStyle = this.colors[b];
      ctx.strokeStyle = this.colors[b];

      if (style === 'trails') {
        ctx.lineWidth = Math.max(0.6, base * 0.55);
        ctx.beginPath();
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const x = sx[i], y = sy[i];
          const ox = lx[i] || x, oy = ly[i] || y;
          if ((x - ox) * (x - ox) + (y - oy) * (y - oy) > 0.5) {
            ctx.moveTo(ox, oy); ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
        // bright tips
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const size = Math.max(0.6, Math.min(4, base * ss[i] * sizeAdj * 0.7));
          ctx.fillRect(sx[i] - size * 0.5, sy[i] - size * 0.5, size, size);
        }
      } else if (style === 'glow') {
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const s = ss[i];
          const size = Math.max(0.8, Math.min(6.5, base * s * sizeAdj * (1 + bloom * 0.6)));
          const x = sx[i], y = sy[i];
          // outer soft
          if (bloom > 0.2) {
            ctx.globalAlpha = 0.22 * bloom;
            ctx.fillRect(x - size, y - size, size * 2, size * 2);
          }
          ctx.globalAlpha = 1;
          const core = size * 0.45;
          ctx.fillRect(x - core * 0.5, y - core * 0.5, core, core);
        }
      } else if (style === 'neon') {
        ctx.lineWidth = Math.max(1.2, base * 0.9);
        ctx.shadowBlur = 8 * this.dpr * bloom;
        ctx.shadowColor = this.colors[b];
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const size = Math.max(1, Math.min(5, base * ss[i] * sizeAdj));
          ctx.fillRect(sx[i] - size * 0.5, sy[i] - size * 0.5, size, size);
        }
        ctx.shadowBlur = 0;
      } else if (style === 'crystal') {
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const size = Math.max(1.2, Math.min(5.5, base * ss[i] * sizeAdj * 1.15));
          const x = sx[i], y = sy[i], h = size * 0.5;
          ctx.beginPath();
          ctx.moveTo(x, y - h); ctx.lineTo(x + h, y); ctx.lineTo(x, y + h); ctx.lineTo(x - h, y);
          ctx.closePath(); ctx.fill();
        }
      } else if (style === 'dust') {
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const size = Math.max(0.4, Math.min(2.2, base * ss[i] * sizeAdj * 0.55));
          ctx.globalAlpha = 0.35 + ss[i] * 0.25;
          ctx.fillRect(sx[i] - size * 0.5, sy[i] - size * 0.5, size, size);
        }
        ctx.globalAlpha = 1;
      } else {
        // dots (default)
        for (let j = 0; j < len; j++) {
          const i = list[j];
          const size = Math.max(0.7, Math.min(5.5, base * ss[i] * sizeAdj));
          ctx.fillRect(sx[i] - size * 0.5, sy[i] - size * 0.5, size, size);
        }
      }
    }

    // bloom wash
    if (bloom > 0.35 && (style === 'glow' || style === 'neon')) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(40,60,120,${0.03 * bloom})`;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    if (this.mode === 'thunder') this.renderBolts(ctx, dtRaw);
    if (this.mode === 'blackhole') this.renderHorizon(ctx);
    if (this.mode === 'fire') this.renderFireGlow(ctx);
    if (this.mode === 'supernova' && this.t % 6 < 0.3) {
      ctx.fillStyle = 'rgba(255,230,180,0.12)';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // hand force rings
    for (const hand of this.hands) {
      const hx = hand.x * this.dpr, hy = hand.y * this.dpr;
      const R = (hand.kind === 'repel' ? 68 : 48) * this.dpr;
      const pulse = 1 + 0.12 * Math.sin(this.t * 8);
      const col = hand.kind === 'attract' ? '80,220,255'
        : hand.kind === 'repel' ? '255,140,90'
          : hand.kind === 'freeze' ? '200,220,255' : '190,120,255';
      ctx.strokeStyle = `rgba(${col},${0.5 * hand.strength + 0.2})`;
      ctx.lineWidth = 2 * this.dpr;
      ctx.beginPath(); ctx.arc(hx, hy, R * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},0.18)`;
      ctx.beginPath(); ctx.arc(hx, hy, R * pulse * 1.6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private renderBolts(ctx: CanvasRenderingContext2D, dtRaw: number) {
    for (const bolt of this.bolts) {
      const age = this.t - bolt.born;
      const glow = Math.max(0, 1 - age / (bolt.life * 0.75));
      if (glow <= 0.02) continue;
      for (let sIdx = 0; sIdx < bolt.strokes.length; sIdx++) {
        const [s0, s1] = bolt.strokes[sIdx];
        const main = sIdx === 0;
        ctx.beginPath();
        for (let p = s0; p < s1; p += 2) {
          const [X, Y] = this.simToScreen(bolt.pts[p], bolt.pts[p + 1], 0);
          if (p === s0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(150,180,255,${(main ? 0.28 : 0.15) * glow})`;
        ctx.lineWidth = (main ? 7 : 4) * this.dpr * glow; ctx.stroke();
        ctx.strokeStyle = `rgba(235,242,255,${(main ? 0.85 : 0.5) * glow})`;
        ctx.lineWidth = (main ? 1.8 : 1.1) * this.dpr; ctx.stroke();
      }
    }
    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(160,185,255,${this.flash * 0.13})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.flash *= Math.exp(-dtRaw * 9);
    }
  }

  private renderHorizon(ctx: CanvasRenderingContext2D) {
    const [cx, cy, s] = this.simToScreen(0, 0, 0);
    const R = 0.128 * this.worldScale() * s;
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 2.1);
    grad.addColorStop(0, 'rgba(255,190,110,0.55)');
    grad.addColorStop(0.25, 'rgba(255,140,60,0.16)');
    grad.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, R * 2.1, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,150,0.85)'; ctx.lineWidth = 1.4 * this.dpr; ctx.stroke();
  }

  private renderFireGlow(ctx: CanvasRenderingContext2D) {
    const [gx, gy] = this.simToScreen(0, -0.7, 0);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 180 * this.dpr);
    g.addColorStop(0, 'rgba(255,120,40,0.18)');
    g.addColorStop(0.5, 'rgba(255,70,20,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.w, this.h);
  }
}
