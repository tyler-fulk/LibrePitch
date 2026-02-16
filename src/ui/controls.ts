import type { AudioGraph } from '../audio/graph';
import type { Visualizer } from '../visualizer/canvas';
import type { VisualizerStyle, VisualizerColorMode } from '../visualizer/types';
import type { Metadata } from '../metadata/extract';

function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const CLIPPING_COOKIE = 'librepitch_enable_clipping';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number): void {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

let currentAbort: AbortController | null = null;
let progressRafId: number | null = null;

export interface ControlsApi {
  setCurrentAlbumArtUrl(url: string | null): void;
  setClippingWarning(visible: boolean): void;
  getClippingCallback(): (visible: boolean) => void;
}

export function initControls(
  graph: AudioGraph,
  visualizer: Visualizer,
  _originalFilename: string,
  initialMetadata: Metadata | null,
  initialBuffer?: AudioBuffer | null
): ControlsApi {
  let currentAlbumArtUrl: string | null = null;
  const setCurrentAlbumArtUrl = (url: string | null) => {
    currentAlbumArtUrl = url;
    visualizer.setAlbumArtUrl(url);
  };
  const clippingWarningEl = document.getElementById('clipping-warning');
  let clippingCheckEnabled = getCookie(CLIPPING_COOKIE) === '1';
  const clippingCheckEnableEl = document.getElementById('clipping-check-enable') as HTMLInputElement | null;
  if (clippingCheckEnableEl) clippingCheckEnableEl.checked = clippingCheckEnabled;
  const setClippingWarning = (visible: boolean) => {
    if (visible && !clippingCheckEnabled) return;
    if (clippingWarningEl) clippingWarningEl.classList.toggle('hidden', !visible);
  };
  function effectsApplied(): boolean {
    const s = graph.getState();
    return s.speed !== 1 || s.detune !== 0 || s.bass !== 0 || s.treble !== 0 ||
      s.lowpass !== 0 || s.highpass !== 0 || s.reverb !== 0 || s.volume !== 1;
  }
  const getClippingCallback = (): ((visible: boolean) => void) => {
    return (visible: boolean) => {
      if (visible && !effectsApplied()) return;
      setClippingWarning(visible);
    };
  };
  setClippingWarning(false);
  // Abort previous listeners
  if (currentAbort) {
    currentAbort.abort();
  }
  if (progressRafId !== null) {
    cancelAnimationFrame(progressRafId);
    progressRafId = null;
  }

  const abort = new AbortController();
  currentAbort = abort;
  const signal = abort.signal;

  const playBtn = $('play-btn') as HTMLButtonElement;
  const stopBtn = $('stop-btn') as HTMLButtonElement;
  const playIcon = $('play-icon');
  const pauseIcon = $('pause-icon');
  const progressBar = $('progress-bar') as HTMLInputElement;
  const currentTimeEl = $('current-time');
  const totalTimeEl = $('total-time');
  const bpmValueEl = $('bpm-value');
  const bpmDetectBtn = $('bpm-detect-btn') as HTMLButtonElement;

  const speedSlider = $('speed-slider') as HTMLInputElement;
  const speedValue = $('speed-value');
  const pitchSlider = $('pitch-slider') as HTMLInputElement;
  const pitchValue = $('pitch-value');
  const bassSlider = $('bass-slider') as HTMLInputElement;
  const bassValue = $('bass-value');
  const trebleSlider = $('treble-slider') as HTMLInputElement;
  const trebleValue = $('treble-value');
  const lowpassSlider = $('lowpass-slider') as HTMLInputElement;
  const lowpassValue = $('lowpass-value');
  const highpassSlider = $('highpass-slider') as HTMLInputElement;
  const highpassValue = $('highpass-value');
  const reverbSlider = $('reverb-slider') as HTMLInputElement;
  const reverbValue = $('reverb-value');
  const reverbTypeDelayBtn = $('reverb-type-delay') as HTMLButtonElement;
  const reverbTypeOriginalBtn = $('reverb-type-original') as HTMLButtonElement;
  const presetNightcoreBtn = $('preset-nightcore') as HTMLButtonElement;
  const presetChoppedScrewedBtn = $('preset-chopped-screwed') as HTMLButtonElement;
  const presetNormalBtn = $('preset-normal') as HTMLButtonElement;
  const presetUnderwaterBtn = $('preset-underwater') as HTMLButtonElement;
  const presetTelephoneBtn = $('preset-telephone') as HTMLButtonElement;
  const presetRadioBtn = $('preset-radio') as HTMLButtonElement;
  const presetSpaciousBtn = $('preset-spacious') as HTMLButtonElement;
  const presetVinylBtn = $('preset-vinyl') as HTMLButtonElement;
  const volumeSlider = $('volume-slider') as HTMLInputElement;
  const volumeValue = $('volume-value');

  const resetBtn = $('reset-btn') as HTMLButtonElement;
  const downloadDropdownBtn = $('download-dropdown-btn') as HTMLButtonElement;
  const downloadMenu = $('download-dropdown-menu');
  const downloadWavItem = $('download-wav-item') as HTMLButtonElement;
  const downloadMp3Item = $('download-mp3-item') as HTMLButtonElement;

  const canExport = !!(graph as any).__buffer;
  downloadDropdownBtn.disabled = !canExport;
  bpmDetectBtn.disabled = !canExport;

  const styleBtns = document.querySelectorAll<HTMLButtonElement>('.style-btn');
  const barsStyleBtn = $('bars-style-btn');
  const mirrorStyleBtn = $('mirror-style-btn');
  const barsPopup = $('bars-popup');
  const barsCountSlider = $('bars-count-slider') as HTMLInputElement;
  const barsCountValue = $('bars-count-value');

  function updateBarsOptionsVisibility(): void {
    const style = visualizer.getStyle();
    if (style === 'bars' || style === 'mirror') {
      barsCountSlider.value = String(visualizer.getBarCount());
      barsCountValue.textContent = String(visualizer.getBarCount());
    } else {
      barsPopup.classList.add('hidden');
    }
  }

  const POPUP_GAP_ABOVE = 24;

  function positionBarsPopup(anchor?: HTMLElement): void {
    const el = anchor ?? barsStyleBtn;
    const rect = el.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Use offsetWidth/offsetHeight to get popup dimensions even when hidden
    const popupWidth = barsPopup.offsetWidth || 160; // fallback to min-width
    const popupHeight = barsPopup.offsetHeight || 80; // approximate fallback
    
    // Calculate desired position (centered above button)
    let left = rect.left + rect.width / 2;
    let top = rect.top;
    
    // Clamp left position to keep popup within viewport
    const popupHalfWidth = popupWidth / 2;
    const minLeft = popupHalfWidth + 12; // 12px padding from edge
    const maxLeft = viewportWidth - popupHalfWidth - 12;
    left = Math.max(minLeft, Math.min(maxLeft, left));
    
    // Clamp top position to keep popup visible (at least 8px from top); float well above the bar
    const minTop = 8;
    const maxTop = viewportHeight - popupHeight - 8;
    if (top - popupHeight - POPUP_GAP_ABOVE < minTop) {
      top = rect.bottom + POPUP_GAP_ABOVE;
      barsPopup.style.transform = 'translateX(-50%)';
    } else {
      top = Math.max(minTop, top - popupHeight - POPUP_GAP_ABOVE);
      barsPopup.style.transform = 'translateX(-50%) translateY(-100%)';
    }
    
    barsPopup.style.left = `${left}px`;
    barsPopup.style.top = `${top}px`;
    barsPopup.style.marginTop = '';
  }

  function getEffectiveRate(): number {
    const { speed, detune } = graph.getState();
    return speed * Math.pow(2, detune / 1200);
  }

  function updateVisualizerPlaybackRate(): void {
    visualizer.setPlaybackRate(getEffectiveRate());
  }

  function getRuntimeDuration(): number {
    const duration = graph.getDuration();
    const effectiveRate = getEffectiveRate();
    return effectiveRate > 0 ? duration / effectiveRate : duration;
  }

  function getRuntimeCurrentTime(): number {
    const current = graph.getCurrentTime();
    const effectiveRate = getEffectiveRate();
    return effectiveRate > 0 ? current / effectiveRate : current;
  }

  function updateTotalTime(): void {
    totalTimeEl.textContent = formatTime(getRuntimeDuration());
  }

  // Reset UI values
  updateTotalTime();
  progressBar.value = '0';
  currentTimeEl.textContent = '0:00';
  bpmValueEl.textContent = '-';
  speedSlider.value = '1';
  pitchSlider.value = '0';
  bassSlider.value = '0';
  trebleSlider.value = '0';
  lowpassSlider.value = '0';
  highpassSlider.value = '0';
  reverbSlider.value = '0';
  volumeSlider.value = '1';
  speedValue.textContent = '1.00x';
  pitchValue.textContent = '0 cents';
  bassValue.textContent = '0 dB';
  trebleValue.textContent = '0 dB';
  lowpassValue.textContent = '0%';
  highpassValue.textContent = '0%';
  reverbValue.textContent = '0%';
  const reverbType = graph.getState().reverbType ?? 'delay';
  reverbTypeDelayBtn.classList.toggle('active', reverbType === 'delay');
  reverbTypeOriginalBtn.classList.toggle('active', reverbType === 'original');
  volumeValue.textContent = '100%';
  playIcon.classList.remove('hidden');
  pauseIcon.classList.add('hidden');

  let isSeeking = false;

  function syncProgressBar(): void {
    if (signal.aborted) return;
    const current = graph.getCurrentTime();
    const duration = graph.getDuration();
    const percent = duration > 0 ? (current / duration) * 100 : 0;
    progressBar.value = String(percent);
    currentTimeEl.textContent = formatTime(getRuntimeCurrentTime());
    updateTotalTime();
  }

  function progressLoop(): void {
    if (signal.aborted) {
      progressRafId = null;
      return;
    }
    if (!graph.isPlaying()) {
      progressRafId = null;
      return;
    }
    if (!isSeeking) {
      syncProgressBar();
    }
    progressRafId = requestAnimationFrame(progressLoop);
  }

  function updatePlayState(): void {
    const playing = graph.isPlaying();
    playIcon.classList.toggle('hidden', playing);
    pauseIcon.classList.toggle('hidden', !playing);

    if (playing) {
      visualizer.start();
      if (progressRafId === null) {
        progressRafId = requestAnimationFrame(progressLoop);
      }
    } else {
      if (progressRafId !== null) {
        cancelAnimationFrame(progressRafId);
        progressRafId = null;
      }
      syncProgressBar();
    }
  }

  // Play/Pause
  playBtn.addEventListener('click', async () => {
    if (graph.isPlaying()) {
      graph.pause();
      updatePlayState();
    } else {
      await graph.play();
      updatePlayState();
    }
  }, { signal });

  // Stop
  stopBtn.addEventListener('click', () => {
    graph.stop();
    updatePlayState();
    progressBar.value = '0';
    currentTimeEl.textContent = '0:00';
  }, { signal });

  // On ended
  graph.onEnded(() => {
    if (signal.aborted) return;
    updatePlayState();
    progressBar.value = '100';
    currentTimeEl.textContent = formatTime(getRuntimeDuration());
  });

  // Seeking
  progressBar.addEventListener('mousedown', () => { isSeeking = true; }, { signal });
  progressBar.addEventListener('touchstart', () => { isSeeking = true; }, { signal });

  progressBar.addEventListener('input', () => {
    const percent = parseFloat(progressBar.value);
    const runtimeAtPosition = (percent / 100) * getRuntimeDuration();
    currentTimeEl.textContent = formatTime(runtimeAtPosition);
  }, { signal });

  progressBar.addEventListener('change', () => {
    const percent = parseFloat(progressBar.value);
    const time = (percent / 100) * graph.getDuration();
    graph.seek(time);
    isSeeking = false;
  }, { signal });

  // BPM: detect via web-audio-beat-detector; result scaled by speed slider; autorun on load when buffer available
  let bpmBase: number | null = null;

  function updateBPMDisplay(): void {
    if (signal.aborted) return;
    if (bpmBase == null) {
      bpmValueEl.textContent = '-';
      return;
    }
    const speed = graph.getState().speed;
    bpmValueEl.textContent = String(Math.round(bpmBase * speed));
  }

  async function runBPMDetect(buffer: AudioBuffer): Promise<void> {
    bpmDetectBtn.disabled = true;
    bpmValueEl.textContent = '…';
    try {
      const { analyze } = await import('web-audio-beat-detector');
      const tempo = await analyze(buffer);
      if (signal.aborted) return;
      bpmBase = Math.round(tempo);
      updateBPMDisplay();
    } catch (err) {
      if (!signal.aborted) {
        bpmValueEl.textContent = '-';
        showStatus('BPM detection failed.', 'error');
      }
    } finally {
      if (!signal.aborted) bpmDetectBtn.disabled = false;
    }
  }

  bpmDetectBtn.addEventListener('click', () => {
    const buffer = (graph as { __buffer?: AudioBuffer }).__buffer;
    if (!buffer) {
      showStatus('BPM detect not available for this source (e.g. M4A playback-only).', 'error');
      return;
    }
    runBPMDetect(buffer);
  }, { signal });

  // Autorun BPM detect when audio loads with a buffer
  if (initialBuffer && !signal.aborted) {
    runBPMDetect(initialBuffer);
  }

  // Turntable link: speed and pitch are coupled (speed = 2^(cents/1200), cents = 1200*log2(speed))
  const PITCH_MIN = -1200;
  const PITCH_MAX = 1200;
  const SPEED_MIN = 0.25;
  const SPEED_MAX = 2;

  function syncPitchFromSpeed(speed: number) {
    const detune = Math.round(1200 * Math.log2(speed));
    const clamped = Math.max(PITCH_MIN, Math.min(PITCH_MAX, detune));
    graph.setSpeed(speed);
    graph.setDetune(clamped);
    pitchSlider.value = String(clamped);
    speedValue.textContent = `${speed.toFixed(2)}x`;
    pitchValue.textContent = `${clamped > 0 ? '+' : ''}${clamped} cents`;
    updateTotalTime();
    updateBPMDisplay();
    updateVisualizerPlaybackRate();
  }

  function syncSpeedFromPitch(detuneCents: number) {
    const speed = Math.pow(2, detuneCents / 1200);
    const clamped = Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
    graph.setSpeed(clamped);
    graph.setDetune(detuneCents);
    speedSlider.value = String(Number(clamped.toFixed(2)));
    speedValue.textContent = `${clamped.toFixed(2)}x`;
    pitchValue.textContent = `${detuneCents > 0 ? '+' : ''}${detuneCents} cents`;
    updateTotalTime();
    updateBPMDisplay();
    updateVisualizerPlaybackRate();
  }

  function resetSpeedPitch() {
    speedSlider.value = '1';
    pitchSlider.value = '0';
    graph.setSpeed(1);
    graph.setDetune(0);
    speedValue.textContent = '1.00x';
    pitchValue.textContent = '0 cents';
    updateTotalTime();
    updateBPMDisplay();
    updateVisualizerPlaybackRate();
  }

  // Speed (drives pitch via turntable link)
  speedSlider.addEventListener('input', () => {
    clearClippingWarning();
    const speed = parseFloat(speedSlider.value);
    syncPitchFromSpeed(speed);
  }, { signal });
  speedSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearClippingWarning();
    resetSpeedPitch();
  }, { signal });

  // Pitch (drives speed via turntable link)
  pitchSlider.addEventListener('input', () => {
    clearClippingWarning();
    const detune = parseInt(pitchSlider.value, 10);
    syncSpeedFromPitch(detune);
  }, { signal });
  pitchSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearClippingWarning();
    resetSpeedPitch();
  }, { signal });

  function clearClippingWarning(): void {
    visualizer.resetClippingState();
    setClippingWarning(false);
  }

  clippingCheckEnableEl?.addEventListener('change', () => {
    clippingCheckEnabled = clippingCheckEnableEl.checked;
    setCookie(CLIPPING_COOKIE, clippingCheckEnabled ? '1' : '0', 365);
    if (!clippingCheckEnabled) setClippingWarning(false);
  }, { signal });

  // Full preset: sets graph and every slider (including volume) so UI and sound stay in sync.
  function applyFullPreset(
    speed: number,
    bass: number,
    treble: number,
    lowpass: number,
    highpass: number,
    reverb: number,
    reverbType: 'delay' | 'original',
    volume: number = 1
  ) {
    clearClippingWarning();
    const detuneClamped = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.round(1200 * Math.log2(speed))));
    graph.setSpeed(speed);
    graph.setDetune(detuneClamped);
    graph.setBass(bass);
    graph.setTreble(treble);
    graph.setLowpass(lowpass);
    graph.setHighpass(highpass);
    graph.setReverb(reverb);
    graph.setReverbType(reverbType);
    graph.setVolume(volume);
    speedSlider.value = String(speed);
    pitchSlider.value = String(detuneClamped);
    bassSlider.value = String(bass);
    trebleSlider.value = String(treble);
    lowpassSlider.value = String(lowpass);
    highpassSlider.value = String(highpass);
    reverbSlider.value = String(reverb);
    volumeSlider.value = String(volume);
    speedValue.textContent = `${speed.toFixed(2)}x`;
    pitchValue.textContent = `${detuneClamped > 0 ? '+' : ''}${detuneClamped} cents`;
    bassValue.textContent = `${bass > 0 ? '+' : ''}${bass.toFixed(1)} dB`;
    trebleValue.textContent = `${treble > 0 ? '+' : ''}${treble.toFixed(1)} dB`;
    lowpassValue.textContent = `${lowpass}%`;
    highpassValue.textContent = `${highpass}%`;
    reverbValue.textContent = `${reverb}%`;
    volumeValue.textContent = `${Math.round(volume * 100)}%`;
    reverbTypeDelayBtn.classList.toggle('active', reverbType === 'delay');
    reverbTypeOriginalBtn.classList.toggle('active', reverbType === 'original');
    updateTotalTime();
    updateBPMDisplay();
    updateVisualizerPlaybackRate();
  }

  // Reset all controls to default. Normal preset and Reset button both use this.
  function resetAll() {
    applyFullPreset(1, 0, 0, 0, 0, 0, 'delay', 1);
  }

  presetNightcoreBtn.addEventListener('click', () => {
    applyFullPreset(1.25, 0, 0, 0, 0, 0, 'delay');
  }, { signal });
  presetChoppedScrewedBtn.addEventListener('click', () => {
    applyFullPreset(0.85, 0, 0, 0, 0, 30, 'delay');
  }, { signal });
  presetNormalBtn.addEventListener('click', () => {
    resetAll();
  }, { signal });
  presetUnderwaterBtn.addEventListener('click', () => {
    applyFullPreset(1, 0, 0, 65, 0, 25, 'delay');
  }, { signal });
  presetTelephoneBtn.addEventListener('click', () => {
    applyFullPreset(1, 0, 0, 0, 75, 0, 'delay');
  }, { signal });
  presetRadioBtn.addEventListener('click', () => {
    applyFullPreset(1, 0, 0, 55, 35, 10, 'delay');
  }, { signal });
  presetSpaciousBtn.addEventListener('click', () => {
    applyFullPreset(1, 0, 0, 0, 0, 55, 'delay');
  }, { signal });
  presetVinylBtn.addEventListener('click', () => {
    applyFullPreset(1, 1, 0, 45, 0, 15, 'delay');
  }, { signal });

  // Bass
  bassSlider.addEventListener('input', () => {
    clearClippingWarning();
    const val = parseFloat(bassSlider.value);
    graph.setBass(val);
    bassValue.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
  }, { signal });
  bassSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    bassSlider.value = '0';
    graph.setBass(0);
    bassValue.textContent = '0 dB';
  }, { signal });

  // Treble
  trebleSlider.addEventListener('input', () => {
    clearClippingWarning();
    const val = parseFloat(trebleSlider.value);
    graph.setTreble(val);
    trebleValue.textContent = `${val > 0 ? '+' : ''}${val.toFixed(1)} dB`;
  }, { signal });
  trebleSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    trebleSlider.value = '0';
    graph.setTreble(0);
    trebleValue.textContent = '0 dB';
  }, { signal });

  // Low-pass (muffled / underwater / other room)
  lowpassSlider.addEventListener('input', () => {
    clearClippingWarning();
    const val = parseInt(lowpassSlider.value, 10);
    graph.setLowpass(val);
    lowpassValue.textContent = `${val}%`;
  }, { signal });
  lowpassSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    lowpassSlider.value = '0';
    graph.setLowpass(0);
    lowpassValue.textContent = '0%';
  }, { signal });

  // High-pass (tinny / telephone)
  highpassSlider.addEventListener('input', () => {
    clearClippingWarning();
    const val = parseInt(highpassSlider.value, 10);
    graph.setHighpass(val);
    highpassValue.textContent = `${val}%`;
  }, { signal });
  highpassSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    highpassSlider.value = '0';
    graph.setHighpass(0);
    highpassValue.textContent = '0%';
  }, { signal });

  // Reverb
  reverbTypeDelayBtn.addEventListener('click', () => {
    clearClippingWarning();
    graph.setReverbType('delay');
    reverbTypeDelayBtn.classList.add('active');
    reverbTypeOriginalBtn.classList.remove('active');
  }, { signal });
  reverbTypeOriginalBtn.addEventListener('click', () => {
    clearClippingWarning();
    graph.setReverbType('original');
    reverbTypeOriginalBtn.classList.add('active');
    reverbTypeDelayBtn.classList.remove('active');
  }, { signal });
  reverbSlider.addEventListener('input', () => {
    clearClippingWarning();
    const val = parseInt(reverbSlider.value, 10);
    graph.setReverb(val);
    reverbValue.textContent = `${val}%`;
  }, { signal });
  reverbSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    reverbSlider.value = '0';
    graph.setReverb(0);
    reverbValue.textContent = '0%';
  }, { signal });

  // Volume
  volumeSlider.addEventListener('input', () => {
    clearClippingWarning();
    const val = parseFloat(volumeSlider.value);
    graph.setVolume(val);
    volumeValue.textContent = `${Math.round(val * 100)}%`;
  }, { signal });
  volumeSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    clearClippingWarning();
    volumeSlider.value = '1';
    graph.setVolume(1);
    volumeValue.textContent = '100%';
  }, { signal });

  // Reset (same as Normal preset)
  resetBtn.addEventListener('click', () => {
    resetAll();
  }, { signal });

  const setDownloadBtnLabel = () => {
    downloadDropdownBtn.innerHTML = `
      <svg class="download-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <line x1="12" y1="3" x2="12" y2="15"/>
        <polyline points="7 10 12 15 17 10"/>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      </svg>
      Download
    `;
  };

  downloadDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (downloadDropdownBtn.disabled) return;
    downloadMenu.classList.toggle('hidden');
  }, { signal });

  document.addEventListener('click', () => {
    downloadMenu.classList.add('hidden');
  }, { signal });

  downloadMenu.addEventListener('click', (e) => e.stopPropagation());

  // Download WAV
  downloadWavItem.addEventListener('click', async () => {
    const buffer = (graph as any).__buffer;
    if (!buffer) {
      showStatus('Export not available for M4A/MP4 playback-only mode.', 'error');
      return;
    }
    downloadMenu.classList.add('hidden');
    downloadDropdownBtn.disabled = true;
    downloadDropdownBtn.textContent = 'Rendering...';

    try {
      const { renderAndDownload } = await import('../audio/export');
      const state = graph.getState();
      const baseName = _originalFilename.replace(/\.[^.]+$/, '');
      await renderAndDownload(buffer, state, `${baseName}_modified.wav`);
    } catch (err) {
      console.error('Export error:', err);
      showStatus('Export failed. Please try again.', 'error');
    } finally {
      downloadDropdownBtn.disabled = false;
      setDownloadBtnLabel();
    }
  }, { signal });

  // Download MP3
  downloadMp3Item.addEventListener('click', async () => {
    const buffer = (graph as any).__buffer;
    if (!buffer) {
      showStatus('Export not available for M4A/MP4 playback-only mode.', 'error');
      return;
    }
    downloadMenu.classList.add('hidden');
    downloadDropdownBtn.disabled = true;
    downloadDropdownBtn.textContent = 'Rendering...';

    try {
      const { fetchMetadataFromAPI } = await import('../metadata/api');
      const { renderAndDownloadMp3 } = await import('../audio/export');
      const state = graph.getState();
      const baseName = _originalFilename.replace(/\.[^.]+$/, '');
      const hasComplete =
        initialMetadata &&
        initialMetadata.title?.trim() &&
        initialMetadata.artist?.trim() &&
        (initialMetadata.album?.trim() || initialMetadata.year?.trim() || true);
      const metadata = hasComplete
        ? initialMetadata
        : await fetchMetadataFromAPI(initialMetadata ?? null);

      let albumArt: { mime: string; data: ArrayBuffer } | null = null;
      if (currentAlbumArtUrl) {
        try {
          const resp = await fetch(currentAlbumArtUrl);
          if (resp.ok) {
            const data = await resp.arrayBuffer();
            const contentType = resp.headers.get('content-type') || '';
            const mime = contentType.includes('png') ? 'image/png' : 'image/jpeg';
            albumArt = { mime, data };
          }
        } catch {
          /* ignore */
        }
      }
      await renderAndDownloadMp3(buffer, state, `${baseName}_modified.mp3`, metadata, albumArt);
    } catch (err) {
      console.error('Export error:', err);
      showStatus('Export failed. Please try again.', 'error');
    } finally {
      downloadDropdownBtn.disabled = false;
      setDownloadBtnLabel();
    }
  }, { signal });

  // Style picker
  styleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      styleBtns.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.bars-btn-wrap').forEach((w) => w.classList.remove('active'));
      btn.classList.add('active');
      const style = btn.dataset.style as VisualizerStyle;
      if (style === 'bars') barsStyleBtn.classList.add('active');
      else if (style === 'mirror') mirrorStyleBtn.classList.add('active');
      visualizer.setStyle(style);
      if (style !== 'bars' && style !== 'mirror') barsPopup.classList.add('hidden');
      updateBarsOptionsVisibility();
    }, { signal });
  });

  // Bars internal adjust button: opens popup only
  const barsAdjustBtn = $('bars-adjust-btn');
  barsAdjustBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    barsPopup.classList.toggle('hidden');
    if (!barsPopup.classList.contains('hidden')) positionBarsPopup(barsStyleBtn);
  }, { signal });

  const mirrorAdjustBtn = document.querySelector('.mirror-adjust-btn');
  mirrorAdjustBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    barsPopup.classList.toggle('hidden');
    if (!barsPopup.classList.contains('hidden')) positionBarsPopup(mirrorStyleBtn);
  }, { signal });

  barsPopup.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('click', () => {
    barsPopup.classList.add('hidden');
  }, { signal });

  // Bars count slider
  barsCountSlider.addEventListener('input', () => {
    const count = parseInt(barsCountSlider.value, 10);
    if (!Number.isNaN(count)) {
      visualizer.setBarCount(count);
      barsCountValue.textContent = barsCountSlider.value;
    }
  }, { signal });
  barsCountSlider.addEventListener('dblclick', (e) => {
    e.preventDefault();
    barsCountSlider.value = '128';
    visualizer.setBarCount(128);
    barsCountValue.textContent = '128';
  }, { signal });

  updateBarsOptionsVisibility();

  // Visualizer color mode
  const colorModeBtns = document.querySelectorAll<HTMLButtonElement>('.color-mode-btn');
  const colorPickerWrap = $('color-picker-wrap');
  const colorPicker = $('visualizer-color') as HTMLInputElement;

  colorModeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.color-mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.colorMode as VisualizerColorMode;
      visualizer.setColorMode(mode);
      colorPickerWrap.classList.toggle('hidden', mode !== 'custom');
    }, { signal });
  });

  colorPicker.addEventListener('input', () => {
    visualizer.setCustomColor(colorPicker.value);
  }, { signal });

  updateVisualizerPlaybackRate();

  return { setCurrentAlbumArtUrl, setClippingWarning, getClippingCallback };
}

