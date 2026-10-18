const synth = window.speechSynthesis;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export const speechSupported = { tts: !!synth, stt: !!SR };

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
    rec.interimResults = false;
    rec.onresult = (e) => {
      const r = e.results[0];
      resolve(Array.from(r, (a) => ({ transcript: a.transcript, confidence: a.confidence })));
    };
    rec.onerror = (e) => reject(new Error(e.error === "no-speech" ? "I didn't hear anything." : `Microphone error: ${e.error}`));
    rec.onend = () => resolve([]);
    rec.start();
  });
}
export function stopListening() { try { rec?.abort(); } catch { /* not running */ } }
