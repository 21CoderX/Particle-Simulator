import { useCallback, useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

// force gestures sculpt particles; control gestures drive camera/speed
export type Gesture =
  | 'attract' | 'repel' | 'vortex' | 'freeze' | 'point'
  | 'look' | 'zoom' | 'speed'
  | 'idle';

export interface TrackedHand {
  x: number; // 0..1 mirrored
  y: number;
  gesture: Gesture;
  strength: number;
  // continuous control signals (normalized)
  pinch: number;   // 0 open … 1 tight
  palmX: number;   // 0..1
  palmY: number;
  deltaX: number;  // frame-to-frame palm motion
  deltaY: number;
}

export type CamStatus = 'off' | 'loading' | 'running' | 'denied' | 'error';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const EMA = 0.42;
const HOLD = 3;

interface SmoothHand {
  x: number; y: number;
  gesture: Gesture;
  hold: number;
  strength: number;
  pinch: number;
  lastX: number; lastY: number;
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

interface ClassifyResult {
  g: Gesture; s: number; cx: number; cy: number; pinch: number;
}

function classify(pts: Array<{ x: number; y: number; z: number }>, controlMode: boolean): ClassifyResult {
  const wrist = pts[0];
  const palmSize = Math.max(0.05, dist(wrist, pts[9]));
  const nrm = (d: number) => d / palmSize;

  const fingers = [
    { tip: 8, pip: 6, mcp: 5 },
    { tip: 12, pip: 10, mcp: 9 },
    { tip: 16, pip: 14, mcp: 13 },
    { tip: 20, pip: 18, mcp: 17 },
  ];
  const extended: boolean[] = [];
  for (const f of fingers) {
    const tipD = dist(pts[f.tip], wrist);
    const pipD = dist(pts[f.pip], wrist);
    const mcpD = dist(pts[f.mcp], wrist);
    extended.push(tipD > pipD * 1.08 && tipD > mcpD * 1.02);
  }
  const exCount = extended.filter(Boolean).length;
  const pinchD = nrm(dist(pts[4], pts[8]));
  const pinch = Math.max(0, Math.min(1, (0.9 - pinchD) / 0.7)); // 0 open → 1 tight

  let cx = 0, cy = 0;
  for (const i of [0, 5, 9, 13, 17]) { cx += pts[i].x; cy += pts[i].y; }
  cx *= 0.2; cy *= 0.2;

  // ── CONTROL MODE: remapped gestures for camera ────────────────────────────
  // One finger (point) → look around
  // Open palm → zoom (horizontal swipe)
  // Pinch → speed control (tighter = faster)
  if (controlMode) {
    // pinch for speed — highest priority when tight
    if (pinchD < 0.65) {
      return {
        g: 'speed',
        s: Math.min(1, (0.65 - pinchD) / 0.4 + 0.3),
        cx: (pts[4].x + pts[8].x) * 0.5,
        cy: (pts[4].y + pts[8].y) * 0.5,
        pinch,
      };
    }
    // single index finger → look
    if (extended[0] && !extended[1] && !extended[2] && !extended[3]) {
      return { g: 'look', s: 0.9, cx: pts[8].x, cy: pts[8].y, pinch };
    }
    // open palm (3+ fingers) → zoom
    if (exCount >= 3) {
      return { g: 'zoom', s: 0.85, cx, cy, pinch };
    }
    // fist still usable as vortex in control? keep idle so it doesn't fight
    if (exCount <= 1) return { g: 'idle', s: 0, cx, cy, pinch };
    return { g: 'idle', s: 0, cx, cy, pinch };
  }

  // ── FORCE MODE: sculpt particles ──────────────────────────────────────────
  if (pinchD < 0.55) {
    return {
      g: 'attract',
      s: Math.min(1, (0.55 - pinchD) / 0.4 + 0.35),
      cx: (pts[4].x + pts[8].x) * 0.5,
      cy: (pts[4].y + pts[8].y) * 0.5,
      pinch,
    };
  }
  if (exCount >= 3) {
    const spread = nrm(dist(pts[8], pts[12]) + dist(pts[12], pts[16]) + dist(pts[16], pts[20])) / 3;
    return { g: 'repel', s: Math.min(1, 0.45 + (exCount - 3) * 0.25 + spread * 0.4), cx, cy, pinch };
  }
  if (exCount <= 1) {
    let tipSum = 0;
    for (const f of fingers) tipSum += nrm(dist(pts[f.tip], wrist));
    return { g: 'vortex', s: Math.min(1, Math.max(0.3, (1.5 - tipSum * 0.25) * 1.1)), cx, cy, pinch };
  }
  if (extended[0] && !extended[1] && !extended[2] && !extended[3]) {
    return { g: 'point', s: 0.8, cx: pts[8].x, cy: pts[8].y, pinch };
  }
  if (extended[0] && extended[1] && !extended[2] && !extended[3]) {
    return { g: 'freeze', s: 0.9, cx, cy, pinch };
  }
  return { g: 'idle', s: 0, cx, cy, pinch };
}

const GESTURE_COLOR: Partial<Record<Gesture, string>> = {
  attract: '#50dcff', point: '#80e0ff', repel: '#ff8c5a',
  freeze: '#cfe2ff', vortex: '#be78ff',
  look: '#fbbf24', zoom: '#34d399', speed: '#f472b6',
  idle: '#7dd3fc',
};

export function useHandTracking() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<TrackedHand[]>([]);
  const smoothedRef = useRef<SmoothHand[]>([]);
  const controlModeRef = useRef(false);
  const [status, setStatus] = useState<CamStatus>('off');
  const [gestures, setGestures] = useState<Gesture[]>([]);
  const [controlMode, setControlMode] = useState(false);
  const rafRef = useRef(0);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastUi = useRef(0);

  const setControl = useCallback((on: boolean) => {
    controlModeRef.current = on;
    setControlMode(on);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    handsRef.current = [];
    smoothedRef.current = [];
    setGestures([]);
    setStatus('off');
  }, []);

  const start = useCallback(async () => {
    setStatus('loading');
    try {
      if (!landmarkerRef.current) {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
          runningMode: 'VIDEO',
          numHands: 2,
        });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error('no video');
      video.srcObject = stream;
      await video.play();
      setStatus('running');

      let lastVideoTime = -1;
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop);
        const lm = landmarkerRef.current;
        if (!lm || !video.videoWidth) return;
        if (video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;

        const res = lm.detectForVideo(video, performance.now());
        const pcv = previewRef.current;
        const pctx = pcv?.getContext('2d') ?? null;
        if (pcv && pctx) pctx.clearRect(0, 0, pcv.width, pcv.height);

        const detected: TrackedHand[] = [];
        const raw = res.landmarks ?? [];
        while (smoothedRef.current.length < raw.length)
          smoothedRef.current.push({ x: 0.5, y: 0.5, gesture: 'idle', hold: 0, strength: 0, pinch: 0, lastX: 0.5, lastY: 0.5 });
        if (smoothedRef.current.length > raw.length) smoothedRef.current.length = raw.length;

        for (let h = 0; h < raw.length; h++) {
          const pts = raw[h];
          const cls = classify(pts, controlModeRef.current);
          const rawX = 1 - cls.cx;
          const rawY = cls.cy;
          const sm = smoothedRef.current[h];
          const prevX = sm.x, prevY = sm.y;
          sm.x = sm.x * (1 - EMA) + rawX * EMA;
          sm.y = sm.y * (1 - EMA) + rawY * EMA;
          sm.pinch = sm.pinch * 0.55 + cls.pinch * 0.45;
          if (cls.g === sm.gesture) sm.hold = Math.min(99, sm.hold + 1);
          else { sm.hold -= 1; if (sm.hold < -HOLD) { sm.gesture = cls.g; sm.hold = 0; } }
          sm.strength = sm.strength * 0.55 + cls.s * 0.45;

          const dx = sm.x - prevX;
          const dy = sm.y - prevY;
          detected.push({
            x: sm.x, y: sm.y, gesture: sm.gesture, strength: sm.strength,
            pinch: sm.pinch, palmX: sm.x, palmY: sm.y, deltaX: dx, deltaY: dy,
          });

          if (pcv && pctx) {
            const W = pcv.width, H = pcv.height;
            const col = GESTURE_COLOR[sm.gesture] || '#7dd3fc';
            pctx.strokeStyle = col;
            pctx.lineWidth = 1.8;
            pctx.shadowColor = col;
            pctx.shadowBlur = 6;
            pctx.beginPath();
            for (const [a, b] of CONNECTIONS) {
              pctx.moveTo((1 - pts[a].x) * W, pts[a].y * H);
              pctx.lineTo((1 - pts[b].x) * W, pts[b].y * H);
            }
            pctx.stroke();
            pctx.shadowBlur = 0;
            pctx.fillStyle = '#fff';
            for (const p of pts) {
              pctx.beginPath();
              pctx.arc((1 - p.x) * W, p.y * H, 1.7, 0, Math.PI * 2);
              pctx.fill();
            }
          }
        }
        handsRef.current = detected;

        const now = performance.now();
        if (now - lastUi.current > 140) {
          lastUi.current = now;
          setGestures(detected.map((d) => d.gesture));
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error(e);
      const err = e as { name?: string };
      setStatus(err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' ? 'denied' : 'error');
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }, []);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef, previewRef, handsRef, status, gestures,
    controlMode, setControl, start, stop,
  };
}
