/**
 * Decode ALAC (Apple Lossless) M4A via Aurora.js + alac.js to Web Audio API AudioBuffer.
 * Used when the browser's native pipeline rejects M4A (e.g. "no supported streams" for ALAC).
 */
import { getAudioContext } from './decode';

interface AuroraFormat {
  channels: number;
  sampleRate: number;
}

interface AuroraAsset {
  on(ev: string, fn: (...args: unknown[]) => void): void;
  once(ev: string, fn: (...args: unknown[]) => void): void;
  decodeToBuffer(cb: (buf: Float32Array) => void): void;
}

type AVModule = { Asset: { fromBuffer: (buf: ArrayBuffer) => AuroraAsset } };

let avModule: AVModule | null = null;

async function getAV(): Promise<AVModule> {
  if (avModule) return avModule;
  const av = await import('av');
  await import('alac');
  avModule = av.default as AVModule;
  return avModule;
}

export async function decodeAlacToAudioBuffer(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
  const AV = await getAV();
  const asset = AV.Asset.fromBuffer(arrayBuffer);

  return new Promise((resolve, reject) => {
    let format: AuroraFormat | null = null;

    asset.on('error', (err: unknown) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });

    asset.once('format', (f: unknown) => {
      format = f as AuroraFormat;
    });

    asset.decodeToBuffer((interleaved: Float32Array) => {
      if (!format) {
        reject(new Error('No format from ALAC decoder'));
        return;
      }
      const numChannels = format.channels;
      const sampleRate = format.sampleRate;
      const numFrames = interleaved.length / numChannels;
      const ctx = getAudioContext();
      const buffer = ctx.createBuffer(numChannels, numFrames, sampleRate);
      for (let c = 0; c < numChannels; c++) {
        const ch = buffer.getChannelData(c);
        for (let i = 0; i < numFrames; i++) ch[i] = interleaved[i * numChannels + c];
      }
      resolve(buffer);
    });
  });
}
