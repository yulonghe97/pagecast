import { test } from "node:test";
import assert from "node:assert/strict";
import { ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PKG = resolve(dirname(__filename), "..");
const BIN = join(PKG, "bin", "pagecast.mjs");

function run(cwd: string, args: string[]): { status: number; out: string; err: string } {
  const res = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return { status: res.status ?? -1, out: res.stdout, err: res.stderr };
}

/** Build a temp project with one component + manifest + artifact file. */
function scaffoldProject(opts: { artifact: string; bad?: boolean } = { artifact: "" }): string {
  const dir = mkdtempSync(join(tmpdir(), "pagecast-cli-"));
  mkdirSync(join(dir, ".pagecast", "components"), { recursive: true });
  mkdirSync(join(dir, ".pagecast", "manifests"), { recursive: true });
  mkdirSync(join(dir, "reports"), { recursive: true });

  writeFileSync(
    join(dir, ".pagecast", "manifests", "Note.json"),
    JSON.stringify({
      name: "Note",
      import: "Note",
      description: "Small note block.",
      propsSchema: {
        type: "object",
        required: ["body"],
        properties: {
          kind: { type: "string", enum: ["info", "warn"] },
          body: { type: "string" },
        },
        additionalProperties: false,
      },
    })
  );
  writeFileSync(
    join(dir, ".pagecast", "components", "Note.tsx"),
    `export default function Note({ kind = "info", body }: { kind?: string; body: string }) {
       return <aside data-kind={kind} className="t-note">{body}</aside>;
     }`
  );

  if (opts.artifact) {
    writeFileSync(join(dir, "reports", "example.artifact.md"), opts.artifact);
  }
  return dir;
}

test("E-02 list-components prints registered components", () => {
  const dir = scaffoldProject({ artifact: "" });
  const r = run(dir, ["list-components", "--json"]);
  assert.equal(r.status, 0, r.err);
  const names = JSON.parse(r.out).map((c: { name: string }) => c.name);
  assert.deepEqual(names, ["Note"]);
});

test("E-03 validate ok → exit 0", () => {
  const dir = scaffoldProject({
    artifact: `::Note\nkind: info\nbody: hello\n::/Note\n`,
  });
  const r = run(dir, ["validate", "reports/example.artifact.md", "--json"]);
  assert.equal(r.status, 0, r.err);
  assert.ok(JSON.parse(r.out).ok === true);
});

test("E-04 validate bad → exit 1, errors printed", () => {
  const dir = scaffoldProject({
    artifact: `::Note\nkind: critical\nbody: hi\n::/Note\n`,
  });
  const r = run(dir, ["validate", "reports/example.artifact.md", "--json"]);
  assert.equal(r.status, 1);
  const parsed = JSON.parse(r.out);
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.length >= 1);
  assert.match(parsed.errors[0].message, /info|warn/);
});

test("E-05 export writes self-contained HTML", () => {
  const dir = scaffoldProject({
    artifact: `# Hello\n\n::Note\nkind: info\nbody: shipped.\n::/Note\n`,
  });
  const r = run(dir, ["export", "reports/example.artifact.md"]);
  assert.equal(r.status, 0, r.err);
  const html = readFileSync(join(dir, "reports", "example.html"), "utf8");
  assert.match(html, /Hello/);
  assert.match(html, /shipped\./);
  assert.match(html, /data-kind="info"/);
  assert.ok(!/<script\s+src=/.test(html), "no external scripts");
  assert.ok(!/<link\s+[^>]*href=/.test(html), "no external stylesheets");
});

test("E-06 dev starts, responds to health, and exits on SIGTERM", async () => {
  const dir = scaffoldProject({
    artifact: `::Note\nkind: info\nbody: hi\n::/Note\n`,
  });
  const child = spawn(process.execPath, [BIN, "dev", "reports/example.artifact.md", "--port", "0"], {
    cwd: dir,
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  }) as ChildProcessWithoutNullStreams;
  const stdout = child.stdout.setEncoding("utf8");
  const url = await new Promise<string>((resolveUrl, reject) => {
    const timer = setTimeout(() => reject(new Error("dev server did not start")), 5000);
    stdout.on("data", (chunk: string) => {
      const match = chunk.match(/pagecast dev: (http:\/\/localhost:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolveUrl(match[1]!);
      }
    });
    child.on("error", reject);
    child.on("exit", (code: number | null) => {
      if (code !== null && code !== 0) reject(new Error(`dev server exited ${code}`));
    });
  });

  const res = await fetch(`${url}/__health`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "ok");

  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await exited;
});

test("E-07 unknown command exits non-zero with help", () => {
  const dir = mkdtempSync(join(tmpdir(), "pagecast-cli-"));
  const r = run(dir, ["init"]);
  assert.notEqual(r.status, 0);
  assert.match(r.err, /Unknown command: init/);
});
