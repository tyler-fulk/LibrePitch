import { getAudioContext, ensureContextResumed } from './decode';

export type ReverbType = 'delay' | 'original';

export interface AudioGraphState {
  speed: number;
  detune: number;
  bass: number;
  treble: number;
  lowpass: number;
  highpass: number;
  reverb: number;
  reverbType: ReverbType;
  volume: number;
}

export interface AudioGraph {
  play(offset?: number): void;
  pause(): void;
  stop(): void;
  isPlaying(): boolean;
  getAnalyser(): AnalyserNode;
  setSpeed(value: number): void;
  setDetune(cents: number): void;
  setBass(db: number): void;
  setTreble(db: number): void;
  setLowpass(amount: number): void;
  setHighpass(amount: number): void;
  setReverb(amount: number): void;
  setReverbType(type: ReverbType): void;
  setVolume(value: number): void;
  getState(): AudioGraphState;
  getDuration(): number;
  getCurrentTime(): number;
  seek(time: number): void;
  onEnded(cb: () => void): void;
  dispose(): void;
}

/** Delay-based reverb (adds tail without reducing dry level). Returns send node (input) and bus node (output). Exported for offline render. */
export function createDelayReverb(ctx: BaseAudioContext): { send: GainNode; bus: GainNode } {
  const send = ctx.createGain();
  send.gain.value = 1;

  const times = [0.029, 0.073, 0.147, 0.201];
  const delays = times.map((t) => {
    const d = ctx.createDelay(0.5);
    d.delayTime.value = t;
    return d;
  });

  const bus = ctx.createGain();
  bus.gain.value = 1;

  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = 0.22;

  const dampen = ctx.createBiquadFilter();
  dampen.type = 'lowpass';
  dampen.frequency.value = 4000;
  dampen.Q.value = 0.5;

  delays.forEach((d) => {
    send.connect(d);
    d.connect(bus);
  });
  bus.connect(dampen);
  dampen.connect(feedbackGain);
  feedbackGain.connect(send);

  return { send, bus };
}

/** Original reverb: ConvolverNode with generated room IR. Dry/wet blend (dry reduced as reverb increases). Same interface as delay reverb. */
export function createOriginalReverb(ctx: BaseAudioContext): { send: GainNode; bus: GainNode } {
  const send = ctx.createGain();
  send.gain.value = 1;

  const length = 16384;
  const irBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = irBuffer.getChannelData(0);
  const decay = 2.5;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    channel[i] = (Math.random() * 2 - 1) * Math.exp(-t * decay);
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = irBuffer;
  convolver.normalize = true;

  const bus = ctx.createGain();
  bus.gain.value = 1;

  send.connect(convolver);
  convolver.connect(bus);
  return { send, bus };
}

