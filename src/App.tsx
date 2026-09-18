import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ParticleEngine,
  MODES,
  MODE_ORDER,
  VISUAL_STYLES,
  type ModeId,
  type HandForce,
  type VisualStyle,
} from './engine/ParticleEngine';
import { useHandTracking, type Gesture } from './hands/useHandTracking';
import { AmbientScore, SCORE_MOODS, type ScoreMood } from './audio/AmbientScore';

const GESTURE_UI: Record<Gesture, { icon: string; label: string; ring: string }> = {
  attract: { icon: '🤏', label: 'Pinch · Attract', ring: 'border-cyan-400/50 bg-cyan-400/10' },
  point:   { icon: '☝️', label: 'Point · Laser',   ring: 'border-sky-400/50 bg-sky-400/10' },
  repel:   { icon: '✋', label: 'Open · Repel',    ring: 'border-orange-400/50 bg-orange-400/10' },
  vortex:  { icon: '✊', label: 'Fist · Vortex',   ring: 'border-fuchsia-400/50 bg-fuchsia-400/10' },
  freeze:  { icon: '✌️', label: 'Peace · Freeze', ring: 'border-indigo-300/50 bg-indigo-300/10' },
  look:    { icon: '☝️', label: 'Point · Look',   ring: 'border-amber-400/50 bg-amber-400/10' },
  zoom:    { icon: '✋', label: 'Palm · Zoom',    ring: 'border-emerald-400/50 bg-emerald-400/10' },
  speed:   { icon: '🤏', label: 'Pinch · Speed',  ring: 'border-pink-400/50 bg-pink-400/10' },
  idle:    { icon: '🖐️', label: 'Tracking…',     ring: 'border-slate-400/30 bg-slate-400/10' },
};

