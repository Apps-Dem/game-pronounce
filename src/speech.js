const synth = window.speechSynthesis;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const debugRequested = new URLSearchParams(location.search).has("debugMic") || localStorage.getItem("pronounce.debugMic") === "1";

export const speechSupported = { tts: !!synth, stt: !!SR };
export const micDebugEnabled = debugRequested;
export function micDebug(label, details = {}) {
  if (micDebugEnabled) console.debug(`[mic] ${label}`, details);
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

let rec = null;
export function listen() {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error("Speech recognition is not supported in this browser. Try Chrome, Edge or Safari."));
    rec = new SR();
    rec.lang = "en-US";
    rec.maxAlternatives = 5;
    rec.interimResults = true;
    const startedAt = performance.now();
    let finalTranscript = "";
    let finalConfidence = 0;
    let resultEvents = 0;
    micDebug("start", { language: rec.lang, maxAlternatives: rec.maxAlternatives, device: getMicDeviceInfo() });
    rec.onstart = () => micDebug("onstart");
    rec.onaudiostart = () => micDebug("onaudiostart");
    rec.onsoundstart = () => micDebug("onsoundstart");
    rec.onspeechstart = () => micDebug("onspeechstart");
    rec.onspeechend = () => micDebug("onspeechend");
    rec.onresult = (e) => {
      resultEvents++;
      const r = e.results[e.resultIndex] || e.results[e.results.length - 1];
      const alternatives = Array.from(r, (a) => ({ transcript: a.transcript, confidence: a.confidence }));
      const transcript = alternatives.map((a) => a.transcript).join("");
      const confidence = alternatives[alternatives.length - 1]?.confidence || 0;
      micDebug("result", {
        resultIndex: e.resultIndex,
        isFinal: Boolean(r?.isFinal),
        alternatives,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      if (r?.isFinal) {
        finalTranscript = transcript;
        finalConfidence = confidence;
      }
      // Resolve early so the game remains responsive; onend records the final lifecycle metrics.
      resolve(alternatives);
    };
    rec.onerror = (e) => {
      micDebug("error", { error: e.error, message: e.message || "", elapsedMs: Math.round(performance.now() - startedAt) });
      reject(new Error(e.error === "no-speech" ? "I didn't hear anything." : `Microphone error: ${e.error}`));
    };
    rec.onend = () => {
      micDebug("end", {
        elapsedMs: Math.round(performance.now() - startedAt),
        resultEvents,
        finalTranscript,
        finalConfidence,
      });
      // Resolve with whatever final result we captured if no result event resolved first.
      if (finalTranscript) resolve([{ transcript: finalTranscript, confidence: finalConfidence }]);
      else if (!resultEvents) resolve([]);
    };
    try {
      rec.start();
    } catch (error) {
      micDebug("start-error", { message: error.message });
      reject(error);
    }
  });
}
export function stopListening() {
  micDebug("stop", { active: Boolean(rec) });
  try { rec?.abort(); } catch { /* not running */ }
}
