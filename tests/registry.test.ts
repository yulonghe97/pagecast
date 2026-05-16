import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRegistry, listComponents } from "../src/core/registry.js";

function scratchProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "pagecast-reg-"));
  const art = join(dir, ".pagecast");
  mkdirSync(join(art, "components"), { recursive: true });
  mkdirSync(join(art, "manifests"), { recursive: true });
  return dir;
}

test("R-01 loads JSON manifests", () => {
  const dir = scratchProject();
  writeFileSync(
    join(dir, ".pagecast", "manifests", "Foo.json"),
    JSON.stringify({ name: "Foo", import: "Foo" })
  );
  writeFileSync(
    join(dir, ".pagecast", "manifests", "Bar.json"),
    JSON.stringify({ name: "Bar", import: "Bar" })
  );
  const reg = loadRegistry({ cwd: dir });
  assert.equal(reg.manifests.size, 2);
  assert.deepEqual(listComponents(reg).map((c) => c.name), ["Bar", "Foo"]);
});

test("R-02 missing 'name' field fails to load", () => {
  const dir = scratchProject();
  writeFileSync(
    join(dir, ".pagecast", "manifests", "Bad.json"),
    JSON.stringify({ import: "X" })
  );
  assert.throws(() => loadRegistry({ cwd: dir }), /missing required field/i);
});

test("R-03 manifest JSON round-trips byte-identical", () => {
  const dir = scratchProject();
  const file = join(dir, ".pagecast", "manifests", "Foo.json");
  const text = JSON.stringify({ name: "Foo", import: "Foo", tags: ["x"] }, null, 2);
  writeFileSync(file, text);
  loadRegistry({ cwd: dir });
  assert.equal(readFileSync(file, "utf8"), text);
});

test("R-04 list returns components sorted by name", () => {
  const dir = scratchProject();
  writeFileSync(join(dir, ".pagecast", "manifests", "Zoo.json"), JSON.stringify({ name: "Zoo", import: "Zoo" }));
  writeFileSync(join(dir, ".pagecast", "manifests", "Alpha.json"), JSON.stringify({ name: "Alpha", import: "Alpha" }));
  const reg = loadRegistry({ cwd: dir });
  assert.deepEqual(listComponents(reg).map((c) => c.name), ["Alpha", "Zoo"]);
});
