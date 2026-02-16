import { DrawContext } from './types';
import { getPrimaryColor, toRgba } from './colors';

const NUM_BUBBLES = 28;
const MIN_RADIUS = 20;
const MAX_RADIUS = 70;
const BASE_SPEED = 0.8;
const MIN_SPEED_MULT = 0.2;
const MAX_SPEED_MULT = 1.5;
const VIEWPORT_REF = 600;

interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseR: number;
  phase: number;
  hueShift: number;
}

let bubbles: Bubble[] = [];
let lastW = 0;
let lastH = 0;

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => { lastW = 0; lastH = 0; });
}

function scale(w: number, h: number): number {
  return Math.max(0.5, Math.min(w, h) / VIEWPORT_REF);
}

function init(w: number, h: number): void {
  if (bubbles.length === NUM_BUBBLES && lastW === w && lastH === h) return;
  bubbles = [];
  lastW = w;
  lastH = h;
  const s = scale(w, h);
  for (let i = 0; i < NUM_BUBBLES; i++) {
    const r = (MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS)) * s;
    const angle = Math.random() * Math.PI * 2;
    const speed = BASE_SPEED * s;
    bubbles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      baseR: r,
      phase: Math.random() * Math.PI * 2,
      hueShift: Math.random() * 60 - 30,
    });
  }
}

function getAudioLevel(freq: Uint8Array): { low: number; mid: number; overall: number } {
  const len = freq.length;
  const lo = Math.floor(len * 0.1);
  const mi = Math.floor(len * 0.45);
  let ls = 0, ms = 0;
  for (let i = 0; i < lo; i++) ls += freq[i];
  for (let i = lo; i < mi; i++) ms += freq[i];
  const low = lo > 0 ? ls / lo / 255 : 0;
  const mid = (mi > lo) ? ms / (mi - lo) / 255 : 0;
  const overall = low * 0.5 + mid * 0.5;
  return { low, mid, overall };
}

export function drawBubbles(dc: DrawContext): void {
  const { ctx, width, height, frequencyData } = dc;
  init(width, height);

  const s = scale(width, height);
  const audio = getAudioLevel(frequencyData);
  const primary = getPrimaryColor(dc);
  const time = performance.now() / 1000;

  const sizePulse = 1 + audio.low * 0.5 + audio.overall * 0.12;
  const radii = bubbles.map((b) => {
    const wobble = 1 + Math.sin(time * 2.2 + b.phase) * 0.06;
    return b.baseR * sizePulse * wobble;
  });

  const speedMult = MIN_SPEED_MULT + (MAX_SPEED_MULT - MIN_SPEED_MULT) * audio.overall;
  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    b.x += b.vx * speedMult;
    b.y += b.vy * speedMult;
  }

  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const r = radii[i];
    if (b.x - r < 0) {
      b.x = r;
      b.vx = Math.abs(b.vx);
    }
    if (b.x + r > width) {
      b.x = width - r;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y - r < 0) {
      b.y = r;
      b.vy = Math.abs(b.vy);
    }
    if (b.y + r > height) {
      b.y = height - r;
      b.vy = -Math.abs(b.vy);
    }
  }

  for (let i = 0; i < bubbles.length; i++) {
    for (let j = i + 1; j < bubbles.length; j++) {
      const a = bubbles[i];
      const b = bubbles[j];
      const rA = radii[i];
      const rB = radii[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const minDist = rA + rB;
      if (dist < minDist && dist > 1e-6) {
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        a.x -= (overlap * 0.5) * nx;
        a.y -= (overlap * 0.5) * ny;
        b.x += (overlap * 0.5) * nx;
        b.y += (overlap * 0.5) * ny;
        const vaN = a.vx * nx + a.vy * ny;
        const vbN = b.vx * nx + b.vy * ny;
        a.vx += (vbN - vaN) * nx;
        a.vy += (vbN - vaN) * ny;
        b.vx += (vaN - vbN) * nx;
        b.vy += (vaN - vbN) * ny;
      } else if (dist < 1e-6) {
        const nx = 1;
        const ny = 0;
        const overlap = minDist;
        a.x -= (overlap * 0.5) * nx;
        a.y -= (overlap * 0.5) * ny;
        b.x += (overlap * 0.5) * nx;
        b.y += (overlap * 0.5) * ny;
        const vaN = a.vx * nx + a.vy * ny;
        const vbN = b.vx * nx + b.vy * ny;
        a.vx += (vbN - vaN) * nx;
        a.vy += (vbN - vaN) * ny;
        b.vx += (vaN - vbN) * nx;
        b.vy += (vaN - vbN) * ny;
      }
    }
  }

  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < bubbles.length; i++) {
    const b = bubbles[i];
    const r = radii[i];

    const baseAlpha = 0.06 + audio.overall * 0.2 + audio.low * 0.12;

    const grad = ctx.createRadialGradient(
      b.x - r * 0.3, b.y - r * 0.3, r * 0.05,
      b.x, b.y, r
    );
    grad.addColorStop(0, toRgba(primary, baseAlpha + 0.2));
    grad.addColorStop(0.4, toRgba(primary, baseAlpha * 0.85));
    grad.addColorStop(0.85, toRgba(primary, baseAlpha * 0.3));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = toRgba(primary, baseAlpha + 0.1 + audio.low * 0.05);
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.stroke();

    const hlR = r * 0.35;
    const hlX = b.x - r * 0.28;
    const hlY = b.y - r * 0.28;
    const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
    const hlBright = 0.2 + audio.overall * 0.25 + audio.low * 0.2;
    hlGrad.addColorStop(0, `rgba(255,255,255,${Math.min(1, hlBright)})`);
    hlGrad.addColorStop(0.6, `rgba(255,255,255,${0.05 + audio.overall * 0.08 + audio.low * 0.05})`);
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
    ctx.fill();

    const hl2R = r * 0.12;
    const hl2X = b.x + r * 0.25;
    const hl2Y = b.y + r * 0.32;
    ctx.fillStyle = `rgba(255,255,255,${0.06 + audio.overall * 0.1 + audio.low * 0.08})`;
    ctx.beginPath();
    ctx.arc(hl2X, hl2Y, hl2R, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
