import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("preview migrations target the preview database, not production", () => {
  const worker = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const migrations = JSON.parse(readFileSync(new URL("../wrangler.preview-migrations.jsonc", import.meta.url), "utf8"));
  const previews = worker.previews.d1_databases.filter(({ binding }) => binding === "DB");
  const production = worker.d1_databases.filter(({ binding }) => binding === "DB");
  const targets = migrations.d1_databases.filter(({ binding }) => binding === "PREVIEW_DB");

  assert.equal(previews.length, 1);
  assert.equal(production.length, 1);
  assert.equal(targets.length, 1);
  assert.ok(previews[0].database_id);
  assert.ok(previews[0].database_name);
  assert.equal(targets[0].database_id, previews[0].database_id);
  assert.equal(targets[0].database_name, previews[0].database_name);
  assert.notEqual(previews[0].database_id, production[0].database_id);
  assert.notEqual(previews[0].database_name, production[0].database_name);
  assert.equal(targets[0].migrations_dir, "migrations");
});
