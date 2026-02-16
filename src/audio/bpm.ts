/**
 * Simple automatic BPM detection from an AudioBuffer.
 * Uses onset detection (frame energy flux) and interval histogram to estimate tempo.
 */

const FRAME_LEN = 2048;
const HOP_LEN = 1024;
const MIN_BPM = 60;
const MAX_BPM = 200;
const PEAK_THRESHOLD_PERCENTILE = 0.85;
/** Cap at ~60s of audio to avoid huge allocations and main-thread freeze */
const MAX_SAMPLES = Math.floor(60 * 44.1 * 1000);

/**
 * Copy at most maxSamples from buffer into a mono Float32Array. Never allocates more than maxSamples.
 */
function getMonoSamples(buffer: AudioBuffer, maxSamples: number): Float32Array {
  const numCh = buffer.numberOfChannels;
  const length = Math.min(buffer.length, maxSamples);
  if (length <= 0) return new Float32Array(0);

  if (numCh === 1) {
    const ch = buffer.getChannelData(0);
    return ch.length <= length ? ch : ch.slice(0, length);
  }

  const mono = new Float32Array(length);
  const ch0 = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    let sum = ch0[i];
    for (let c = 1; c < numCh; c++) {
      sum += buffer.getChannelData(c)[i];
    }
    mono[i] = sum / numCh;
  }
  return mono;
}

/**
 * Returns estimated BPM or null if detection fails. Uses at most ~60s of audio to avoid crashes on long files.
 */
export function detectBPM(buffer: AudioBuffer): number | null {
  try {
    return detectBPMInner(buffer);
  } catch {
    return null;
  }
}

function detectBPMInner(buffer: AudioBuffer): number | null {
  const sampleRate = buffer.sampleRate;
  const mono = getMonoSamples(buffer, MAX_SAMPLES);
  if (mono.length < FRAME_LEN * 2) return null;

  // Frame-based energy
  const numFrames = Math.floor((mono.length - FRAME_LEN) / HOP_LEN) + 1;
  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_LEN;
    let sum = 0;
    for (let i = 0; i < FRAME_LEN; i++) {
      const s = mono[start + i];
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / FRAME_LEN);
  }

  // Onset strength: positive change from previous frame
  const onset = new Float32Array(numFrames);
  onset[0] = 0;
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1];
    onset[f] = diff > 0 ? diff : 0;
  }

  // Peak picking: local maxima above threshold
  const sorted = Float32Array.from(onset).sort();
  const threshIdx = Math.floor((numFrames - 1) * PEAK_THRESHOLD_PERCENTILE);
  const threshold = sorted[threshIdx];
  const peakFrames: number[] = [];
  for (let f = 2; f < numFrames - 2; f++) {
    const v = onset[f];
    if (v < threshold) continue;
    if (v >= onset[f - 1] && v >= onset[f - 2] && v >= onset[f + 1] && v >= onset[f + 2]) {
      peakFrames.push(f);
    }
  }

  if (peakFrames.length < 4) return null;

  // Convert to time (seconds)
  const frameToTime = HOP_LEN / sampleRate;
  const peakTimes = peakFrames.map((f) => f * frameToTime);

  // Inter-onset intervals (seconds)
  const intervals: number[] = [];
  for (let i = 1; i < peakTimes.length; i++) {
    const dt = peakTimes[i] - peakTimes[i - 1];
    if (dt >= 0.2 && dt <= 2) intervals.push(dt); // 30–300 BPM range
  }
  if (intervals.length < 2) return null;

  // Histogram of intervals (round to bins), then find best BPM
  const binMs = 20;
  const minPeriodMs = 60000 / MAX_BPM;  // 300 ms
  const maxPeriodMs = 60000 / MIN_BPM;  // 1000 ms
  const numBins = Math.ceil((maxPeriodMs - minPeriodMs) / binMs);
  const hist: number[] = new Array(numBins).fill(0);
  for (const dt of intervals) {
    const ms = dt * 1000;
    if (ms < minPeriodMs || ms > maxPeriodMs) continue;
    const bin = Math.floor((ms - minPeriodMs) / binMs);
    if (bin >= 0 && bin < numBins) hist[bin]++;
  }

  let bestBin = 0;
  let bestCount = 0;
  for (let b = 0; b < numBins; b++) {
    if (hist[b] > bestCount) {
      bestCount = hist[b];
      bestBin = b;
    }
  }
  const periodMs = minPeriodMs + (bestBin + 0.5) * binMs;
  let bpm = Math.round(60000 / periodMs);

  // Prefer BPM in common range: if we got half-beat or double-beat, correct
  if (bpm >= 80 && bpm <= 200) {
    // keep as is
  } else if (bpm >= 40 && bpm < 80) {
    bpm *= 2;
  } else if (bpm > 200 && bpm <= 400) {
    bpm = Math.round(bpm / 2);
  }
  bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm));
  return bpm;
}
