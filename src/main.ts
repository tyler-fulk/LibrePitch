import { decodeAudioFile } from './audio/decode';
import { decodeAlacToAudioBuffer } from './audio/decodeAlac';
import { createAudioGraph, createAudioGraphFromMediaElement, AudioGraph } from './audio/graph';
import { Visualizer } from './visualizer/canvas';
import { extractMetadata } from './metadata/extract';
import { fetchAlbumArt } from './metadata/albumArt';
import { initControls, updateMetadataUI, showStatus, setAlbumArtColorOptionVisible } from './ui/controls';
import { extractColorsFromImage } from './visualizer/colors';
import type { Metadata } from './metadata/extract';
import './style.css';

let currentGraph: AudioGraph | null = null;
let visualizer: Visualizer | null = null;
let currentBuffer: AudioBuffer | null = null;
let currentFilename: string = '';

const uploadArea = document.getElementById('upload-area')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
const controlsPanel = document.getElementById('controls-panel')!;
const stylePicker = document.getElementById('style-picker')!;
const loadNewBtn = document.getElementById('load-new-btn')!;
const visualizerSection = document.querySelector('.visualizer-section')!;

function init(): void {
  setupUpload();
  setupDragDrop();
  setupGlobalDragDrop();
  setupLoadNew();
  setupAlbumArtChangeSong();
  setupFullscreen();
  setupKeyboard();
  setupModals();
}

function setupModals(): void {
  const modals = [
    { btnId: 'btn-privacy', modalId: 'modal-privacy' },
    { btnId: 'btn-help', modalId: 'modal-help' },
    { btnId: 'btn-credits', modalId: 'modal-credits' },
  ] as const;

  function openModal(modalId: string, openBtn: HTMLElement): void {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.hidden = false;
    (modal.querySelector('.modal-close') as HTMLElement)?.focus();
    const previouslyFocused = openBtn;
    const close = () => {
      modal.hidden = true;
      previouslyFocused?.focus();
      document.removeEventListener('keydown', onEscape);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onEscape);
    modal.querySelector('.modal-overlay')?.addEventListener('click', close, { once: true });
    modal.querySelector('.modal-close')?.addEventListener('click', close, { once: true });
  }

  for (const { btnId, modalId } of modals) {
    const btn = document.getElementById(btnId);
    const modal = document.getElementById(modalId);
    if (btn && modal) {
      btn.addEventListener('click', () => openModal(modalId, btn));
    }
  }
}

