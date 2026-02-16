import { VisualizerStyle, DrawFunction, DrawContext, VisualizerColorOptions } from './types';
import { getDefaultColorOptions } from './colors';
import { drawBars } from './bars';
import { drawWaveform } from './waveform';
import { drawCircular } from './circular';
import { drawMirror } from './mirror';
import { drawLine } from './line';
import { drawBubbles } from './bubbles';
import { drawParticles } from './particles';
import { drawVinyl } from './vinyl';

const styleMap: Record<VisualizerStyle, DrawFunction> = {
  bars: drawBars,
  mirror: drawMirror,
  line: drawLine,
  waveform: drawWaveform,
  circular: drawCircular,
  bubbles: drawBubbles,
  particles: drawParticles,
  vinyl: drawVinyl,
};

export class Visualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private analyser: AnalyserNode | null = null;
  private style: VisualizerStyle = 'bars';
  private animationId: number | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private timeDomainData: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private resizeObserver: ResizeObserver;
  private colorOptions: VisualizerColorOptions = getDefaultColorOptions();
  private barCount = 128;
  private resizeCounter = 0;
  private playbackRate = 1;
  private albumArtUrl: string | null = null;
  private onClipping: ((clipping: boolean) => void) | null = null;
  private clippingFrames = 0;
  private noClipFrames = 0;
  private lastReportedClipping = false;
  private readonly CLIPPING_THRESHOLD = 0.025; // fraction of samples at hard ceiling/floor to consider clipping
  private readonly CLIPPING_ON_FRAMES = 6;
  private readonly CLIPPING_OFF_FRAMES = 10;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.resizeCounter += 1;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Call when container size may have changed (e.g. fullscreen) so canvas matches viewport. */
  updateSize(): void {
    this.resize();
  }

  setAnalyser(analyser: AnalyserNode): void {
    this.analyser = analyser;
    this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    this.timeDomainData = new Uint8Array(analyser.frequencyBinCount);
  }

  setStyle(style: VisualizerStyle): void {
    this.style = style;
  }

  getStyle(): VisualizerStyle {
    return this.style;
  }

  setBarCount(count: number): void {
    this.barCount = Math.max(16, Math.min(512, Math.round(count)));
  }

  getBarCount(): number {
    return this.barCount;
  }

  setColorMode(mode: VisualizerColorOptions['mode']): void {
    this.colorOptions.mode = mode;
  }

  setCustomColor(hex: string): void {
    this.colorOptions.customColor = hex;
  }

  setAlbumArtColors(colors: string[]): void {
    this.colorOptions.albumArtColors = colors;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }

  setAlbumArtUrl(url: string | null): void {
    this.albumArtUrl = url;
  }

  setOnClipping(cb: (clipping: boolean) => void): void {
    this.onClipping = cb;
  }

  /** Reset clipping state so the warning can be shown again after user clears it. */
  resetClippingState(): void {
    this.clippingFrames = 0;
    this.noClipFrames = 0;
    this.lastReportedClipping = false;
  }

  start(): void {
    if (this.animationId !== null) return;
    this.loop();
  }

  stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.clear();
  }

  private loop = (): void => {
    this.animationId = requestAnimationFrame(this.loop);
    this.draw();
  };

  private draw(): void {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeDomainData);

    if (this.onClipping && this.timeDomainData.length > 0) {
      let clipCount = 0;
      for (let i = 0; i < this.timeDomainData.length; i++) {
        const v = this.timeDomainData[i];
        if (v === 0 || v === 255) clipCount += 1;
      }
      const clipRatio = clipCount / this.timeDomainData.length;
      if (clipRatio >= this.CLIPPING_THRESHOLD) {
        this.clippingFrames = Math.min(this.CLIPPING_ON_FRAMES, this.clippingFrames + 1);
        this.noClipFrames = 0;
        if (this.clippingFrames >= this.CLIPPING_ON_FRAMES && !this.lastReportedClipping) {
          this.lastReportedClipping = true;
          this.onClipping(true);
        }
      } else {
        this.noClipFrames = Math.min(this.CLIPPING_OFF_FRAMES, this.noClipFrames + 1);
        if (this.noClipFrames >= this.CLIPPING_OFF_FRAMES) {
          this.clippingFrames = 0;
          this.lastReportedClipping = false;
          // Do not call onClipping(false) - warning stays until user changes volume or other controls
        }
      }
    }

    if (this.colorOptions.mode === 'changing') {
      this.colorOptions.colorPhase = (this.colorOptions.colorPhase + 0.004) % 1;
    }

    const dc: DrawContext = {
      ctx,
      width,
      height,
      frequencyData: this.frequencyData,
      timeDomainData: this.timeDomainData,
      analyser: this.analyser,
      colorOptions: { ...this.colorOptions },
      resizeCounter: this.resizeCounter,
      ...((this.style === 'bars' || this.style === 'mirror') && { barCount: this.barCount }),
      ...(this.style === 'vinyl' && { playbackRate: this.playbackRate, albumArtUrl: this.albumArtUrl }),
    };

    const drawFn = styleMap[this.style];
    if (drawFn) {
      drawFn(dc);
    }
  }

  private clear(): void {
    const dpr = window.devicePixelRatio || 1;
    this.ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
  }
}
