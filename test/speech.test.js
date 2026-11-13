import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { WhistleVoiceProvider } from "@molecule/app-ai-voice-whistle";

globalThis.window = { speechSynthesis: null };
Object.defineProperty(globalThis, "navigator", { value: { mediaDevices: { getUserMedia() {} } }, configurable: true });
globalThis.location = { search: "" };
globalThis.localStorage = { getItem: () => null };

const speech = await import("../src/speech.js");
const original = {
  startListening: WhistleVoiceProvider.prototype.startListening,
  stopListening: WhistleVoiceProvider.prototype.stopListening,
  dispose: WhistleVoiceProvider.prototype.dispose,
};
let instances;

before(() => {
  WhistleVoiceProvider.prototype.startListening = function (_options, handlers) {
    this.testHandlers = handlers;
    this.listening = true;
    instances.push(this);
    handlers.onStateChange("processing");
  };
  WhistleVoiceProvider.prototype.stopListening = function () {
    this.listening = false;
    this.testHandlers.onStateChange(this.testHasAudio ? "processing" : "idle");
  };
  WhistleVoiceProvider.prototype.dispose = function () {
    this.disposed = true;
    this.listening = false;
  };
});

beforeEach(() => {
  speech.stopListeningWhistle();
  instances = [];
});

after(() => {
  speech.stopListeningWhistle();
  Object.assign(WhistleVoiceProvider.prototype, original);
});

test("finishing an attempt accepts its final transcript and disposes capture", () => {
  const events = [];
  speech.startListeningWhistle({
    onTranscript: (text, confidence) => events.push([text, confidence]),
    onEnd: () => events.push("empty"),
  });
  const provider = instances[0];
  provider.testHasAudio = true;
  speech.finishListeningWhistle();
  assert.equal(provider.disposed, false);
  provider.testHandlers.onTranscript({ transcript: "apple", confidence: 0.9, isFinal: true });
  provider.testHandlers.onStateChange("idle");
  assert.deepEqual(events, [["apple", 0.9]]);
  assert.equal(provider.disposed, true);
});

test("empty attempts end cleanly", () => {
  let ended = 0;
  speech.startListeningWhistle({ onEnd: () => ended++ });
  speech.finishListeningWhistle();
  assert.equal(ended, 1);
  assert.equal(instances[0].disposed, true);
});

test("cancelled attempts cannot deliver transcripts or errors to a later word", () => {
  const events = [];
  speech.startListeningWhistle({ onTranscript: () => events.push("old"), onError: () => events.push("old error") });
  const old = instances[0];
  speech.stopListeningWhistle();
  speech.startListeningWhistle({ onTranscript: (text) => events.push(text) });
  old.testHandlers.onTranscript({ transcript: "old", isFinal: true });
  old.testHandlers.onError({ message: "old error" });
  instances[1].testHandlers.onTranscript({ transcript: "new", confidence: 1, isFinal: true });
  assert.deepEqual(events, ["new"]);
  assert.equal(old.disposed, true);
});

test("model progress follows the active session and failures release it", () => {
  const progress = [];
  const errors = [];
  speech.startListeningWhistle({});
  const old = instances[0];
  speech.stopListeningWhistle();
  speech.startListeningWhistle({ onModelProgress: (event) => progress.push(event.progress), onError: (error) => errors.push(error.message) });
  const current = instances[1];
  old.config.onModelProgress({ status: "downloading", progress: 50 });
  current.testHandlers.onError({ message: "download failed" });
  old.config.onModelProgress({ status: "downloading", progress: 60 });
  assert.deepEqual(progress, [50]);
  assert.deepEqual(errors, ["download failed"]);
  assert.equal(current.disposed, true);
});

test("scoring retains the existing exact-match threshold", () => {
  const entry = { syllables: ["ap", "ple"] };
  assert.ok(speech.score(entry, [{ transcript: "Apple.", confidence: 0.2 }]) >= 0.8);
  assert.ok(speech.score(entry, [{ transcript: "banana", confidence: 1 }]) < 0.8);
});
