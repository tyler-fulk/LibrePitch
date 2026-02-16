import { DrawContext } from './types';
import { getColor, getPrimaryColor, toRgba } from './colors';

export function drawMirror(dc: DrawContext): void {
  const { ctx, width, height, frequencyData } = dc;
  const len = frequencyData.length;
  const effectiveLen = dc.frequencyEndIndex != null ? Math.min(dc.frequencyEndIndex, len) : len;
  const barCount = Math.min(effectiveLen, 128);
  const step = Math.max(1, Math.floor(effectiveLen / barCount));
  const barWidth = width / barCount;
  const gap = Math.max(1, barWidth * 0.15);
  const midY = height / 2;

  for (let i = 0; i < barCount; i++) {
    const binIndex = Math.min(i * step, effectiveLen - 1);
    const value = frequencyData[binIndex] ?? 0;
    const percent = value / 255;
    const barHeight = percent * midY * 0.85;
    const segment = i / barCount;

    ctx.fillStyle = getColor(dc, segment, percent);
    const x = i * barWidth + gap / 2;
    const w = barWidth - gap;
    ctx.fillRect(x, midY - barHeight, w, barHeight);

    ctx.fillStyle = getColor(dc, segment, percent * 0.9);
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x, midY, w, barHeight);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = toRgba(getPrimaryColor(dc), 0.3);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(width, midY);
  ctx.stroke();
}