function toHandKind(g: Gesture): HandForce['kind'] | null {
  if (g === 'attract' || g === 'point') return 'attract';
  if (g === 'repel') return 'repel';
  if (g === 'vortex') return 'vortex';
  if (g === 'freeze') return 'freeze';
  return null;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const scoreRef = useRef<AmbientScore | null>(null);
  const {
    videoRef, previewRef, handsRef, status, gestures,
    controlMode, setControl, start, stop,
  } = useHandTracking();

  const [mode, setMode] = useState<ModeId>('galaxy');
  const [count, setCount] = useState(12000);
  const [speed, setSpeed] = useState(1);
  const [force, setForce] = useState(1);
  const [fps, setFps] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [frozen, setFrozen] = useState(false);
  const [slowMo, setSlowMo] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'sim' | 'look' | 'fx' | 'audio'>('sim');

  // visual / sim knobs
  const [style, setStyle] = useState<VisualStyle>('glow');
  const [bloom, setBloom] = useState(0.55);
  const [trail, setTrail] = useState(1);
  const [sizeMul, setSizeMul] = useState(1);
  const [gravity, setGravity] = useState(0);
  const [turbulence, setTurbulence] = useState(0);
  const [hue, setHue] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [zoom, setZoom] = useState(1);

  // audio
  const [musicOn, setMusicOn] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [mood, setMood] = useState<ScoreMood>('void');

  const pointer = useRef({ x: 0, y: 0, down: false, alt: false, inside: false, look: false, lx: 0, ly: 0 });
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // engine lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new ParticleEngine(canvas);
    engineRef.current = engine;
    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    let last = performance.now();
    let raf = 0;
    let fpsAcc = 0, fpsN = 0, fpsT = 0;

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000;
      last = now;
      const rect = canvas.getBoundingClientRect();
      const forces: HandForce[] = [];
      let freezeNow = false;
      let fists = 0;
      let camLookX = 0, camLookY = 0, camZoom = 0;
      let speedFromHand: number | null = null;

      for (const h of handsRef.current) {
        if (h.gesture === 'vortex') fists++;

        // control-mode camera gestures
        if (h.gesture === 'look') {
          camLookX += h.deltaX * 4.5;
          camLookY += h.deltaY * 4.5;
          continue;
        }
        if (h.gesture === 'zoom') {
          // swipe left = zoom in, swipe right = zoom out (mirrored already)
          camZoom += -h.deltaX * 2.8;
          continue;
        }
        if (h.gesture === 'speed') {
          // pinch tightness → speed 0.15..2.4
          speedFromHand = 0.15 + h.pinch * 2.25;
          continue;
        }

        const k = toHandKind(h.gesture);
        if (!k) continue;
        if (k === 'freeze') { freezeNow = true; continue; }
        forces.push({ x: h.x * rect.width, y: h.y * rect.height, kind: k, strength: h.strength });
      }

      if (camLookX || camLookY) engine.addLook(camLookX, camLookY);
      if (camZoom) {
        engine.addZoom(camZoom);
        setZoom((z) => {
          const nz = Math.max(0.35, Math.min(3.2, engine.zoom));
          return Math.abs(nz - z) > 0.01 ? +nz.toFixed(2) : z;
        });
      }
      if (speedFromHand !== null) {
        const s = +speedFromHand.toFixed(2);
        if (Math.abs(s - speedRef.current) > 0.03) {
          speedRef.current = s;
          setSpeed(s);
          engine.timeScale = s;
        }
      }

      const twoFists = fists >= 2;
      engine.slowMo = twoFists;
      setSlowMo((p) => (p === twoFists ? p : twoFists));
      setFrozen((p) => (p === freezeNow ? p : freezeNow));

      const p = pointer.current;
      if (p.look && p.inside) {
        // right-drag or alt-drag to look with mouse
        engine.addLook((p.x - p.lx) * 0.008, (p.y - p.ly) * 0.008);
        p.lx = p.x; p.ly = p.y;
      } else if (p.down && p.inside) {
        forces.push({ x: p.x, y: p.y, kind: p.alt ? 'repel' : 'attract', strength: 0.9 });
      }
      engine.hands = forces;
      engine.freeze = freezeNow;
      engine.frame(dt);

      fpsAcc += dt; fpsN++; fpsT += dt;
      if (fpsT > 0.4) { setFps(Math.round(fpsN / fpsAcc)); fpsAcc = 0; fpsN = 0; fpsT = 0; }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [handsRef]);

  // push knobs into engine
  useEffect(() => { engineRef.current?.setMode(mode); scoreRef.current?.hit(0.4); }, [mode]);
  useEffect(() => { engineRef.current?.setCount(count); }, [count]);
  useEffect(() => { if (engineRef.current) engineRef.current.timeScale = speed; }, [speed]);
  useEffect(() => { if (engineRef.current) engineRef.current.forceScale = force; }, [force]);
  useEffect(() => { if (engineRef.current) engineRef.current.visualStyle = style; }, [style]);
  useEffect(() => { if (engineRef.current) engineRef.current.bloom = bloom; }, [bloom]);
  useEffect(() => { if (engineRef.current) engineRef.current.trailMul = trail; }, [trail]);
  useEffect(() => { if (engineRef.current) engineRef.current.sizeMul = sizeMul; }, [sizeMul]);
  useEffect(() => { if (engineRef.current) engineRef.current.gravity = gravity; }, [gravity]);
  useEffect(() => { if (engineRef.current) engineRef.current.turbulence = turbulence; }, [turbulence]);
  useEffect(() => { engineRef.current?.setHueShift(hue); }, [hue]);
  useEffect(() => { if (engineRef.current) engineRef.current.autoRotate = autoRotate; }, [autoRotate]);
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.zoom = zoom;
    }
  }, [zoom]);

  // audio
  useEffect(() => {
    const s = new AmbientScore();
    scoreRef.current = s;
    return () => s.stop();
  }, []);
  useEffect(() => {
    if (musicOn) scoreRef.current?.start();
    else scoreRef.current?.stop();
  }, [musicOn]);
  useEffect(() => { scoreRef.current?.setVolume(volume); }, [volume]);
  useEffect(() => { scoreRef.current?.setMood(mood); }, [mood]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (/^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : parseInt(e.key, 10) - 1;
        if (idx < MODE_ORDER.length) setMode(MODE_ORDER[idx]);
      }
      if (e.key === ' ') { e.preventDefault(); setPanelOpen((v) => !v); }
      if (e.key === 'c' || e.key === 'C') setControl(!controlMode);
      if (e.key === 'm' || e.key === 'M') setMusicOn((v) => !v);
      if (e.key === 'r' || e.key === 'R') {
        engineRef.current?.resetCamera();
        setZoom(1);
      }
      if (e.key === '[') setZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(2)));
      if (e.key === ']') setZoom((z) => Math.min(3.2, +(z + 0.1).toFixed(2)));
      if (e.key === 'ArrowLeft') engineRef.current?.addLook(-0.08, 0);
      if (e.key === 'ArrowRight') engineRef.current?.addLook(0.08, 0);
      if (e.key === 'ArrowUp') engineRef.current?.addLook(0, -0.06);
      if (e.key === 'ArrowDown') engineRef.current?.addLook(0, 0.06);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setControl, controlMode]);

  const camOn = status === 'running' || status === 'loading';

  const filteredModes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return MODE_ORDER;
    return MODE_ORDER.filter(
      (id) => MODES[id].label.toLowerCase().includes(q) || MODES[id].tag.toLowerCase().includes(q),
    );
  }, [query]);

  const current = MODES[mode];

  const toggleMusic = useCallback(() => setMusicOn((v) => !v), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#02040c] text-slate-200 font-sans select-none">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(50,110,220,0.12),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(180,60,220,0.10),transparent_60%)]" />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          const p = pointer.current;
          if (!p.look) { p.lx = x; p.ly = y; }
          p.x = x; p.y = y; p.inside = true;
        }}
        onPointerDown={(e) => {
          const p = pointer.current;
          p.down = true;
          p.alt = e.shiftKey || e.button === 2;
          p.look = e.altKey || e.button === 1;
          const r = e.currentTarget.getBoundingClientRect();
          p.x = p.lx = e.clientX - r.left;
          p.y = p.ly = e.clientY - r.top;
          (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
        }}
        onPointerUp={() => { pointer.current.down = false; pointer.current.look = false; }}
        onPointerCancel={() => { pointer.current.down = false; pointer.current.look = false; }}
        onPointerLeave={() => { pointer.current.inside = false; pointer.current.down = false; pointer.current.look = false; }}
        onWheel={(e) => {
          e.preventDefault();
          const dz = e.deltaY > 0 ? -0.08 : 0.08;
          engineRef.current?.addZoom(dz);
          setZoom(+engineRef.current!.zoom.toFixed(2));
        }}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* ── header ── */}
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-4 md:p-5">
        <div>
          <h1 className="text-xl font-black tracking-[0.32em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-fuchsia-300 drop-shadow-[0_0_18px_rgba(120,180,255,0.3)] md:text-2xl">
            PARTICLE · FORGE
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] tracking-[0.15em] text-slate-400">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 uppercase">
              <span className="mr-1 text-base leading-none align-middle">{current.icon}</span>
              {current.label}
            </span>
            <span className="hidden rounded-full border border-white/5 bg-black/40 px-2 py-0.5 sm:inline">{current.tag}</span>
            <span className="hidden text-slate-500 lg:inline">{current.desc}</span>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
          {frozen && <Pill color="indigo" pulse>❄ FROZEN</Pill>}
          {slowMo && !frozen && <Pill color="fuchsia" pulse>✊✊ TIME WARP</Pill>}
          {controlMode && <Pill color="amber">📷 CAMERA GESTURES</Pill>}
          {musicOn && <Pill color="violet">{SCORE_MOODS.find((m) => m.id === mood)?.icon} {mood.toUpperCase()}</Pill>}
          <span className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[11px] tabular-nums text-slate-300 backdrop-blur">
            {fps} <span className="text-slate-500">fps</span>
            <span className="mx-1.5 text-white/10">|</span>
            <span className="text-slate-400">{zoom.toFixed(1)}×</span>
          </span>
        </div>
      </header>

      {/* ── left HUD: camera + quick tips ── */}
      <aside className={`absolute left-4 top-20 z-10 w-[220px] transition-transform duration-300 ${leftOpen ? '' : '-translate-x-[calc(100%+20px)]'}`}>
        <button
          onClick={() => setLeftOpen((v) => !v)}
          className="absolute -right-9 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-slate-300 backdrop-blur hover:bg-white/10"
        >
          {leftOpen ? '«' : '»'}
        </button>
        <div className="space-y-3 rounded-2xl border border-white/10 bg-black/50 p-3 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.3em] text-slate-400">CAMERA</span>
            <button
              onClick={() => (camOn ? stop() : start())}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                camOn ? 'bg-rose-500/20 text-rose-300 ring-1 ring-rose-400/40' : 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
              }`}
            >
              {status === 'loading' ? '…' : camOn ? 'Off' : 'On'}
            </button>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/70" style={{ aspectRatio: '4/3' }}>
            <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover opacity-55" style={{ transform: 'scaleX(-1)' }} />
            <canvas ref={previewRef} width={220} height={165} className="absolute inset-0 h-full w-full" />
            {status !== 'running' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-center">
                <span className="text-2xl">{status === 'denied' ? '🚫' : status === 'loading' ? '⏳' : '📷'}</span>
                <span className="px-2 text-[9px] text-slate-400">
                  {status === 'off' && 'Enable webcam for hand control'}
                  {status === 'loading' && 'Loading tracker…'}
                  {status === 'denied' && 'Permission denied'}
                  {status === 'error' && 'Tracker error'}
                </span>
              </div>
            )}
            {status === 'running' && (
              <div className="absolute bottom-1 left-1 right-1 flex flex-wrap gap-0.5">
                {gestures.length === 0
                  ? <span className="rounded bg-black/60 px-1 text-[8px] text-slate-400">no hands</span>
                  : gestures.map((g, i) => (
                    <span key={i} className={`rounded border px-1 py-0.5 text-[8px] font-semibold ${GESTURE_UI[g].ring}`}>
                      {GESTURE_UI[g].icon} {GESTURE_UI[g].label.split(' · ')[0]}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* mode toggle force vs camera */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setControl(false)}
              className={`rounded-lg py-1.5 text-[10px] font-bold tracking-wide transition ${
                !controlMode ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              ✨ Force
            </button>
            <button
              onClick={() => setControl(true)}
              className={`rounded-lg py-1.5 text-[10px] font-bold tracking-wide transition ${
                controlMode ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50' : 'bg-white/5 text-slate-400 hover:bg-white/10'
              }`}
            >
              🎥 Camera
            </button>
          </div>

          <div className="space-y-1 text-[9px] leading-snug text-slate-400">
            {controlMode ? (
              <>
                <Tip icon="☝️" text="One finger — look around" />
                <Tip icon="✋" text="Open palm swipe L/R — zoom" />
                <Tip icon="🤏" text="Pinch tighter — speed up" />
              </>
            ) : (
              <>
                <Tip icon="🤏" text="Pinch — attract particles" />
                <Tip icon="✋" text="Open palm — repel" />
                <Tip icon="✊" text="Fist — vortex swirl" />
                <Tip icon="✌️" text="Peace — freeze time" />
                <Tip icon="✊✊" text="Two fists — slow-mo" />
              </>
            )}
            <Tip icon="C" text="Toggle Force / Camera" />
          </div>
        </div>
      </aside>

      {/* ── right control panel ── */}
      <aside className={`absolute right-4 top-20 z-10 w-[280px] transition-transform duration-300 ${panelOpen ? '' : 'translate-x-[calc(100%+22px)]'}`}>
        <button
          onClick={() => setPanelOpen((v) => !v)}
          className="absolute -left-9 top-2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/60 text-slate-300 backdrop-blur hover:bg-white/10"
          title="Toggle panel (Space)"
        >
          {panelOpen ? '»' : '«'}
        </button>

        <div className="max-h-[calc(100vh-120px)] space-y-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/50 p-3.5 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.6)] [scrollbar-width:thin]">
          {/* tabs */}
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
            {([
              ['sim', 'Sim'],
              ['look', 'Cam'],
              ['fx', 'FX'],
              ['audio', 'Audio'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`rounded-lg py-1.5 text-[10px] font-bold tracking-wider transition ${
                  tab === id ? 'bg-white/15 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'sim' && (
            <div className="space-y-3">
              <Slider label="Particles" value={count} min={1000} max={24000} step={500} display={count.toLocaleString()} onChange={setCount} />
              <Slider label="Time Scale" value={speed} min={0.05} max={3} step={0.05} display={`${speed.toFixed(2)}×`} onChange={setSpeed} />
              <Slider label="Force" value={force} min={0.1} max={3.5} step={0.1} display={`${force.toFixed(1)}×`} onChange={setForce} />
              <Slider label="Gravity" value={gravity} min={-2} max={2} step={0.05} display={gravity.toFixed(2)} onChange={setGravity} />
              <Slider label="Turbulence" value={turbulence} min={0} max={2.5} step={0.05} display={turbulence.toFixed(2)} onChange={setTurbulence} />
              <div className="flex gap-1.5">
                <button
                  onClick={() => { setGravity(0); setTurbulence(0); setSpeed(1); setForce(1); }}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-white/10"
                >
                  Reset Physics
                </button>
                <button
                  onClick={() => engineRef.current?.setMode(mode, true)}
                  className="flex-1 rounded-lg border border-cyan-400/20 bg-cyan-400/10 py-1.5 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-400/20"
                >
                  Respawn
                </button>
              </div>
            </div>
          )}

          {tab === 'look' && (
            <div className="space-y-3">
              <Slider label="Zoom" value={zoom} min={0.35} max={3.2} step={0.05} display={`${zoom.toFixed(2)}×`} onChange={(v) => { setZoom(v); if (engineRef.current) engineRef.current.zoom = v; }} />
              <label className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px]">
                <span className="font-semibold tracking-wide text-slate-300">Auto-rotate</span>
                <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} className="accent-cyan-400" />
              </label>
              <div className="grid grid-cols-3 gap-1">
                <button onClick={() => engineRef.current?.addLook(-0.2, 0)} className="rounded-lg bg-white/5 py-2 text-sm hover:bg-white/10">◀</button>
                <button onClick={() => engineRef.current?.addLook(0, -0.15)} className="rounded-lg bg-white/5 py-2 text-sm hover:bg-white/10">▲</button>
                <button onClick={() => engineRef.current?.addLook(0.2, 0)} className="rounded-lg bg-white/5 py-2 text-sm hover:bg-white/10">▶</button>
                <button onClick={() => { engineRef.current?.resetCamera(); setZoom(1); }} className="rounded-lg border border-white/10 bg-white/5 py-2 text-[10px] font-semibold hover:bg-white/10">RESET</button>
                <button onClick={() => engineRef.current?.addLook(0, 0.15)} className="rounded-lg bg-white/5 py-2 text-sm hover:bg-white/10">▼</button>
                <button onClick={() => { const z = Math.min(3.2, zoom + 0.2); setZoom(+z.toFixed(2)); if (engineRef.current) engineRef.current.zoom = z; }} className="rounded-lg bg-white/5 py-2 text-[10px] font-semibold hover:bg-white/10">ZOOM+</button>
              </div>
              <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-2.5 py-2 text-[9px] leading-relaxed text-amber-100/80">
                <b>Mouse:</b> scroll = zoom · Alt-drag = look · Shift-drag = repel<br />
                <b>Keys:</b> arrows look · [ ] zoom · R reset · C camera gestures
              </div>
            </div>
          )}

          {tab === 'fx' && (
            <div className="space-y-3">
              <div>
                <div className="mb-1.5 text-[10px] font-bold tracking-[0.25em] text-slate-400">VISUAL STYLE</div>
                <div className="grid grid-cols-3 gap-1">
                  {VISUAL_STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStyle(s.id)}
                      className={`rounded-lg py-2 text-center transition ${
                        style === s.id
                          ? 'bg-gradient-to-b from-cyan-500/30 to-fuchsia-500/20 ring-1 ring-cyan-300/50 text-cyan-100'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      <div className="text-base leading-none">{s.icon}</div>
                      <div className="mt-1 text-[9px] font-semibold tracking-wide">{s.label}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Slider label="Bloom" value={bloom} min={0} max={1.5} step={0.05} display={bloom.toFixed(2)} onChange={setBloom} />
              <Slider label="Trail Length" value={trail} min={0.3} max={3} step={0.05} display={trail.toFixed(2)} onChange={setTrail} />
              <Slider label="Particle Size" value={sizeMul} min={0.3} max={3} step={0.05} display={sizeMul.toFixed(2)} onChange={setSizeMul} />
              <Slider label="Hue Shift" value={hue} min={0} max={360} step={5} display={`${hue}°`} onChange={setHue} />
              <div className="h-2 overflow-hidden rounded-full" style={{
                background: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
              }} />
            </div>
          )}

          {tab === 'audio' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-[0.25em] text-slate-400">AMBIENT SCORE</span>
                <button
                  onClick={toggleMusic}
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    musicOn
                      ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/50'
                      : 'bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10'
                  }`}
                >
                  {musicOn ? '▮▮ Pause' : '▶ Play'}
                </button>
              </div>
              <p className="text-[9px] leading-relaxed text-slate-400">
                Procedural dark ambient — sparse piano, low drone & string pads in the spirit of Göransson’s Oppenheimer score. Generated live in your browser.
              </p>
              <Slider label="Volume" value={volume} min={0} max={1} step={0.02} display={`${Math.round(volume * 100)}%`} onChange={setVolume} />
              <div className="grid grid-cols-2 gap-1.5">
                {SCORE_MOODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMood(m.id)}
                    className={`rounded-xl px-2 py-2.5 text-left transition ${
                      mood === m.id
                        ? 'bg-violet-500/25 ring-1 ring-violet-300/50 text-violet-100'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-base">{m.icon}</div>
                    <div className="text-[10px] font-bold tracking-wide">{m.label}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={() => scoreRef.current?.hit(0.8)}
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-[10px] font-semibold text-slate-300 hover:bg-white/10"
              >
                💥 Impact Hit
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── mode carousel ── */}
      <div className="absolute bottom-4 left-1/2 z-10 w-[min(1400px,calc(100vw-16px))] -translate-x-1/2">
        <div className="rounded-2xl border border-white/10 bg-black/45 p-2 backdrop-blur-xl shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-[10px] font-bold tracking-[0.3em] text-slate-400">ARRANGEMENTS · {MODE_ORDER.length}</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="h-6 w-28 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/40 focus:outline-none"
            />
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {filteredModes.map((id) => {
              const m = MODES[id];
              const active = id === mode;
              const k = MODE_ORDER.indexOf(id);
              return (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  title={`${m.label} — ${m.desc}`}
                  className={`group relative flex w-[78px] shrink-0 flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-center transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-b from-cyan-500/25 via-sky-500/15 to-fuchsia-500/20 ring-1 ring-cyan-300/50 shadow-[0_0_22px_rgba(80,200,255,0.28)]'
                      : 'bg-white/[0.03] ring-1 ring-white/5 hover:bg-white/[0.08]'
                  }`}
                >
                  <span className={`text-xl transition-transform ${active ? 'scale-125' : 'group-hover:scale-110'}`}>{m.icon}</span>
                  <span className={`text-[9px] font-semibold leading-tight ${active ? 'text-cyan-100' : 'text-slate-300'}`}>{m.label}</span>
                  <span className={`text-[8px] uppercase tracking-widest ${active ? 'text-fuchsia-200/80' : 'text-slate-500'}`}>{m.tag}</span>
                  {k < 10 && (
                    <span className={`absolute right-0.5 top-0.5 rounded px-0.5 text-[8px] tabular-nums ${active ? 'bg-cyan-300/20 text-cyan-100' : 'bg-white/5 text-slate-500'}`}>
                      {k === 9 ? '0' : k + 1}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ children, color, pulse }: { children: React.ReactNode; color: string; pulse?: boolean }) {
  const map: Record<string, string> = {
    indigo: 'border-indigo-300/50 bg-indigo-400/15 text-indigo-200 shadow-indigo-400/20',
    fuchsia: 'border-fuchsia-400/50 bg-fuchsia-500/15 text-fuchsia-200',
    amber: 'border-amber-400/50 bg-amber-500/15 text-amber-200',
    violet: 'border-violet-400/50 bg-violet-500/15 text-violet-200',
  };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest shadow ${map[color] || map.indigo} ${pulse ? 'animate-pulse' : ''}`}>
      {children}
    </span>
  );
}

function Tip({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-px w-4 shrink-0 text-center text-[10px]">{icon}</span>
      <span>{text}</span>
    </div>
  );
}

function Slider({
  label, value, min, max, step, display, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; display: string; onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-semibold tracking-widest text-slate-300">{label.toUpperCase()}</span>
        <span className="tabular-nums text-cyan-300">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-cyan-500/30 to-fuchsia-500/30 accent-cyan-400"
      />
    </label>
  );
}
