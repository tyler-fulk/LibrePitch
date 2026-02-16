export type VisualizerStyle = 'bars' | 'mirror' | 'line' | 'waveform' | 'circular' | 'bubbles' | 'particles';

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
  /** Number of bars to draw (Bars style only). */
  barCount?: number;
}

export type DrawFunction = (dc: DrawContext) => void;
