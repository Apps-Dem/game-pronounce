const VOWELS = new Set("aeiouy");
const CACHE_KEY = "pronounce.entries.v1";
const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");

export function syllabify(word) {
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

async function fetchIpa(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return "";
    const data = await res.json();
    for (const entry of data) {
      if (entry.phonetic) return entry.phonetic;
      const p = (entry.phonetics || []).find((x) => x.text);
      if (p) return p.text;
    }
  } catch { /* offline or rate limited */ }
  return "";
}

export function parseWordList(text) {
  const seen = new Set();
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[A-Za-z'-]+$/.test(l) && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()));
}

export async function lookup(word) {
  const key = word.toLowerCase();
  if (!cache[key]) {
    cache[key] = { word, syllables: syllabify(word), ipa: await fetchIpa(key) };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }
  return cache[key];
}

// Scan words in small parallel batches, reporting progress.
export async function scanWords(words, onProgress) {
  const out = new Array(words.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < words.length) {
      const i = next++;
      out[i] = await lookup(words[i]);
      onProgress?.(++done, words.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}
