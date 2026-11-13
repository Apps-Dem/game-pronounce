import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

test("the removed server transcription endpoint returns 404", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/transcribe", { method: "POST" }), {});
  assert.equal(response.status, 404);
});

test("speech results can still be recorded", async () => {
  let values;
  const env = {
    DB: {
      prepare: () => ({
        bind: (...args) => {
          values = args;
          return { run: async () => ({}) };
        },
      }),
    },
  };
  const request = new Request("https://example.test/api/results", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetWord: "apple", targetSyllables: ["ap", "ple"], transcript: "Apple.", confidence: 0.9, score: 0.9, passed: true }),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 201);
  assert.deepEqual(values.slice(0, 6), ["apple", "ap·ple", "Apple.", 0.9, 0.9, 1]);
});
