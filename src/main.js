import { createScene } from "./scene.js";
import packageInfo from "../package.json";
import { parseWordList, scanWords, lookup } from "./lexicon.js";
import { sayWord, cancelSpeech, listen, stopListening, score as scoreSpeech, speechSupported } from "./speech.js";

const $ = (id) => document.getElementById(id);
const fx = createScene($("scene"));

const PASS = 0.8;
const TIME_LIMIT = 60;
const AUTO_START = 30;
let autoId = null, firstPending = false;
const LISTS_KEY = "pronounce.lists.v1";
const SAMPLE = ["pronounce", "apple", "banana", "elephant", "computer", "umbrella", "butterfly", "chocolate", "library", "dinosaur"];

const lists = { Sample: SAMPLE, ...(JSON.parse(localStorage.getItem(LISTS_KEY) || "null") || {}) };
lists.Sample = SAMPLE;
let currentList = Object.keys(lists)[0];
let entries = [];
let idx = -1;
let level = 1;
let score = 0, streak = 0;
let busy = false, solved = false, listening = false, canListen = false;
let timerId = null, timeLeft = 0, started = false;
let scanDone = Promise.resolve(), loadRun = 0;

// Cumulative level rules
const rules = () => ({
  timer: level >= 2,
  slots: level >= 3,
  silent: level >= 4,
  ipaOnly: level >= 5,
});

const saveLists = () => localStorage.setItem(LISTS_KEY, JSON.stringify(lists));

function setFeedback(msg, cls = "") {
  const f = $("feedback");
  f.textContent = msg;
  f.className = "feedback " + cls;
}

function setMic(state, label) {
  const m = $("micBtn");
  m.className = "mic " + (state === "live" ? "live" : state === "ready" ? "ready" : "");
  m.disabled = state === "off";
  $("micLabel").textContent = label;
  m.setAttribute("aria-label", state === "live" ? "Microphone is listening. Press to stop." : "Microphone");
  fx.setMicState(state);
}

function updateStats() {
  $("score").textContent = score;
  $("streak").textContent = streak;
  $("progress").textContent = entries.length ? `Word ${Math.max(idx + 1, 1)} / ${entries.length}` : "";
}

function renderWord(entry, reveal = false) {
  const r = rules();
  const w = $("word");
  w.innerHTML = "";
  if (r.slots && !reveal) {
    if (!r.ipaOnly) for (const ch of entry.word) { const s = document.createElement("span"); s.className = ch === " " ? "gap" : "slot"; s.textContent = "\u00A0"; s.dataset.ch = ch; w.append(s); }
  } else w.textContent = entry.word;
  const sy = $("syllables");
  sy.innerHTML = "";
  if (!r.ipaOnly || reveal) entry.syllables.forEach((s) => { const e = document.createElement("span"); e.className = "syl"; e.textContent = s; sy.append(e); });
  $("ipa").textContent = entry.ipa || "";
  $("ipa").classList.toggle("large", r.ipaOnly);
}

function highlight(i) {
  [...$("syllables").children].forEach((el, n) => el.classList.toggle("on", n === i));
}

function stopTimer() { clearInterval(timerId); timerId = null; }
function startTimer() {
  stopTimer();
  const t = $("timer");
  if (!rules().timer) { t.hidden = true; return; }
  timeLeft = TIME_LIMIT;
  t.hidden = false;
  const draw = () => {
    t.textContent = `⏱ ${timeLeft}s`;
    t.className = "timer " + (timeLeft > 30 ? "green" : timeLeft > 10 ? "yellow" : "red");
  };
  draw();
  timerId = setInterval(() => {
    timeLeft--;
    draw();
    if (timeLeft <= 0) timeUp();
  }, 1000);
}

function timeUp() {
  stopTimer();
  stopListening();
  listening = false;
  cancelSpeech();
  finishWord(false);
  setFeedback("Time's up! Here is the word.", "bad");
}

function finishWord(success) {
  solved = true;
  stopTimer();
  highlight(-1);
  renderWord(entries[idx], true);
  setMic("off", "Done");
  $("sayBtn").disabled = false;
  $("nextBtn").hidden = false;
  $("nextBtn").textContent = idx + 1 >= entries.length ? "Play again ➜" : "Next word ➜";
  beginAutoStart(idx + 1 >= entries.length ? "Play again ➜" : "Next word ➜");
  if (success) { score += 10 + Math.min(streak, 5) * 2; streak++; fx.burst(); } else streak = 0;
  updateStats();
}

async function say() {
  const entry = entries[idx];
  busy = true;
  canListen = false;
  setMic("off", "Word playing");
  $("sayBtn").disabled = true;
  const completed = await sayWord(entry, highlight);
  highlight(-1);
  if (!completed) return;
  busy = false;
  $("sayBtn").disabled = false;
  if (!solved) enableMic();
}

function enableMic() {
  canListen = true;
  setMic("ready", "Tap to speak");
}

async function loadWord() {
  if (!entries[idx]) {
    $("nextBtn").hidden = true;
    $("loader").hidden = false;
    await scanDone;
    $("loader").hidden = true;
  }
  const entry = entries[idx];
  solved = false;
  listening = false;
  $("nextBtn").hidden = true;
  setFeedback("");
  renderWord(entry);
  updateStats();
  const r = rules();
  $("sayBtn").hidden = r.silent;
  if (r.silent) {
    enableMic();
    startTimer();
    setFeedback("Say the word you think this is!");
  } else {
    await say();
    if (!solved) startTimer();
  }
}

