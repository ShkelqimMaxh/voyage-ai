let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;
let endedTimer: ReturnType<typeof setTimeout> | null = null;
let finishPlay: (() => void) | null = null;
const warmed = new Map<string, AudioBuffer>();

export async function warmWebSpeech(url: string): Promise<void> {
  if (typeof window === "undefined" || warmed.has(url)) return;
  const context = audioContext();
  const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "1" } });
  if (!response.ok) return;
  const bytes = await response.arrayBuffer();
  const buffer = await context.decodeAudioData(bytes.slice(0));
  warmed.set(url, buffer);
  if (warmed.size > 4) {
    const first = warmed.keys().next().value;
    if (first) warmed.delete(first);
  }
}

function audioContext(): AudioContext {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!ctx || ctx.state === "closed") {
    ctx = new Ctor();
  }
  return ctx;
}

export async function unlockWebAudio(): Promise<void> {
  if (typeof window === "undefined") return;
  const context = audioContext();
  if (context.state === "suspended") {
    await context.resume().catch(() => undefined);
  }
  const buffer = context.createBuffer(1, 1, context.sampleRate);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.start(0);
}

export function stopWebSpeech(): void {
  if (endedTimer) {
    clearTimeout(endedTimer);
    endedTimer = null;
  }
  const source = current;
  current = null;
  if (source) {
    try {
      source.onended = null;
      source.stop();
    } catch {
      // already stopped
    }
    try {
      source.disconnect();
    } catch {
      // already disconnected
    }
  }
  const done = finishPlay;
  finishPlay = null;
  done?.();
}

export async function playWebSpeech(url: string): Promise<void> {
  await unlockWebAudio();
  const context = audioContext();
  let buffer = warmed.get(url);
  if (!buffer) {
    const response = await fetch(url, { headers: { "ngrok-skip-browser-warning": "1" } });
    if (!response.ok) {
      throw new Error(`speech fetch ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    buffer = await context.decodeAudioData(bytes.slice(0));
    warmed.set(url, buffer);
  }
  stopWebSpeech();
  await new Promise<void>((resolve, reject) => {
    const source = context.createBufferSource();
    current = source;
    source.buffer = buffer;
    source.connect(context.destination);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      finishPlay = null;
      if (endedTimer) {
        clearTimeout(endedTimer);
        endedTimer = null;
      }
      if (current === source) current = null;
      resolve();
    };
    finishPlay = finish;
    source.onended = finish;
    endedTimer = setTimeout(finish, Math.ceil(buffer.duration * 1000) + 400);
    try {
      source.start(0);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
