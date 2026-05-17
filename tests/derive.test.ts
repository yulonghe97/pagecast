import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { parseArtifact } from "../src/core/parser.js";
import { loadRegistry } from "../src/core/registry.js";
import { applyDerivations } from "../src/core/derive.js";

/**
 * Build a minimal scratch project on disk with a .pagecast/ registry,
 * a demo .artifact.md, and a host artifact that uses both. Returns
 * absolute paths the caller can plug into the pipeline.
 */
function fixture(opts: {
  hostBody: string;
  demoBody?: string;
  componentBody?: string;
  /** Full manifest JSON for the `Host` component. */
  hostManifest: Record<string, unknown>;
  /** Optional extra manifests keyed by component name. */
  extraManifests?: Record<string, Record<string, unknown>>;
}): { hostPath: string; demoPath: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "pagecast-derive-"));
  mkdirSync(join(root, ".pagecast", "components"), { recursive: true });
  mkdirSync(join(root, ".pagecast", "manifests"), { recursive: true });
  mkdirSync(join(root, ".pagecast", "demos"), { recursive: true });

  writeFileSync(
    join(root, ".pagecast", "manifests", "Host.json"),
    JSON.stringify(opts.hostManifest, null, 2)
  );
  for (const [name, body] of Object.entries(opts.extraManifests ?? {})) {
    writeFileSync(
      join(root, ".pagecast", "manifests", `${name}.json`),
      JSON.stringify(body, null, 2)
    );
  }
  if (opts.componentBody !== undefined) {
    writeFileSync(
      join(root, ".pagecast", "components", "Target.tsx"),
      opts.componentBody
    );
  }
  const demoPath = join(root, ".pagecast", "demos", "demo.artifact.md");
  if (opts.demoBody !== undefined) {
    writeFileSync(demoPath, opts.demoBody);
  }

  const hostPath = join(root, "host.artifact.md");
  writeFileSync(hostPath, opts.hostBody);

  return { hostPath, demoPath, root };
}

test("D-01 file resolver reads text from path relative to the artifact", () => {
  const { hostPath, root } = fixture({
    demoBody: "hello from demo",
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody: `::Host\ndemo: ./.pagecast/demos/demo.artifact.md\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.deepEqual(errors, []);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    assert.equal(c.props.content, "hello from demo");
  } else {
    assert.fail("expected component block");
  }
});

test("D-02 componentSource resolver reads a registered .tsx file", () => {
  const { hostPath, root } = fixture({
    componentBody: "// the real Target.tsx body\n",
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { code: { from: "componentSource", via: "show" } },
    },
    extraManifests: {
      Target: { name: "Target", import: "./components/Target.tsx" },
    },
    hostBody: `::Host\nshow: Target\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.deepEqual(errors, []);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    assert.equal(c.props.code, "// the real Target.tsx body\n");
  }
});

test("D-03 componentManifest resolver serializes the manifest JSON", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { schema: { from: "componentManifest", via: "show" } },
    },
    extraManifests: {
      Target: {
        name: "Target",
        import: "./components/Target.tsx",
        propsSchema: { type: "object" },
      },
    },
    hostBody: `::Host\nshow: Target\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.deepEqual(errors, []);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    const parsed = JSON.parse(c.props.schema as string);
    assert.equal(parsed.name, "Target");
    assert.deepEqual(parsed.propsSchema, { type: "object" });
  }
});

test("D-04 file resolver reports a friendly error when the file is missing", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody: `::Host\ndemo: ./nope.md\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.component, "Host");
  assert.equal(errors[0]!.path, "content");
  assert.match(errors[0]!.message, /file not found/);
  assert.equal(errors[0]!.received, "./nope.md");
});

test("D-05 componentSource reports unknown component name", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { code: { from: "componentSource", via: "show" } },
    },
    hostBody: `::Host\nshow: NotRegistered\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /no registered component "NotRegistered"/);
});

test("D-06 missing `via` prop reports a clear error", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody: `::Host\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /prop "demo" must be a non-empty string/);
});

test("D-07 derived prop overrides an author-written value", () => {
  const { hostPath, root } = fixture({
    demoBody: "from file",
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody:
      `::Host\ndemo: ./.pagecast/demos/demo.artifact.md\ncontent: ignored\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.deepEqual(errors, []);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    assert.equal(c.props.content, "from file");
  }
});

test("D-09 file resolver rejects absolute paths", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody: `::Host\ndemo: /etc/passwd\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(readFileSync(hostPath, "utf8"), hostPath);
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /absolute paths are not allowed/);
  assert.equal(errors[0]!.received, "/etc/passwd");
});

test("D-10 file resolver rejects `..` escapes outside the artifact directory", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody: `::Host\ndemo: ../../../../etc/passwd\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(readFileSync(hostPath, "utf8"), hostPath);
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.equal(errors.length, 1);
  assert.match(errors[0]!.message, /path escapes the artifact directory/);
});

test("D-11 file resolver accepts relative paths inside a subdirectory", () => {
  // Sanity: legitimate use (the Playground case) still works after the
  // containment check.
  const { hostPath, root } = fixture({
    demoBody: "ok",
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
      derived: { content: { from: "file", via: "demo" } },
    },
    hostBody: `::Host\ndemo: ./.pagecast/demos/demo.artifact.md\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(readFileSync(hostPath, "utf8"), hostPath);
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.deepEqual(errors, []);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    assert.equal(c.props.content, "ok");
  }
});

test("D-08 manifests without `derived` produce no errors and no mutation", () => {
  const { hostPath, root } = fixture({
    hostManifest: {
      name: "Host",
      import: "./components/Host.tsx",
    },
    hostBody: `::Host\nfoo: 1\n::/Host\n`,
  });
  const reg = loadRegistry({ cwd: root });
  const doc = parseArtifact(
    readFileSync(hostPath, "utf8"),
    hostPath
  );
  const { errors } = applyDerivations(doc, reg, hostPath);
  assert.deepEqual(errors, []);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    assert.deepEqual(c.props, { foo: 1 });
  }
});
