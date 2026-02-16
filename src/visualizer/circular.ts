import { DrawContext } from './types';
import { getColor, getPrimaryColor, toRgba } from './colors';

export function drawCircular(dc: DrawContext): void {
  const { ctx, width, height, frequencyData } = dc;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.25;
  const len = frequencyData.length;
  const effectiveLen = dc.frequencyEndIndex != null ? Math.min(dc.frequencyEndIndex, len) : len;
  const barCount = Math.min(effectiveLen, 180);
  const step = Math.max(1, Math.floor(effectiveLen / barCount));

  ctx.save();
  ctx.translate(centerX, centerY);

  for (let i = 0; i < barCount; i++) {
    const binIndex = Math.min(i * step, effectiveLen - 1);
    const value = frequencyData[binIndex] ?? 0;
    const percent = value / 255;
    const segment = i / barCount;
    const angle = segment * Math.PI * 2 - Math.PI / 2;

    const barLength = percent * radius * 1.5 + 2;
    const barWidth = (Math.PI * 2 * radius) / barCount * 0.7;

    ctx.save();
    ctx.rotate(angle);

    ctx.fillStyle = getColor(dc, segment, percent);
    ctx.fillRect(radius, -barWidth / 2, barLength, barWidth);

    if (percent > 0.3) {
      ctx.fillStyle = getColor(dc, segment, 0.8);
      ctx.globalAlpha = percent * 0.3;
      ctx.fillRect(radius + barLength, -barWidth / 2, 4, barWidth);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  const primary = getPrimaryColor(dc);
  const innerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.9);
  innerGradient.addColorStop(0, toRgba(primary, 0.15));
  innerGradient.addColorStop(1, toRgba(primary, 0));
  ctx.fillStyle = innerGradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = toRgba(primary, 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}