function setupFullscreen(): void {
  const btn = document.getElementById('fullscreen-btn');
  const iconExpand = btn?.querySelector('.fullscreen-icon-expand');
  const iconExit = btn?.querySelector('.fullscreen-icon-exit');
  if (!btn || !visualizerSection) return;

  // Detect touch capability
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  const BAR_HIDE_DELAY_MS = 3000;
  const MOVE_THRESHOLD_PX = 3;
  let barHideTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastMoveX = Number.NaN;
  let lastMoveY = Number.NaN;

  const isFullscreenActive = (): boolean => document.fullscreenElement === visualizerSection;

  function clearHideTimer(): void {
    if (barHideTimeout !== null) {
      clearTimeout(barHideTimeout);
      barHideTimeout = null;
    }
  }

  let barVisible = true;
  let barHeight = 0;

  function getBarHeight(): number {
    return stylePicker.offsetHeight || 52;
  }

  function hideBar(): void {
    if (!barVisible) return;
    barVisible = false;
    clearHideTimer();
    stylePicker.style.transition = 'transform 0.35s ease';
    stylePicker.style.transform = 'translateY(100%)';
    stylePicker.style.pointerEvents = 'none';
    canvas.style.transition = 'bottom 0.35s ease';
    canvas.style.bottom = '0';
    canvas.style.height = `${window.innerHeight}px`;
    requestAnimationFrame(() => visualizer?.updateSize());
  }

  function showBar(): void {
    if (barVisible) { scheduleBarHide(); return; }
    barVisible = true;
    barHeight = getBarHeight();
    stylePicker.style.transition = 'transform 0.35s ease';
    stylePicker.style.transform = 'translateY(0)';
    stylePicker.style.pointerEvents = 'auto';
    canvas.style.transition = 'bottom 0.35s ease';
    canvas.style.bottom = `${barHeight}px`;
    canvas.style.height = `${Math.max(1, window.innerHeight - barHeight)}px`;
    requestAnimationFrame(() => visualizer?.updateSize());
    scheduleBarHide();
  }

  function scheduleBarHide(): void {
    clearHideTimer();
    // On touch devices, keep bar always visible
    if (isTouchDevice) return;
    barHideTimeout = window.setTimeout(() => {
      if (isFullscreenActive()) hideBar();
    }, BAR_HIDE_DELAY_MS);
  }

  function resetBarStyles(): void {
    barVisible = true;
    stylePicker.style.transition = '';
    stylePicker.style.transform = '';
    stylePicker.style.pointerEvents = '';
    stylePicker.style.position = '';
    stylePicker.style.bottom = '';
    stylePicker.style.left = '';
    stylePicker.style.right = '';
    stylePicker.style.zIndex = '';
    canvas.style.transition = '';
    canvas.style.bottom = '';
    canvas.style.position = '';
    canvas.style.top = '';
    canvas.style.left = '';
    canvas.style.right = '';
    canvas.style.height = '';
  }

  function onMouseMove(e: Event): void {
    if (!isFullscreenActive()) return;
    const me = e as MouseEvent;
    if (Number.isNaN(lastMoveX) || Number.isNaN(lastMoveY)) {
      lastMoveX = me.clientX;
      lastMoveY = me.clientY;
      showBar();
      return;
    }
    const dx = me.clientX - lastMoveX;
    const dy = me.clientY - lastMoveY;
    if (dx * dx + dy * dy < MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) return;
    lastMoveX = me.clientX;
    lastMoveY = me.clientY;
    showBar();
  }

  function onMouseEnter(): void {
    if (!isFullscreenActive()) return;
    lastMoveX = Number.NaN;
    lastMoveY = Number.NaN;
    showBar();
  }

  function onMouseLeave(): void {
    if (!isFullscreenActive()) return;
    hideBar();
  }

  function onWindowBlur(): void {
    if (!isFullscreenActive()) return;
    hideBar();
  }

  function onInteraction(): void {
    if (!isFullscreenActive()) return;
    showBar();
  }

  function onFullscreenChange(): void {
    const isFs = isFullscreenActive();
    iconExpand?.classList.toggle('hidden', isFs);
    iconExit?.classList.toggle('hidden', !isFs);
    btn?.setAttribute('title', isFs ? 'Exit fullscreen' : 'Fullscreen');
    const el = visualizerSection as HTMLElement;
    if (isFs) {
      document.body.classList.add('fullscreen-active');
      visualizerSection.classList.add('is-fullscreen');
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.width = `${window.innerWidth}px`;
      el.style.height = `${window.innerHeight}px`;
      el.style.minWidth = '100%';
      el.style.minHeight = '100%';
      resetBarStyles();
      barHeight = getBarHeight();
      stylePicker.style.position = 'absolute';
      stylePicker.style.bottom = '0';
      stylePicker.style.left = '0';
      stylePicker.style.right = '0';
      stylePicker.style.zIndex = '10';
      canvas.style.position = 'absolute';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.right = '0';
      canvas.style.bottom = `${barHeight}px`;
      canvas.style.width = '100%';
      canvas.style.height = '';
      const applyFullscreenCanvasSize = (): void => {
        const h = barVisible ? getBarHeight() : 0;
        const canvasW = window.innerWidth;
        const canvasH = Math.max(1, window.innerHeight - h);
        canvas.style.width = `${canvasW}px`;
        canvas.style.height = `${canvasH}px`;
        visualizer?.updateSize();
      };
      const fullscreenResizeObserver = new ResizeObserver(() => {
        applyFullscreenCanvasSize();
        fullscreenResizeObserver.disconnect();
      });
      fullscreenResizeObserver.observe(visualizerSection);
      requestAnimationFrame(() => {
        requestAnimationFrame(applyFullscreenCanvasSize);
      });
      // On touch devices, keep bar always visible; on desktop, schedule auto-hide
      if (isTouchDevice) {
        // Keep bar visible, don't schedule hide
        showBar();
      } else {
        scheduleBarHide();
        lastMoveX = Number.NaN;
        lastMoveY = Number.NaN;
        visualizerSection.addEventListener('mousemove', onMouseMove);
        visualizerSection.addEventListener('mouseenter', onMouseEnter);
        visualizerSection.addEventListener('mouseleave', onMouseLeave);
        visualizerSection.addEventListener('click', onInteraction);
      }
      window.addEventListener('blur', onWindowBlur);
    } else {
      document.body.classList.remove('fullscreen-active');
      visualizerSection.classList.remove('is-fullscreen');
      el.style.position = '';
      el.style.inset = '';
      el.style.width = '';
      el.style.height = '';
      el.style.minWidth = '';
      el.style.minHeight = '';
      canvas.style.position = '';
      canvas.style.top = '';
      canvas.style.left = '';
      canvas.style.right = '';
      canvas.style.bottom = '';
      canvas.style.width = '';
      canvas.style.height = '';
      clearHideTimer();
      resetBarStyles();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => visualizer?.updateSize());
      });
      if (!isTouchDevice) {
        visualizerSection.removeEventListener('mousemove', onMouseMove);
        visualizerSection.removeEventListener('mouseenter', onMouseEnter);
        visualizerSection.removeEventListener('mouseleave', onMouseLeave);
        visualizerSection.removeEventListener('click', onInteraction);
      }
      window.removeEventListener('blur', onWindowBlur);
    }
  }

  document.addEventListener('fullscreenchange', onFullscreenChange);

  window.addEventListener('resize', () => {
    if (isFullscreenActive()) {
      (visualizerSection as HTMLElement).style.width = `${window.innerWidth}px`;
      (visualizerSection as HTMLElement).style.height = `${window.innerHeight}px`;
      const h = barVisible ? getBarHeight() : 0;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${Math.max(1, window.innerHeight - h)}px`;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => visualizer?.updateSize());
    });
  });

  btn.addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      (visualizerSection as HTMLElement).requestFullscreen();
    }
  });
}

function setupUpload(): void {
  // Click anywhere on upload area to open file picker
  uploadArea.addEventListener('click', (e) => {
    if (e.target === fileInput) return;
    e.preventDefault();
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!isAudioFile(file)) {
      showStatus('Unsupported file type. Use MP3, WAV, OGG, FLAC, AAC, or M4A.', 'error');
      return;
    }
    loadFile(file);
  });
}

function setupDragDrop(): void {
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    if (!uploadArea.contains(e.relatedTarget as Node)) {
      uploadArea.classList.remove('drag-over');
    }
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (isAudioFile(file)) {
      loadFile(file);
    } else {
      showStatus('Please drop an audio file (MP3, WAV, OGG, etc.)', 'error');
    }
  });
}

/** Allow dropping an audio file anywhere on the window to load or replace the current file. */
function setupGlobalDragDrop(): void {
  function hasFiles(e: DragEvent): boolean {
    return !!(e.dataTransfer?.types?.includes('Files'));
  }

  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    document.body.classList.add('drag-over-window');
  }, true);

  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || !document.body.contains(e.relatedTarget as Node)) {
      document.body.classList.remove('drag-over-window');
    }
  }, true);

  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove('drag-over-window');
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    if (isAudioFile(file)) {
      loadFile(file);
    } else {
      showStatus('Please drop an audio file (MP3, WAV, OGG, etc.)', 'error');
    }
  }, true);
}

function isAudioFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('audio/')) return true;
  if (type === 'video/mp4') return true;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'mp4', 'webm'].includes(ext);
}

function setupLoadNew(): void {
  loadNewBtn.addEventListener('click', () => {
    fileInput.value = '';
    fileInput.click();
  });
}

function setupAlbumArtChangeSong(): void {
  const container = document.getElementById('album-art-container');
  if (!container) return;
  const openFilePicker = (): void => {
    fileInput.value = '';
    fileInput.click();
  };
  container.addEventListener('click', (e) => {
    e.preventDefault();
    openFilePicker();
  });
  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openFilePicker();
    }
  });
}

function setupKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && currentGraph) {
      e.preventDefault();
      const playBtn = document.getElementById('play-btn') as HTMLButtonElement;
      playBtn.click();
    }
  });
}

function applyDecodedBuffer(file: File, audioBuffer: AudioBuffer, metadata: Metadata | null): void {
  currentBuffer = audioBuffer;
  currentFilename = file.name;

  uploadArea.classList.add('hidden');
  controlsPanel.classList.remove('hidden');
  stylePicker.classList.remove('hidden');

  const graph = createAudioGraph(audioBuffer);
  currentGraph = graph;

  (graph as any).__buffer = audioBuffer;

  if (!visualizer) {
    visualizer = new Visualizer(canvas);
  }

  visualizer.setAnalyser(graph.getAnalyser());
  visualizer.setAlbumArtColors([]);
  visualizer.start();

  updateMetadataUI(metadata, null);
  const controlsApi = initControls(graph, visualizer, file.name, metadata, audioBuffer);
  controlsApi.setCurrentAlbumArtUrl(null);
  visualizer.setOnClipping(controlsApi.getClippingCallback());

  showStatus('Ready to play!', 'success');

  if (metadata && (metadata.artist || metadata.title)) {
    fetchAlbumArt(metadata).then((artUrl) => {
      updateMetadataUI(metadata, artUrl, (img) => {
        setAlbumArtColorOptionVisible(true);
        extractColorsFromImage(img).then((colors) => {
          if (colors.length > 0 && visualizer) {
            visualizer.setAlbumArtColors(colors);
          }
        }).catch(() => {});
      });
      if (artUrl) controlsApi.setCurrentAlbumArtUrl(artUrl);
    }).catch(() => {});
  }
}

async function loadFile(file: File): Promise<void> {
  showStatus(`Loading "${file.name}"...`, 'info');

  if (currentGraph) {
    currentGraph.dispose();
    currentGraph = null;
  }

  if (visualizer) {
    visualizer.stop();
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isM4A = ext === 'm4a' || ext === 'mp4' || (file.type || '').includes('mp4');

  if (isM4A) {
    try {
      await loadFileViaMediaElement(file);
      return;
    } catch (err) {
      console.error('M4A media-element load failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes('timeout');
      const isUnsupportedCodec = msg.includes('no supported streams') || msg.includes('DEMUXER_ERROR') || msg.includes('MEDIA_ERR_SRC_NOT_SUPPORTED');

      if (isUnsupportedCodec) {
        try {
          showStatus('Decoding ALAC…', 'info');
          const arrayBuffer = await file.arrayBuffer();
          const [audioBuffer, metadata] = await Promise.all([
            decodeAlacToAudioBuffer(arrayBuffer),
            extractMetadata(file),
          ]);
          applyDecodedBuffer(file, audioBuffer, metadata);
          return;
        } catch (alacErr) {
          console.error('ALAC decode failed:', alacErr);
        }
      }

      const hint = isTimeout
        ? 'File may be large or unsupported (e.g. ALAC). Try MP3 or WAV.'
        : isUnsupportedCodec
          ? 'This M4A may use a codec your browser doesn\'t support. Convert to MP3 or AAC M4A.'
          : 'Try converting to MP3 or WAV.';
      showStatus(`M4A/MP4 could not be loaded. ${hint}`, 'error');
      return;
    }
  }

  try {
    const [audioBuffer, metadata] = await Promise.all([
      decodeAudioFile(file),
      extractMetadata(file),
    ]);
    applyDecodedBuffer(file, audioBuffer, metadata);
  } catch (err) {
    console.error('Failed to load audio:', err);
    showStatus('Failed to load audio. The format may not be supported in this browser.', 'error');
  }
}

async function loadFileViaMediaElement(file: File): Promise<void> {
  const blob =
    file.type && file.type.startsWith('audio/')
      ? file
      : new Blob([await file.arrayBuffer()], { type: 'audio/mp4' });
  const blobUrl = URL.createObjectURL(blob);

  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = blobUrl;

  await new Promise<void>((resolve, reject) => {
    const done = () => resolve();
    const fail = (e?: Event) => {
      const msg = (e && (e.target as HTMLAudioElement)?.error?.message) || 'Media load failed';
      reject(new Error(msg));
    };
    const timeout = setTimeout(() => reject(new Error('Load timeout')), 15000);

    audio.addEventListener('loadedmetadata', () => { clearTimeout(timeout); done(); }, { once: true });
    audio.addEventListener('canplay', () => { clearTimeout(timeout); done(); }, { once: true });
    audio.addEventListener('error', (e) => { clearTimeout(timeout); fail(e); }, { once: true });
    audio.load();
  });

  const metadata = await extractMetadata(file);
  currentBuffer = null;
  currentFilename = file.name;

  uploadArea.classList.add('hidden');
  controlsPanel.classList.remove('hidden');
  stylePicker.classList.remove('hidden');

  const graph = createAudioGraphFromMediaElement(audio, blobUrl);
  currentGraph = graph;
  (graph as any).__buffer = undefined;

  if (!visualizer) {
    visualizer = new Visualizer(canvas);
  }
  visualizer.setAnalyser(graph.getAnalyser());
  visualizer.setAlbumArtColors([]);
  visualizer.start();

  updateMetadataUI(metadata, null);
  const controlsApi = initControls(graph, visualizer, file.name, metadata, null);
  controlsApi.setCurrentAlbumArtUrl(null);
  visualizer.setOnClipping(controlsApi.getClippingCallback());
  showStatus('Ready to play (M4A playback mode - export not available).', 'success');

  if (metadata && (metadata.artist || metadata.title)) {
    fetchAlbumArt(metadata).then((artUrl) => {
      updateMetadataUI(metadata, artUrl, (img) => {
        setAlbumArtColorOptionVisible(true);
        extractColorsFromImage(img).then((colors) => {
          if (colors.length > 0 && visualizer) {
            visualizer.setAlbumArtColors(colors);
          }
        }).catch(() => {});
      });
      if (artUrl) controlsApi.setCurrentAlbumArtUrl(artUrl);
    }).catch(() => {});
  }
}

init();
