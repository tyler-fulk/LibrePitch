import type { AudioGraphState } from './graph';
import { createDelayReverb, createOriginalReverb } from './graph';
import type { Metadata } from '../metadata/extract';
import MP3Tag from 'mp3tag.js';

export type RenderProgressCallback = (phase: string, percent?: number) => void;

export async function renderAndDownload(
  buffer: AudioBuffer,
  state: AudioGraphState,
  filename: string,
  onProgress?: RenderProgressCallback
): Promise<Blob> {
  const rendered = await renderOffline(buffer, state, onProgress);
  onProgress?.('Encoding WAV...', undefined);
  return encodeWAV(rendered, onProgress);
}

export interface AlbumArtForExport {
  mime: string;
  data: ArrayBuffer;
}

export async function renderAndDownloadMp3(
  buffer: AudioBuffer,
  state: AudioGraphState,
  filename: string,
  metadata: Metadata | null,
  albumArt?: AlbumArtForExport | null,
  onProgress?: RenderProgressCallback
): Promise<Blob> {
  const rendered = await renderOffline(buffer, state, onProgress);
  onProgress?.('Encoding MP3...', undefined);
  const mp3Buffer = await encodeMp3(rendered, onProgress);
  const withTags = writeMp3Tags(mp3Buffer, metadata, albumArt ?? null);
  return new Blob([withTags], { type: 'audio/mpeg' });
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const RENDER_CHUNK_SECONDS = 60;

async function yieldToMain(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

function buildEffectGraph(
  offline: OfflineAudioContext,
  buffer: AudioBuffer,
  state: AudioGraphState
): { source: AudioBufferSourceNode; gain: GainNode } {
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = state.speed;
  source.detune.value = state.detune;

  const bass = offline.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 320;
  bass.gain.value = state.bass;

  const treble = offline.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 3200;
  treble.gain.value = state.treble;

  const lowpass = offline.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.Q.value = 0.7;
  const lp = (state.lowpass ?? 0) / 100;
  lowpass.frequency.value = lp <= 0 ? 20000 : 20000 * Math.pow(2, -6.64 * lp);

  const highpass = offline.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.Q.value = 0.7;
  const hp = (state.highpass ?? 0) / 100;
  highpass.frequency.value = hp <= 0 ? 20 : 20 * Math.pow(2, 7.64 * hp);

  const dryGain = offline.createGain();
  const wetGain = offline.createGain();
  const reverbType = state.reverbType ?? 'delay';
  if (reverbType === 'delay') {
    dryGain.gain.value = 1;
    wetGain.gain.value = (state.reverb / 100) * 0.45;
  } else {
    const w = (state.reverb / 100) * 0.5;
    dryGain.gain.value = 1 - w;
    wetGain.gain.value = w;
  }

  const delayReverb = createDelayReverb(offline);
  const originalReverb = createOriginalReverb(offline);
  const reverb = reverbType === 'delay' ? delayReverb : originalReverb;

  const gain = offline.createGain();
  gain.gain.value = state.volume;

  source.connect(bass);
  bass.connect(treble);
  treble.connect(lowpass);
  lowpass.connect(highpass);
  highpass.connect(dryGain);
  highpass.connect(delayReverb.send);
  highpass.connect(originalReverb.send);
  reverb.bus.connect(wetGain);
  dryGain.connect(gain);
  wetGain.connect(gain);
  gain.connect(offline.destination);

  return { source, gain };
}

async function renderOffline(
  buffer: AudioBuffer,
  state: AudioGraphState,
  onProgress?: RenderProgressCallback
): Promise<AudioBuffer> {
  try {
    const effectiveRate = state.speed * Math.pow(2, state.detune / 1200);
    const duration = effectiveRate > 0 ? buffer.duration / effectiveRate : buffer.duration;
    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;

    const chunkStarts: number[] = [];
    for (let t = 0; t < duration; t += RENDER_CHUNK_SECONDS) {
      chunkStarts.push(t);
    }
    if (chunkStarts.length === 0) chunkStarts.push(0);

    const renderedChunks: AudioBuffer[] = [];

    for (let i = 0; i < chunkStarts.length; i++) {
      const outputStart = chunkStarts[i];
      const outputEnd = Math.min(outputStart + RENDER_CHUNK_SECONDS, duration);
      const chunkDuration = outputEnd - outputStart;
      const sourceOffset = outputStart * effectiveRate;
      const sourceDuration = chunkDuration * effectiveRate;

      const chunkFrames = Math.ceil(chunkDuration * sampleRate);
      const offline = new OfflineAudioContext(channels, chunkFrames, sampleRate);

      const { source } = buildEffectGraph(offline, buffer, state);
      source.start(0, sourceOffset, sourceDuration);

      const chunk = await offline.startRendering();
      renderedChunks.push(chunk);

      const percent = Math.round(((i + 1) / chunkStarts.length) * 100);
      onProgress?.('Rendering...', percent);
      await yieldToMain();
    }

    return concatenateAudioBuffers(renderedChunks, channels, sampleRate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('RangeError') || msg.includes('memory') || msg.includes('allocate')) {
      throw new Error('Render failed: file may be too long or system ran out of memory. Try a shorter clip or fewer effects.');
    }
    throw err;
  }
}

function concatenateAudioBuffers(
  buffers: AudioBuffer[],
  channels: number,
  sampleRate: number
): AudioBuffer {
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const result = new AudioContext().createBuffer(channels, totalLength, sampleRate);

  for (let ch = 0; ch < channels; ch++) {
    const out = result.getChannelData(ch);
    let offset = 0;
    for (const buf of buffers) {
      out.set(buf.getChannelData(ch), offset);
      offset += buf.length;
    }
  }
  return result;
}

const WAV_BLOCK_SAMPLES = 100_000;

async function encodeWAV(
  buffer: AudioBuffer,
  onProgress?: RenderProgressCallback
): Promise<Blob> {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const totalSamples = buffer.length;
  const dataSize = totalSamples * blockAlign;
  const headerSize = 44;
  const fileSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(view, 8, 'WAVE');

  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    channelData.push(buffer.getChannelData(ch));
  }

  let offset = 44;
  let processed = 0;
  for (let i = 0; i < totalSamples; i += WAV_BLOCK_SAMPLES) {
    const blockEnd = Math.min(i + WAV_BLOCK_SAMPLES, totalSamples);
    for (let j = i; j < blockEnd; j++) {
      for (let ch = 0; ch < channels; ch++) {
        let sample = channelData[ch][j];
        sample = Math.max(-1, Math.min(1, sample));
        const int16 =
          sample < 0
            ? Math.max(-32768, Math.floor(sample * 32768))
            : Math.min(32767, Math.floor(sample * 32767));
        view.setInt16(offset, int16, true);
        offset += 2;
      }
    }
    processed = blockEnd;
    if (processed < totalSamples) {
      onProgress?.('Encoding WAV...', Math.round((processed / totalSamples) * 100));
      await yieldToMain();
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

const MP3_CHUNK = 1152;
const MP3_YIELD_EVERY_CHUNKS = 500;

function floatToInt16(float32: Float32Array): Int16Array {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? Math.max(-32768, Math.floor(s * 32768)) : Math.min(32767, Math.floor(s * 32767));
  }
  return int16;
}

async function encodeMp3(
  buffer: AudioBuffer,
  onProgress?: RenderProgressCallback
): Promise<ArrayBuffer> {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels > 1 ? floatToInt16(buffer.getChannelData(1)) : left;

  const lamejs = (window as unknown as {
    lamejs?: {
      Mp3Encoder: new (ch: number, sr: number, kbps: number) => {
        encodeBuffer: (l: Int16Array, r?: Int16Array) => Int8Array;
        flush: () => Int8Array;
      };
    };
  }).lamejs;
  if (!lamejs?.Mp3Encoder) {
    throw new Error('MP3 export requires lamejs. Reload the page and try again.');
  }

  try {
    const encoder = new lamejs.Mp3Encoder(channels, sampleRate, 192);
    const chunks: Int8Array[] = [];
    const totalChunks = Math.ceil(left.length / MP3_CHUNK);
    let chunkCount = 0;

    for (let i = 0; i < left.length; i += MP3_CHUNK) {
      const leftChunk = left.subarray(i, i + MP3_CHUNK);
      const rightChunk = right.subarray(i, i + MP3_CHUNK);
      const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (mp3buf.length > 0) chunks.push(mp3buf);
      chunkCount++;
      if (chunkCount % MP3_YIELD_EVERY_CHUNKS === 0) {
        onProgress?.('Encoding MP3...', Math.round((chunkCount / totalChunks) * 100));
        await yieldToMain();
      }
    }
    const flush = encoder.flush();
    if (flush.length > 0) chunks.push(flush);

    const total = chunks.reduce((acc, c) => acc + c.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out.buffer;
  } catch (err) {
    throw new Error('MP3 encoding failed. The file may be too long. Try exporting as WAV instead.');
  }
}

const ID3V1_MAX_BYTES = 30;
const ID3V1_YEAR_MAX_BYTES = 4;

/** Truncate string so its UTF-8 encoded length does not exceed maxBytes (ID3v1 validation uses byte length) */
function truncateForId3v1(s: string, maxBytes = ID3V1_MAX_BYTES): string {
  const enc = new TextEncoder();
  while (s.length > 0 && enc.encode(s).length > maxBytes) s = s.slice(0, -1);
  return s;
}

function writeMp3Tags(
  mp3Buffer: ArrayBuffer,
  metadata: Metadata | null,
  albumArt: AlbumArtForExport | null
): ArrayBuffer {
  const hasText =
    metadata &&
    (metadata.title?.trim() || metadata.artist?.trim() || metadata.album?.trim() || metadata.year?.trim());
  const title = metadata?.title?.trim() ?? '';
  const artist = metadata?.artist?.trim() ?? '';
  const album = metadata?.album?.trim() ?? '';
  const year = metadata?.year?.trim() ?? '';

  const v2: Record<string, unknown> = {
    TIT2: title,
    TPE1: artist,
    TALB: album,
    TDRC: year,
  };

  if (albumArt && albumArt.data.byteLength > 0) {
    const mime = albumArt.mime.toLowerCase().includes('png') ? 'image/png' : 'image/jpeg';
    v2.APIC = [
      {
        format: mime,
        type: 3,
        description: '',
        data: Array.from(new Uint8Array(albumArt.data)),
      },
    ];
  }

  /* ID3v1 limits: title/artist/album 30 bytes, year 4 bytes (validation uses encoded byte length) */
  const tags = {
    v1: {
      title: truncateForId3v1(title),
      artist: truncateForId3v1(artist),
      album: truncateForId3v1(album),
      year: truncateForId3v1(year, ID3V1_YEAR_MAX_BYTES),
      comment: '',
      track: '',
      genre: '',
    },
    v2,
  };

  if (!hasText && !albumArt) return mp3Buffer;

  return MP3Tag.writeBuffer(mp3Buffer, tags as Parameters<typeof MP3Tag.writeBuffer>[1], {
    id3v1: { include: true },
    id3v2: { include: true, version: 4 },
  }) as ArrayBuffer;
}
