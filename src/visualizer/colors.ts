import type { DrawContext, VisualizerColorOptions } from './types';

const DEFAULT_HUE_START = 260;
const DEFAULT_HUE_END = 220;

/** Get a color for a segment (0..1) and intensity (0..1) based on current color options. */
export function getColor(dc: DrawContext, segment: number, intensity: number): string {
  const opt = dc.colorOptions;
  const alpha = 0.5 + intensity * 0.5;

  switch (opt.mode) {
    case 'custom': {
      const hex = opt.customColor;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    case 'changing': {
      const cycle = (opt.colorPhase + segment) % 1;
      const hue = (cycle * 360) % 360;
      const lightness = 45 + intensity * 25;
      return `hsla(${hue}, 85%, ${lightness}%, ${alpha})`;
    }
    case 'album': {
      const colors = opt.albumArtColors;
      if (colors.length === 0) return fallbackHsl(segment, intensity, alpha);
      const i = Math.min(Math.floor(segment * colors.length), colors.length - 1);
      const hex = colors[i];
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r},${g},${b},${alpha})`;
    }
    default:
      return fallbackHsl(segment, intensity, alpha);
  }
}

/** Single base color (e.g. for waveform stroke). For custom/changing/album. */
export function getPrimaryColor(dc: DrawContext): string {
  const opt = dc.colorOptions;
  switch (opt.mode) {
    case 'custom':
      return opt.customColor;
    case 'changing': {
      const hue = (opt.colorPhase * 360) % 360;
      return `hsl(${hue}, 80%, 60%)`;
    }
    case 'album': {
      if (opt.albumArtColors.length === 0) return '#6c5ce7';
      return opt.albumArtColors[0];
    }
    default:
      return '#6c5ce7';
  }
}

/** Secondary color for gradients (e.g. lighter variant). */
export function getSecondaryColor(dc: DrawContext): string {
  const opt = dc.colorOptions;
  switch (opt.mode) {
    case 'custom': {
      const hex = opt.customColor;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const boost = 1.25;
      return `rgb(${Math.min(255, r * boost)},${Math.min(255, g * boost)},${Math.min(255, b * boost)})`;
    }
    case 'changing': {
      const hue = ((opt.colorPhase + 0.1) * 360) % 360;
      return `hsl(${hue}, 90%, 70%)`;
    }
    case 'album': {
      if (opt.albumArtColors.length < 2) return getPrimaryColor(dc);
      return opt.albumArtColors[1];
    }
    default:
      return '#a29bfe';
  }
}

/** Build a gradient using primary/secondary (and optional third for line). */
export function getGradientStops(dc: DrawContext): string[] {
  const opt = dc.colorOptions;
  if (opt.mode === 'album' && opt.albumArtColors.length >= 2) {
    return opt.albumArtColors.slice(0, 4);
  }
  return [getPrimaryColor(dc), getSecondaryColor(dc)];
}

function fallbackHsl(segment: number, intensity: number, alpha: number): string {
  const hue = DEFAULT_HUE_START + (DEFAULT_HUE_END - DEFAULT_HUE_START) * segment;
  const lightness = 45 + intensity * 20;
  return `hsla(${hue}, 80%, ${lightness}%, ${alpha})`;
}

/** Convert hex or hsl string to rgba with given alpha. */
export function toRgba(color: string, alpha: number): string {
  if (color.startsWith('hsl')) {
    return color.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
  }
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const DEFAULT_COLOR_OPTIONS: VisualizerColorOptions = {
  mode: 'default',
  customColor: '#6c5ce7',
  albumArtColors: [],
  colorPhase: 0,
};

export function getDefaultColorOptions(): VisualizerColorOptions {
  return { ...DEFAULT_COLOR_OPTIONS };
}

/** Extract dominant palette (2–4 hex colors) from an image. May return [] if canvas is tainted (CORS). */
export async function extractColorsFromImage(img: HTMLImageElement): Promise<string[]> {
  if (!img.complete || img.naturalWidth === 0) return [];
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  try {
    ctx.drawImage(img, 0, 0, size, size);
  } catch {
    return [];
  }
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return [];
  }
  const buckets: Record<string, { r: number; g: number; b: number; n: number }> = {};
  const step = 4;
  for (let i = 0; i < data.length; i += step * 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const key = `${(r >> 4) << 4},${(g >> 4) << 4},${(b >> 4) << 4}`;
    if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0 };
    buckets[key].r += r;
    buckets[key].g += g;
    buckets[key].b += b;
    buckets[key].n += 1;
  }
  const entries = Object.entries(buckets)
    .filter(([, v]) => v.n >= 4)
    .map(([k, v]) => {
      const n = v.n;
      return {
        r: Math.round(v.r / n),
        g: Math.round(v.g / n),
        b: Math.round(v.b / n),
        n,
      };
    })
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);
  const filtered = entries.filter((c) => {
    const l = (c.r * 0.299 + c.g * 0.587 + c.b * 0.114) / 255;
    return l > 0.15 && l < 0.92;
  });
  const out = (filtered.length ? filtered : entries).slice(0, 4);
  return out.map((c) => '#' + [c.r, c.g, c.b].map((x) => x.toString(16).padStart(2, '0')).join(''));
}
