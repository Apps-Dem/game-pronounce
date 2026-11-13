import { WhistleVoiceProvider } from "@molecule/app-ai-voice-whistle";

const synth = window.speechSynthesis;
const wasmSupported = typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function";
const micSupported = !!navigator.mediaDevices?.getUserMedia;
export const speechSupported = { tts: !!synth, stt: micSupported && wasmSupported };
const debugRequested = new URLSearchParams(location.search).has("debugMic") || localStorage.getItem("pronounce.debugMic") === "1";
const debugSessionId = debugRequested
  ? globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  : null;

export const micDebugEnabled = debugRequested;
export function micDebug(label, details = {}) {
  if (!micDebugEnabled) return;
  console.debug(`[mic] ${label}`, details);
  fetch("/api/debug", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId: debugSessionId, event: label, details }),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) console.warn(`[mic] failed to store diagnostic (HTTP ${response.status})`);
  }).catch((error) => console.warn("[mic] failed to store diagnostic", error));
}

export function getMicDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform || "",
    language: navigator.language || "",
    vendor: navigator.vendor || "",
    maxTouchPoints: navigator.maxTouchPoints || 0,
    screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    deviceMemory: navigator.deviceMemory || null,
    connection: navigator.connection?.effectiveType || null,
  };
}

function speak(text, rate = 0.8) {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    u.onend = resolve;
    u.onerror = resolve;
    synth.speak(u);
  });
}

let token = 0;
export function cancelSpeech() { token++; synth?.cancel(); }

// Speaks each syllable (highlighting it), then the whole word.
export async function sayWord(entry, onSyllable) {
  const my = ++token;
  synth?.cancel();
  const { syllables, word } = entry;
  if (syllables.length > 1) {
    for (let i = 0; i < syllables.length; i++) {
      if (my !== token) return false;
      onSyllable(i);
      await speak(syllables[i].toLowerCase(), 0.7);
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  if (my !== token) return false;
  onSyllable(-1);
  await speak(word, 0.85);
  return my === token;
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");

function similarity(a, b) {
  if (!a || !b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}

// Confidence 0..1: recognizer confidence for an exact match, else string similarity to the target syllables.
export function score(entry, alternatives) {
  const target = norm(entry.syllables.join(""));
  let best = 0;
  for (const { transcript, confidence } of alternatives) {
    const t = norm(transcript);
    const conf = confidence > 0 ? confidence : 0.9;
    const s = t === target ? Math.max(conf, 0.85) : similarity(t, target) * conf * 0.95;
    best = Math.max(best, s);
  }
  return best;
}

const engineUrl = "https://huggingface.co/Cactus-Compute/needle3/resolve/2ae11323dc000f5e70c49f7403efa6af12ba9e67/wasm/needle.js";
const weightsUrl = "https://huggingface.co/Cactus-Compute/whistle/resolve/b358ddadd89b7a713b5aa131f23032d3cca1b251/whistle.cact";
let session = null;

export function startListeningWhistle(handlers) {
  stopListeningWhistle();
  const current = { handlers, finishing: false, provider: null };
  const provider = new WhistleVoiceProvider({
    language: "en",
    engineUrl,
    weightsUrl,
    wordTimestamps: true,
    onModelProgress: (progress) => session?.handlers.onModelProgress?.(progress),
  });
  current.provider = provider;
  session = current;
  provider.startListening({}, {
    onTranscript: ({ transcript, isFinal, confidence }) => {
      if (session !== current || !isFinal) return;
      micDebug("whistle-transcript", { transcript, confidence });
      stopListeningWhistle();
      handlers.onTranscript?.(transcript, confidence);
    },
    onError: (error) => {
      if (session !== current) return;
      micDebug("whistle-error", error);
      stopListeningWhistle();
      handlers.onError?.(error);
    },
    onStateChange: (state) => {
      if (session !== current) return;
      micDebug("whistle-state", { state });
      if (state === "idle" && current.finishing) {
        stopListeningWhistle();
        handlers.onEnd?.();
      } else {
        handlers.onStateChange?.(state);
      }
    },
  });
}

// Finish a spoken attempt, allowing the provider to transcribe its final audio.
export function finishListeningWhistle() {
  if (!session) return;
  session.finishing = true;
  session.provider.stopListening();
}

// Cancel a session when changing words, timing out, or handling its result.
export function stopListeningWhistle() {
  const current = session;
  session = null;
  current?.provider.dispose();
}
