import { DrawContext } from './types';

// --- Constants ---
const NUM_PARTICLES = 65;
const MIN_SIZE = 2.5;
const MAX_SIZE = 8;
const VIEWPORT_REF = 600;

const DRAG = 0.98;
const SPRING_K = 0.0015;
const WANDER_STRENGTH = 6;
const BASE_SPEED_MULT = 0.045;
const MAX_SPEED_MULT = 0.33;

const BASS_KICK_STRENGTH = 0.9;
const MID_WIND_STRENGTH = 0.25;
const HIGH_JITTER_STRENGTH = 0.35;

const SIZE_REACT = 0.6;
const ALPHA_MIN = 0.38;
const ALPHA_REACT = 0.5;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseSize: number;
  phase: number;
  seed1: number;
  seed2: number;
  t: number;
}

interface AudioBands {
  low: number;
  mid: number;
  high: number;
  overall: number;
}

let particles: Particle[] = [];
let lastWidth = 0;
let lastHeight = 0;

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    lastWidth = 0;
    lastHeight = 0;
  });
}

function getViewportScale(w: number, h: number): number {
  return Math.max(0.5, Math.min(w, h) / VIEWPORT_REF);
}

function randomInDisk(cx: number, cy: number, radius: number): [number, number] {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * radius;
  return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
}

function getAudioBands(freq: Uint8Array): AudioBands {
  const len = freq.length;
  const loEnd = Math.floor(len * 0.08);
  const midEnd = Math.floor(len * 0.35);
  const hiEnd = Math.floor(len * 0.7);

  let lowSum = 0, midSum = 0, highSum = 0;
  for (let i = 0; i < loEnd; i++) lowSum += freq[i];
  for (let i = loEnd; i < midEnd; i++) midSum += freq[i];
  for (let i = midEnd; i < hiEnd; i++) highSum += freq[i];

  const low = loEnd > 0 ? lowSum / loEnd / 255 : 0;
  const mid = midEnd > loEnd ? midSum / (midEnd - loEnd) / 255 : 0;
  const high = hiEnd > midEnd ? highSum / (hiEnd - midEnd) / 255 : 0;
  const overall = low * 0.45 + mid * 0.35 + high * 0.2;

  return { low, mid, high, overall };
}

function ensureParticles(width: number, height: number): void {
  if (particles.length === NUM_PARTICLES && lastWidth === width && lastHeight === height) return;

  particles = [];
  lastWidth = width;
  lastHeight = height;

  const scale = getViewportScale(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const spread = Math.min(width, height) * 0.45;

  for (let i = 0; i < NUM_PARTICLES; i++) {
    const [x, y] = randomInDisk(cx, cy, spread);
    particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      baseSize: (MIN_SIZE + Math.random() * (MAX_SIZE - MIN_SIZE)) * scale,
      phase: Math.random() * Math.PI * 2,
      seed1: Math.random(),
      seed2: Math.random(),
      t: Math.random() * 1000,
    });
  }
}

export function drawParticles(dc: DrawContext): void {
  const { ctx, width, height, frequencyData } = dc;
  const time = performance.now() / 1000;

  ensureParticles(width, height);

  const scale = getViewportScale(width, height);
  const bands = getAudioBands(frequencyData);

  const energy = 0.7 + bands.overall * 0.3;
  const speedMult = BASE_SPEED_MULT + (MAX_SPEED_MULT - BASE_SPEED_MULT) * bands.overall;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'lighter';

  const hue = (time * 20) % 360;

  for (const p of particles) {
    p.t += 0.016;

    const wanderX =
      Math.sin(p.seed1 * 100 + p.t * 0.12 + time * 0.08) * width * 0.45 + centerX;
    const wanderY =
      Math.cos(p.seed2 * 100 + p.t * 0.1 + time * 0.07) * height * 0.45 + centerY;
    const wander = WANDER_STRENGTH * scale * energy;
    const tx = wanderX + Math.sin(time * 0.12 + p.phase) * wander;
    const ty = wanderY + Math.cos(time * 0.1 + p.phase * 1.3) * wander;

    p.vx += (tx - p.x) * SPRING_K;
    p.vy += (ty - p.y) * SPRING_K;

    const kickStrength = bands.low * BASS_KICK_STRENGTH * (0.9 + bands.low * 0.5) * scale * energy;
    const kickAngle = Math.atan2(p.y - centerY, p.x - centerX) + (Math.random() - 0.5) * 1.2;
    p.vx += Math.cos(kickAngle) * kickStrength;
    p.vy += Math.sin(kickAngle) * kickStrength;

    const wind = bands.mid * MID_WIND_STRENGTH * scale * energy;
    p.vx += Math.sin(time * 0.5 + p.phase) * wind;
    p.vy += Math.cos(time * 0.4 + p.phase) * wind * 0.7;

    const jitter = bands.high * HIGH_JITTER_STRENGTH * scale * energy;
    p.vx += (Math.random() - 0.5) * jitter;
    p.vy += (Math.random() - 0.5) * jitter;

    p.vx *= DRAG;
    p.vy *= DRAG;
    p.x += p.vx * speedMult;
    p.y += p.vy * speedMult;

    if (p.x < -50) p.x += width + 100;
    if (p.x > width + 50) p.x -= width + 100;
    if (p.y < -50) p.y += height + 100;
    if (p.y > height + 50) p.y -= height + 100;

    const size = p.baseSize * (1 + bands.low * SIZE_REACT + bands.overall * 0.2);
    const saturation = 60 + bands.overall * 30;
    const lightness = 52 + bands.overall * 28;
    const alpha = ALPHA_MIN + bands.overall * ALPHA_REACT;

    const pHue = (hue + p.seed1 * 60 + p.seed2 * 30) % 360;

    const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
    grad.addColorStop(0, `hsla(${pHue}, ${saturation}%, ${lightness + 12}%, ${alpha})`);
    grad.addColorStop(0.4, `hsla(${pHue}, ${saturation}%, ${lightness}%, ${alpha * 0.65})`);
    grad.addColorStop(1, `hsla(${pHue}, ${saturation}%, ${lightness - 8}%, 0)`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
