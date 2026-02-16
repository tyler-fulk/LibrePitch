import { VisualizerStyle, DrawFunction, DrawContext, VisualizerColorOptions } from './types';
import { getDefaultColorOptions } from './colors';
import { drawBars } from './bars';
import { drawWaveform } from './waveform';
import { drawCircular } from './circular';
import { drawMirror } from './mirror';
import { drawLine } from './line';
import { drawBubbles } from './bubbles';
import { drawParticles } from './particles';

const styleMap: Record<VisualizerStyle, DrawFunction> = {
  bars: drawBars,
  mirror: drawMirror,
  line: drawLine,
  waveform: drawWaveform,
  circular: drawCircular,
  bubbles: drawBubbles,
  particles: drawParticles,
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
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    if (!document.fullscreenElement) {
      this.canvas.style.height = `${rect.height}px`;
    }
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
      ...(this.style === 'bars' && { barCount: this.barCount }),
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