export function createAudioGraph(buffer: AudioBuffer): AudioGraph {
  const ctx = getAudioContext();

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowshelf';
  bassFilter.frequency.value = 320;
  bassFilter.gain.value = 0;

  const trebleFilter = ctx.createBiquadFilter();
  trebleFilter.type = 'highshelf';
  trebleFilter.frequency.value = 3200;
  trebleFilter.gain.value = 0;

  const lowpassFilter = ctx.createBiquadFilter();
  lowpassFilter.type = 'lowpass';
  lowpassFilter.Q.value = 0.7;

  const highpassFilter = ctx.createBiquadFilter();
  highpassFilter.type = 'highpass';
  highpassFilter.Q.value = 0.7;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0;

  const delayReverb = createDelayReverb(ctx);
  const originalReverb = createOriginalReverb(ctx);

  const gainNode = ctx.createGain();
  gainNode.gain.value = 1.0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  bassFilter.connect(trebleFilter);
  trebleFilter.connect(lowpassFilter);
  lowpassFilter.connect(highpassFilter);
  highpassFilter.connect(dryGain);
  highpassFilter.connect(delayReverb.send);
  highpassFilter.connect(originalReverb.send);
  dryGain.connect(gainNode);
  wetGain.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(ctx.destination);

  function setFilterFreqs() {
    const lp = state.lowpass / 100;
    const hp = state.highpass / 100;
    lowpassFilter.frequency.value = lp <= 0 ? 20000 : 20000 * Math.pow(2, -6.64 * lp);
    highpassFilter.frequency.value = hp <= 0 ? 20 : 20 * Math.pow(2, 7.64 * hp);
  }

  function connectActiveReverbToWet() {
    delayReverb.bus.disconnect();
    originalReverb.bus.disconnect();
    (state.reverbType === 'delay' ? delayReverb.bus : originalReverb.bus).connect(wetGain);
  }

  let source: AudioBufferSourceNode | null = null;
  let playing = false;
  let startTime = 0;
  let pauseOffset = 0;
  let endedCallback: (() => void) | null = null;

  const state: AudioGraphState = {
    speed: 1.0,
    detune: 0,
    bass: 0,
    treble: 0,
    lowpass: 0,
    highpass: 0,
    reverb: 0,
    reverbType: 'delay',
    volume: 1.0,
  };

  connectActiveReverbToWet();
  setFilterFreqs();

  function setReverbGains(amount: number) {
    if (state.reverbType === 'delay') {
      dryGain.gain.value = 1;
      wetGain.gain.value = (amount / 100) * 0.45;
    } else {
      const w = (amount / 100) * 0.5;
      dryGain.gain.value = 1 - w;
      wetGain.gain.value = w;
    }
  }

  function createSource(offset: number) {
    if (source) {
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect();
    }

    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = state.speed;
    source.detune.value = state.detune;
    source.connect(bassFilter);

    source.onended = () => {
      if (playing) {
        playing = false;
        pauseOffset = 0;
        endedCallback?.();
      }
    };

    source.start(0, offset);
    startTime = ctx.currentTime - offset / state.speed;
  }

  const graph: AudioGraph = {
    async play(offset?: number) {
      await ensureContextResumed();
      const off = offset ?? pauseOffset;
      createSource(off);
      playing = true;
    },

    pause() {
      if (!playing || !source) return;
      pauseOffset = graph.getCurrentTime();
      source.onended = null;
      try { source.stop(); } catch {}
      source.disconnect();
      source = null;
      playing = false;
    },

    stop() {
      if (source) {
        source.onended = null;
        try { source.stop(); } catch {}
        source.disconnect();
        source = null;
      }
      playing = false;
      pauseOffset = 0;
    },

    isPlaying() {
      return playing;
    },

    getAnalyser() {
      return analyser;
    },

    setSpeed(value: number) {
      state.speed = value;
      if (source) {
        source.playbackRate.value = value;
        const currentPos = graph.getCurrentTime();
        startTime = ctx.currentTime - currentPos / value;
      }
    },

    setDetune(cents: number) {
      state.detune = cents;
      if (source) {
        source.detune.value = cents;
      }
    },

    setBass(db: number) {
      state.bass = db;
      bassFilter.gain.value = db;
    },

    setTreble(db: number) {
      state.treble = db;
      trebleFilter.gain.value = db;
    },

    setLowpass(amount: number) {
      state.lowpass = Math.max(0, Math.min(100, amount));
      setFilterFreqs();
    },

    setHighpass(amount: number) {
      state.highpass = Math.max(0, Math.min(100, amount));
      setFilterFreqs();
    },

    setReverb(amount: number) {
      state.reverb = Math.max(0, Math.min(100, amount));
      setReverbGains(state.reverb);
    },

    setReverbType(type: ReverbType) {
      state.reverbType = type;
      connectActiveReverbToWet();
      setReverbGains(state.reverb);
    },

    setVolume(value: number) {
      state.volume = value;
      gainNode.gain.value = value;
    },

    getState() {
      return { ...state };
    },

    getDuration() {
      return buffer.duration;
    },

    getCurrentTime() {
      if (!playing) return pauseOffset;
      const elapsed = (ctx.currentTime - startTime) * state.speed;
      return Math.min(elapsed, buffer.duration);
    },

    seek(time: number) {
      pauseOffset = Math.max(0, Math.min(time, buffer.duration));
      if (playing) {
        createSource(pauseOffset);
      }
    },

    onEnded(cb: () => void) {
      endedCallback = cb;
    },

    dispose() {
      graph.stop();
      bassFilter.disconnect();
      trebleFilter.disconnect();
      lowpassFilter.disconnect();
      highpassFilter.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      gainNode.disconnect();
      analyser.disconnect();
    },
  };

  return graph;
}

