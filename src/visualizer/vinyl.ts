import { DrawContext } from './types';
import { toRgba } from './colors';

// 33⅓ RPM at 1x playback; scale by playbackRate for speed
const RPM_33_ONE_THIRD = 100 / 3;
const RADIANS_PER_SECOND_AT_1X = (RPM_33_ONE_THIRD / 60) * 2 * Math.PI;
const GROOVE_COUNT = 48;
const LABEL_RATIO = 0.28; // label radius as fraction of record radius
const HOLE_RATIO = 0.14; // center hole radius as fraction of label radius

let albumImage: HTMLImageElement | null = null;
let albumImageUrl: string | null = null;

function ensureAlbumImage(url: string | null): HTMLImageElement | null {
  if (url === albumImageUrl && albumImage) return albumImage.complete ? albumImage : null;
  if (!url) {
    albumImageUrl = null;
    albumImage = null;
    return null;
  }
  if (!albumImage) albumImage = new Image();
  albumImageUrl = url;
  albumImage.crossOrigin = 'anonymous';
  albumImage.src = url;
  return albumImage.complete ? albumImage : null;
}

export function drawVinyl(dc: DrawContext): void {
  const { ctx, width, height, playbackRate = 1, albumArtUrl = null } = dc;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;
  const labelRadius = radius * LABEL_RATIO;
  const holeRadius = labelRadius * HOLE_RATIO;
  const time = performance.now() / 1000;
  const angle = time * RADIANS_PER_SECOND_AT_1X * playbackRate;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Record surface (dark with slight gradient)
  const recordGradient = ctx.createRadialGradient(0, 0, labelRadius, 0, 0, radius);
  recordGradient.addColorStop(0, '#1a1a22');
  recordGradient.addColorStop(0.4, '#0d0d12');
  recordGradient.addColorStop(1, '#08080c');
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = recordGradient;
  ctx.fill();

  // Grooves (concentric circles from label edge to outer edge; fewer, thicker to reduce aliasing)
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  for (let i = 1; i <= GROOVE_COUNT; i++) {
    const r = labelRadius + (radius - labelRadius) * (i / GROOVE_COUNT);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center label circle (sticker area)
  ctx.beginPath();
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const img = ensureAlbumImage(albumArtUrl);
  if (img && img.complete && img.naturalWidth > 0) {
    const s = labelRadius * 2;
    ctx.drawImage(img, -labelRadius, -labelRadius, s, s);
  } else {
    // Placeholder: simple record center
    ctx.fillStyle = '#2a2a38';
    ctx.fillRect(-labelRadius, -labelRadius, labelRadius * 2, labelRadius * 2);
    ctx.fillStyle = toRgba('#6c5ce7', 0.5);
    ctx.font = `bold ${Math.max(10, labelRadius * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LP', 0, 0);
  }

  // Black center hole (overlaps artwork like a real vinyl)
  ctx.fillStyle = '#0a0a0c';
  ctx.beginPath();
  ctx.arc(0, 0, holeRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // Outer edge highlight
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
