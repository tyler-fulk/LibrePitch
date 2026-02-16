import { DrawContext } from './types';
import { getGradientStops, getPrimaryColor, toRgba } from './colors';

export function drawWaveform(dc: DrawContext): void {
  const { ctx, width, height, timeDomainData } = dc;
  const len = timeDomainData.length;
  const sliceWidth = width / len;

  ctx.lineWidth = 2;

  const stops = getGradientStops(dc);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1) || 0, color));

  ctx.strokeStyle = gradient;
  ctx.beginPath();

  for (let i = 0; i < len; i++) {
    const v = timeDomainData[i] / 128.0;
    const y = (v * height) / 2;
    const x = i * sliceWidth;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.strokeStyle = gradient;
  ctx.globalAlpha = 0.2;
  ctx.beginPath();

  for (let i = 0; i < len; i++) {
    const v = timeDomainData[i] / 128.0;
    const deviation = v - 1.0;
    const y = height / 2 + deviation * height * 0.8;
    const x = i * sliceWidth;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.lineTo(width, height / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  const primary = getPrimaryColor(dc);
  const fillGradient = ctx.createLinearGradient(0, 0, width, 0);
  fillGradient.addColorStop(0, toRgba(primary, 0.08));
  fillGradient.addColorStop(0.5, toRgba(primary, 0.12));
  fillGradient.addColorStop(1, toRgba(primary, 0.08));

  ctx.fillStyle = fillGradient;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);

  for (let i = 0; i < len; i++) {
    const v = timeDomainData[i] / 128.0;
    const y = (v * height) / 2;
    const x = i * sliceWidth;
    ctx.lineTo(x, y);
  }

  ctx.lineTo(width, height / 2);
  ctx.closePath();
  ctx.fill();
}