/** Create a graph from an HTMLAudioElement (for M4A/MP4 when decodeAudioData fails). No __buffer; export disabled. */
export function createAudioGraphFromMediaElement(
  audio: HTMLAudioElement,
  _blobUrl: string
): AudioGraph {
  const ctx = getAudioContext();

  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = 'lowshelf';
  bassFilter.frequency.value = 320;
  bassFilter.gain.value = 0;

  const trebleFilter = ctx.createBiquadFilter();
  trebleFilter.type = 'highshelf';
  trebleFilter.frequency.value = 3200;
  trebleFilter.gain.value = 0;

  const lowpassFilter = ctx.createBiquadFilter();
  lowpassFilter.type = 'lowpass';
  lowpassFilter.Q.value = 0.7;

  const highpassFilter = ctx.createBiquadFilter();
  highpassFilter.type = 'highpass';
  highpassFilter.Q.value = 0.7;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 1;

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0;

  const delayReverb = createDelayReverb(ctx);
  const originalReverb = createOriginalReverb(ctx);

  const gainNode = ctx.createGain();
  gainNode.gain.value = 1.0;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  const source = ctx.createMediaElementSource(audio);
  source.connect(bassFilter);
  bassFilter.connect(trebleFilter);
  trebleFilter.connect(lowpassFilter);
  lowpassFilter.connect(highpassFilter);
  highpassFilter.connect(dryGain);
  highpassFilter.connect(delayReverb.send);
  highpassFilter.connect(originalReverb.send);
  dryGain.connect(gainNode);
  wetGain.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(ctx.destination);

  function setFilterFreqs() {
    const lp = state.lowpass / 100;
    const hp = state.highpass / 100;
    lowpassFilter.frequency.value = lp <= 0 ? 20000 : 20000 * Math.pow(2, -6.64 * lp);
    highpassFilter.frequency.value = hp <= 0 ? 20 : 20 * Math.pow(2, 7.64 * hp);
  }

  function connectActiveReverbToWet() {
    delayReverb.bus.disconnect();
    originalReverb.bus.disconnect();
    (state.reverbType === 'delay' ? delayReverb.bus : originalReverb.bus).connect(wetGain);
  }

  const state: AudioGraphState = {
    speed: 1.0,
    detune: 0,
    bass: 0,
    treble: 0,
    lowpass: 0,
    highpass: 0,
    reverb: 0,
    reverbType: 'delay',
    volume: 1.0,
  };

  connectActiveReverbToWet();
  setFilterFreqs();

  function setReverbGains(amount: number) {
    if (state.reverbType === 'delay') {
      dryGain.gain.value = 1;
      wetGain.gain.value = (amount / 100) * 0.45;
    } else {
      const w = (amount / 100) * 0.5;
      dryGain.gain.value = 1 - w;
      wetGain.gain.value = w;
    }
  }

  let endedCallback: (() => void) | null = null;
  audio.addEventListener('ended', () => endedCallback?.());

  /** HTMLAudioElement has no detune; combine speed and pitch into playbackRate. */
  function applyMediaElementPlaybackRate() {
    audio.playbackRate = state.speed * Math.pow(2, state.detune / 1200);
  }
  applyMediaElementPlaybackRate();

  const graph: AudioGraph = {
    async play(offset?: number) {
      await ensureContextResumed();
      if (offset != null && !isNaN(offset)) audio.currentTime = offset;
      await audio.play();
    },

    pause() {
      audio.pause();
    },

    stop() {
      audio.pause();
      audio.currentTime = 0;
    },

    isPlaying() {
      return !audio.paused;
    },

    getAnalyser() {
      return analyser;
    },

    setSpeed(value: number) {
      state.speed = value;
      applyMediaElementPlaybackRate();
    },

    setDetune(cents: number) {
      state.detune = cents;
      applyMediaElementPlaybackRate();
    },

    setBass(db: number) {
      state.bass = db;
      bassFilter.gain.value = db;
    },

    setTreble(db: number) {
      state.treble = db;
      trebleFilter.gain.value = db;
    },

    setLowpass(amount: number) {
      state.lowpass = Math.max(0, Math.min(100, amount));
      setFilterFreqs();
    },

    setHighpass(amount: number) {
      state.highpass = Math.max(0, Math.min(100, amount));
      setFilterFreqs();
    },

    setReverb(amount: number) {
      state.reverb = Math.max(0, Math.min(100, amount));
      setReverbGains(state.reverb);
    },

    setReverbType(type: ReverbType) {
      state.reverbType = type;
      connectActiveReverbToWet();
      setReverbGains(state.reverb);
    },

    setVolume(value: number) {
      state.volume = value;
      gainNode.gain.value = value;
    },

    getState() {
      return { ...state };
    },

    getDuration() {
      return isFinite(audio.duration) ? audio.duration : 0;
    },

    getCurrentTime() {
      return audio.currentTime;
    },

    seek(time: number) {
      if (isFinite(audio.duration)) {
        audio.currentTime = Math.max(0, Math.min(time, audio.duration));
      }
    },

    onEnded(cb: () => void) {
      endedCallback = cb;
    },

    dispose() {
      audio.pause();
      audio.src = '';
      URL.revokeObjectURL(_blobUrl);
      source.disconnect();
      bassFilter.disconnect();
      trebleFilter.disconnect();
      lowpassFilter.disconnect();
      highpassFilter.disconnect();
      dryGain.disconnect();
      wetGain.disconnect();
      gainNode.disconnect();
      analyser.disconnect();
    },
  };

  return graph;
}
