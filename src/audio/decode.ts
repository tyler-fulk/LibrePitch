let audioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

export async function ensureContextResumed(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const ctx = getAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  const copy = arrayBuffer.slice(0);
  return ctx.decodeAudioData(copy);
}