export function updateMetadataUI(
  meta: Metadata | null,
  artUrl: string | null,
  onAlbumArtLoad?: (img: HTMLImageElement) => void
): void {
  const titleEl = $('track-title');
  const artistEl = $('track-artist');
  const albumEl = $('track-album');
  const artImg = $('album-art') as HTMLImageElement;
  const artPlaceholder = $('album-art-placeholder');

  if (meta) {
    titleEl.textContent = meta.title || 'Unknown Title';
    artistEl.textContent = meta.artist || 'Unknown Artist';
    albumEl.textContent = [meta.album, meta.year].filter(Boolean).join(' · ') || '';
  } else {
    titleEl.textContent = 'Unknown Track';
    artistEl.textContent = '';
    albumEl.textContent = '';
  }

  if (artUrl) {
    artImg.crossOrigin = 'anonymous';
    artImg.src = artUrl;
    artImg.classList.remove('hidden');
    artPlaceholder.classList.add('hidden');
    artImg.onerror = () => {
      artImg.classList.add('hidden');
      artPlaceholder.classList.remove('hidden');
    };
    if (onAlbumArtLoad) {
      const runCallback = () => onAlbumArtLoad(artImg);
      if (artImg.complete && artImg.naturalWidth > 0) {
        runCallback();
      } else {
        artImg.onload = runCallback;
      }
    }
  } else {
    artImg.classList.add('hidden');
    artPlaceholder.classList.remove('hidden');
    setAlbumArtColorOptionVisible(false);
  }
}

export function setAlbumArtColorOptionVisible(visible: boolean): void {
  const el = document.getElementById('color-mode-album');
  if (el) el.classList.toggle('hidden', !visible);
}

export function showStatus(_message: string, _type: 'info' | 'error' | 'success' = 'info'): void {
  // Status bar removed; no-op to keep call sites from breaking.
}