async function toggleMic() {
  if (!canListen || busy || solved) return;
  if (listening) { stopListening(); return; }
  listening = true;
  setMic("live", "Tap to stop");
  setFeedback("");
  try {
    const alts = await listen();
    listening = false;
    if (solved) return;
    if (!alts.length) { enableMic(); setFeedback("I didn't catch that. Try again!", "bad"); return; }
    const s = scoreSpeech(entries[idx], alts);
    const pct = Math.round(s * 100);
    if (s >= PASS) { finishWord(true); setFeedback(`Great! ${pct}% confidence ✔ (heard "${alts[0].transcript}")`, "ok"); }
    else { enableMic(); setFeedback(`${pct}% – need ${PASS * 100}%. I heard "${alts[0].transcript}". Try again!`, "bad"); }
  } catch (e) {
    listening = false;
    if (!solved) enableMic();
    setFeedback(e.message, "bad");
  }
}

function nextWord() {
  idx++;
  if (idx >= entries.length) { idx = 0; score = 0; streak = 0; }
  loadWord();
}

function stopAutoStart() { clearInterval(autoId); autoId = null; }
function beginAutoStart(label) {
  stopAutoStart();
  let left = AUTO_START;
  const draw = () => ($("nextBtn").textContent = `${label} (${left}s)`);
  draw();
  autoId = setInterval(() => {
    left--;
    if (left <= 0) { stopAutoStart(); $("nextBtn").click(); } else draw();
  }, 1000);
}

function showWords() {
  const rows = lists[currentList].map((w, i) => {
    const e = entries[i];
    return `<tr><td>${esc(w)}</td><td>${e ? esc(e.syllables.join("·")) : "…"}</td><td>${e ? esc(e.ipa || "") : ""}</td></tr>`;
  });
  $("wordsTitle").textContent = `${currentList} (${rows.length} words)`;
  $("wordsBody").innerHTML = `<table>${rows.join("")}</table>`;
  $("menu").hidden = true;
  $("wordsDlg").showModal();
}

async function downloadWords() {
  const button = $("downloadWordsBtn");
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Preparing list…";
  try {
    await scanDone;
    const content = entries.map((entry) => `${entry.word}: ${entry.syllables.join("·")}`).join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentList.replace(/[^A-Za-z0-9_-]+/g, "-")}-syllables.txt`;
    link.click();
    URL.revokeObjectURL(url);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}
const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function startList(name) {
  stopAutoStart();
  firstPending = false;
  currentList = name;
  cancelSpeech(); stopListening(); stopTimer();
  started = false;
  setMic("off", "Wait…");
  entries = [];
  scanDone = Promise.resolve();
  const words = lists[name];
  const run = ++loadRun;
  $("word").textContent = "";
  $("syllables").textContent = "";
  $("ipa").textContent = "";
  $("timer").hidden = true;
  $("sayBtn").hidden = true;
  $("nextBtn").hidden = true;
  $("loader").hidden = false;
  setFeedback("");
  updateStats();
  const first = await lookup(words[0]);
  if (run !== loadRun) return;
  entries = new Array(words.length);
  entries[0] = first;
  scanDone = scanWords(words.slice(1), (d, n) => ($("uploadStatus").textContent = `Scanning words ${d + 1}/${n + 1}`)).then((rest) => {
    if (run === loadRun) {
      rest.forEach((e, i) => (entries[i + 1] = e));
      $("uploadStatus").textContent = `Loaded "${name}" (${words.length} words)`;
    }
  });
  $("uploadStatus").textContent = `Loaded "${name}" (${words.length} words)`;
  $("loader").hidden = true;
  idx = 0;
  firstPending = true;
  solved = false;
  renderWord(entries[0]);
  $("sayBtn").hidden = false;
  $("sayBtn").disabled = true;
  $("nextBtn").hidden = false;
  beginAutoStart("Start now ➜");
  setFeedback(speechSupported.stt ? "Get ready! The word will be said when the countdown ends." : "Speech recognition isn't supported here. Use Chrome, Edge or Safari.", speechSupported.stt ? "" : "bad");
  updateStats();
}

function fillListSelect() {
  const sel = $("listSel");
  sel.innerHTML = "";
  Object.keys(lists).forEach((n) => sel.add(new Option(`${n} (${lists[n].length})`, n)));
  sel.value = currentList;
}

// UI wiring
$("menuBtn").onclick = () => {
  const m = $("menu");
  m.hidden = !m.hidden;
  $("menuBtn").setAttribute("aria-expanded", String(!m.hidden));
};
$("levelSel").onchange = (e) => { level = +e.target.value; if (entries.length) startList(currentList); };
$("listSel").onchange = (e) => startList(e.target.value);
$("uploadBtn").onclick = () => $("fileInput").click();
$("deleteListBtn").onclick = () => {
  if (Object.keys(lists).length < 2) { $("uploadStatus").textContent = "Keep at least one list."; return; }
  delete lists[currentList];
  saveLists();
  currentList = Object.keys(lists)[0];
  fillListSelect();
  startList(currentList);
};
$("fileInput").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const words = parseWordList(await file.text());
  if (!words.length) { $("uploadStatus").textContent = "No valid words found (one word per line)."; return; }
  let name = file.name.replace(/\.[^.]+$/, "");
  lists[name] = words;
  saveLists();
  currentList = name;
  fillListSelect();
  startList(name);
};
$("sayBtn").onclick = () => { if (!busy && !listening && idx >= 0) { stopListening(); say(); } };
$("micBtn").onclick = toggleMic;
$("nextBtn").onclick = () => {
  stopAutoStart();
  started = true;
  if (firstPending) { firstPending = false; loadWord(); } else nextWord();
};
$("viewWordsBtn").onclick = showWords;
$("downloadWordsBtn").onclick = downloadWords;
$("wordsClose").onclick = () => $("wordsDlg").close();

$("versionLabel").textContent = `v${packageInfo.version}`;
fillListSelect();
startList(currentList);
