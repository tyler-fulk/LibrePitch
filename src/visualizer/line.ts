import { DrawContext } from './types';
import { getGradientStops, getPrimaryColor, toRgba } from './colors';

export function drawLine(dc: DrawContext): void {
  const { ctx, width, height, frequencyData } = dc;
  const len = frequencyData.length;
  const effectiveLen = dc.frequencyEndIndex != null ? Math.min(dc.frequencyEndIndex, len) : len;
  const points = Math.min(effectiveLen, 256);
  const step = Math.max(1, Math.floor(effectiveLen / points));
  const segWidth = width / (points - 1);

  const stops = getGradientStops(dc);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  if (stops.length >= 2) {
    gradient.addColorStop(0, stops[0]);
    gradient.addColorStop(0.3, stops[1]);
    gradient.addColorStop(0.6, stops[stops.length > 2 ? 2 : 0]);
    gradient.addColorStop(1, stops[stops.length > 3 ? 3 : 1]);
  } else {
    gradient.addColorStop(0, stops[0] ?? '#6c5ce7');
    gradient.addColorStop(1, stops[0] ?? '#6c5ce7');
  }

  ctx.fillStyle = toRgba(getPrimaryColor(dc), 0.03);
  ctx.beginPath();
  ctx.moveTo(0, height);

  for (let i = 0; i < points; i++) {
    const binIndex = Math.min(i * step, effectiveLen - 1);
    const value = (frequencyData[binIndex] ?? 0) / 255;
    const percent = value;
    const y = height - percent * height * 0.85;
    const x = i * segWidth;

    if (i === 0) {
      ctx.lineTo(x, y);
    } else {
      const prevX = (i - 1) * segWidth;
      const prevBinIndex = Math.min((i - 1) * step, effectiveLen - 1);
      const prevVal = (frequencyData[prevBinIndex] ?? 0) / 255;
      const prevY = height - prevVal * height * 0.85;
      const cpx = (prevX + x) / 2;
      ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
    }
  }

  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  for (let i = 0; i < points; i++) {
    const binIndex = Math.min(i * step, effectiveLen - 1);
    const value = (frequencyData[binIndex] ?? 0) / 255;
    const percent = value;
    const y = height - percent * height * 0.85;
    const x = i * segWidth;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = (i - 1) * segWidth;
      const prevBinIndex = Math.min((i - 1) * step, effectiveLen - 1);
      const prevVal = (frequencyData[prevBinIndex] ?? 0) / 255;
      const prevY = height - prevVal * height * 0.85;
      const cpx = (prevX + x) / 2;
      ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
    }
  }

  ctx.stroke();

  ctx.strokeStyle = toRgba(stops[1] ?? getPrimaryColor(dc), 0.2);
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let i = 0; i < points; i++) {
    const binIndex = Math.min(i * step, effectiveLen - 1);
    const value = (frequencyData[binIndex] ?? 0) / 255;
    const percent = value;
    const y = height - percent * height * 0.65;
    const x = i * segWidth;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      const prevX = (i - 1) * segWidth;
      const prevBinIndex = Math.min((i - 1) * step, effectiveLen - 1);
      const prevVal = (frequencyData[prevBinIndex] ?? 0) / 255;
      const prevY = height - prevVal * height * 0.65;
      const cpx = (prevX + x) / 2;
      ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
    }
  }

  ctx.stroke();
}
