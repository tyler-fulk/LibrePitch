export type VisualizerStyle = 'bars' | 'mirror' | 'line' | 'waveform' | 'circular' | 'bubbles' | 'particles' | 'vinyl';

export type VisualizerColorMode = 'default' | 'custom' | 'changing' | 'album';

export interface VisualizerColorOptions {
  mode: VisualizerColorMode;
  customColor: string;
  albumArtColors: string[];
  colorPhase: number;
}

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  analyser: AnalyserNode;
  colorOptions: VisualizerColorOptions;
  /** If set, spectrum is shown only up to this bin index so the display fits the song's frequency content. */
  frequencyEndIndex?: number;
  /** Number of bars to draw (Bars and Mirror styles). */
  barCount?: number;
  /** Incremented when the canvas is resized; effects can use this to invalidate size-based caches. */
  resizeCounter?: number;
  /** Effective playback rate (speed × pitch) for rotation etc. */
  playbackRate?: number;
  /** Current album art URL for vinyl center label, or null. */
  albumArtUrl?: string | null;
}

export type DrawFunction = (dc: DrawContext) => void;
