const VOWELS = new Set("aeiouy");
const CACHE_KEY = "pronounce.entries.v2";
const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

export function syllabify(word) {
  if (word.includes(" ")) return word.split(" ").flatMap(syllabify);
  const w = word.toLowerCase();
  const isV = (i) => VOWELS.has(w[i]) && !(w[i] === "y" && i === 0);
  const groups = [];
  let i = 0;
  while (i < w.length) {
    const v = isV(i);
    let j = i;
    while (j < w.length && isV(j) === v) j++;
    groups.push({ v, s: i, e: j });
    i = j;
  }
  let nuclei = groups.filter((g) => g.v);
  // Silent trailing "e" after a consonant (but not "-le").
  if (nuclei.length > 1) {
    const last = nuclei[nuclei.length - 1];
    const prevCons = groups[groups.indexOf(last) - 1];
    if (last.e === w.length && w.slice(last.s, last.e) === "e" && prevCons && !/[^aeiouy]le$/.test(w)) {
      nuclei = nuclei.slice(0, -1);
    }
  }
  if (nuclei.length <= 1) return [word];
  const cuts = [];
  for (let n = 0; n < nuclei.length - 1; n++) {
    const a = nuclei[n];
    const b = nuclei[n + 1];
    const cons = w.slice(a.e, b.s);
    let cut;
    if (cons.length === 0) cut = a.e;
    else if (cons.length === 1) cut = a.e;
    else if (cons.length === 2 && /^(th|sh|ch|ph|wh)$/.test(cons)) cut = a.e;
    else cut = a.e + 1;
    cuts.push(cut);
  }
  const out = [];
  let prev = 0;
  for (const c of cuts) { out.push(word.slice(prev, c)); prev = c; }
  out.push(word.slice(prev));
  return out.filter(Boolean);
}

const ARPA = {
  AA: "ɑ", AE: "æ", AH: "ʌ", AO: "ɔ", AW: "aʊ", AY: "aɪ", EH: "ɛ", ER: "ɝ", EY: "eɪ", IH: "ɪ", IY: "i", OW: "oʊ", OY: "ɔɪ", UH: "ʊ", UW: "u",
  B: "b", CH: "tʃ", D: "d", DH: "ð", F: "f", G: "ɡ", HH: "h", JH: "dʒ", K: "k", L: "l", M: "m", N: "n", NG: "ŋ", P: "p", R: "ɹ", S: "s", SH: "ʃ", T: "t", TH: "θ", V: "v", W: "w", Y: "j", Z: "z", ZH: "ʒ",
};

function arpabetToIpa(str) {
  let out = "";
  let onset = "";
  for (const tok of str.trim().split(/\s+/)) {
    const m = tok.match(/^([A-Z]+)([0-2])?$/);
    if (!m || !ARPA[m[1]]) continue;
    if (m[2] === undefined) { onset += ARPA[m[1]]; continue; }
    let sym = ARPA[m[1]];
    if (m[1] === "AH" && m[2] === "0") sym = "ə";
    if (m[1] === "ER" && m[2] === "0") sym = "ɚ";
    const mark = m[2] === "1" ? "ˈ" : m[2] === "2" ? "ˌ" : "";
    out += mark + onset + sym;
    onset = "";
  }
  return `/${out}${onset}/`;
}

async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchIpa(word) {
  const q = encodeURIComponent(word);
  const dict = await getJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${q}`);
  for (const entry of dict || []) {
    if (entry.phonetic) return entry.phonetic;
    const p = (entry.phonetics || []).find((x) => x.text);
    if (p) return p.text;
  }
  // Fallback: CMU pronunciation via Datamuse, converted to IPA.
  const dm = await getJson(`https://api.datamuse.com/words?sp=${q}&md=r&max=1`);
  const tag = dm?.[0]?.word?.toLowerCase() === word.toLowerCase() && dm[0].tags?.find((t) => t.startsWith("pron:"));
  return tag ? arpabetToIpa(tag.slice(5)) : "";
}

export function parseWordList(text) {
  const seen = new Set();
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => /^[A-Za-z'-]+( [A-Za-z'-]+)*$/.test(l) && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()));
}

const FIXIE = "https://fixie.tools/api/syllables";

// Convert a Fixie result to an entry, keeping the word's original casing.
function fromFixie(word, r) {
  if (!r?.syllables?.length) return null;
  let syllables = r.syllables;
  if (syllables.join("").toLowerCase() !== word.toLowerCase()) syllables = syllabify(word);
  else { let p = 0; syllables = syllables.map((s) => { const o = word.slice(p, p + s.length); p += s.length; return o; }); }
  return { word, syllables, ipa: r.ipa || "" };
}

function remember(entry) {
  cache[entry.word.toLowerCase()] = entry;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export async function lookup(word) {
  const key = word.toLowerCase();
  if (cache[key]) return cache[key];
  const entry = fromFixie(word, await getJson(`${FIXIE}?word=${encodeURIComponent(key)}`)) || { word, syllables: syllabify(word), ipa: "" };
  if (!entry.ipa) entry.ipa = await fetchIpa(key);
  if (entry.ipa) remember(entry); // entries without IPA aren't cached so they are retried
  return entry;
}

// Fill in missing IPA in place after the scan, so the game never waits on slow lookups.
async function enrichIpa(entries) {
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const e = entries[next++];
      e.ipa = await fetchIpa(e.word.toLowerCase()).catch(() => "");
      if (e.ipa) remember(e);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
}

// Batch-resolve uncached words via Fixie (100 per request), then fall back per word.
export async function scanWords(words, onProgress) {
  const out = new Array(words.length);
  let done = 0;
  const report = () => onProgress?.(++done, words.length);
  const missing = [];
  const noIpa = [];
  words.forEach((w, i) => {
    const hit = cache[w.toLowerCase()];
    if (hit) { out[i] = hit; report(); } else missing.push(i);
  });
  for (let s = 0; s < missing.length; s += 100) {
    const chunk = missing.slice(s, s + 100);
    let res = null;
    try {
      const r = await fetch(`${FIXIE}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: chunk.map((i) => words[i].toLowerCase()), lang: "en" }),
      });
      res = r.ok ? (await r.json()).results : null;
    } catch { /* fall back below */ }
    const byWord = new Map((res || []).map((x) => [x.word.toLowerCase(), x]));
    for (const i of chunk) {
      const fx = fromFixie(words[i], byWord.get(words[i].toLowerCase()));
      if (fx) { if (fx.ipa) remember(fx); else noIpa.push(fx); out[i] = fx; report(); }
    }
  }
  // Anything the batch didn't resolve uses the single-word fallbacks.
  const rest = words.map((_, i) => i).filter((i) => !out[i]);
  let next = 0;
  const worker = async () => {
    while (next < rest.length) {
      const i = rest[next++];
      out[i] = await lookup(words[i]);
      report();
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  enrichIpa(noIpa);
  return out;
}
