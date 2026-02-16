import { DrawContext } from './types';
import { getColor } from './colors';

export function drawBars(dc: DrawContext): void {
  const { ctx, width, height, frequencyData } = dc;
  const len = frequencyData.length;
  const effectiveLen = dc.frequencyEndIndex != null ? Math.min(dc.frequencyEndIndex, len) : len;

  const requestedBars = dc.barCount ?? 128;
  const barCount = Math.min(effectiveLen, Math.max(16, Math.min(512, requestedBars)));
  const step = Math.max(1, Math.floor(effectiveLen / barCount));
  const barWidth = width / barCount;
  const gap = Math.max(1, barWidth * 0.15);

  for (let i = 0; i < barCount; i++) {
    const binIndex = Math.min(i * step, effectiveLen - 1);
    const value = frequencyData[binIndex] ?? 0;
    const percent = value / 255;
    const barHeight = percent * height * 0.9;
    const segment = i / barCount;

    ctx.fillStyle = getColor(dc, segment, percent);

    const x = i * barWidth + gap / 2;
    const y = height - barHeight;
    ctx.fillRect(x, y, barWidth - gap, barHeight);

    if (percent > 0.05) {
      ctx.fillStyle = getColor(dc, segment, 0.7);
      ctx.globalAlpha = percent * 0.4;
      ctx.fillRect(x, y - 4, barWidth - gap, 3);
      ctx.globalAlpha = 1;
    }
  }
}
