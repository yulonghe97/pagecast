import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applyTemplateBindings, loadArtifactSource } from "../src/core/template.js";

test("T-01 scalar and object bindings are substituted", () => {
  const src = `# \${title}\n\n::RiskMatrix\nitems: \${risks}\n::/RiskMatrix\n`;
  const out = applyTemplateBindings(src, {
    title: "Launch",
    risks: [{ title: "Billing", severity: "high" }],
  });
  assert.match(out, /# Launch/);
  assert.match(out, /items: \[\{"title":"Billing","severity":"high"\}\]/);
});

test("T-02 adjacent .data.yaml is applied when loading an artifact", () => {
  const dir = mkdtempSync(join(tmpdir(), "pagecast-template-"));
  const file = join(dir, "layout.artifact.md");
  writeFileSync(file, `---\ntitle: \${title}\n---\n\n# \${heading}\n`);
  writeFileSync(join(dir, "layout.data.yaml"), "title: Bound Title\nheading: Bound Heading\n");
  const out = loadArtifactSource(file);
  assert.match(out, /title: Bound Title/);
  assert.match(out, /# Bound Heading/);
});

test("T-03 missing bindings fail loudly", () => {
  assert.throws(
    () => applyTemplateBindings("Hello ${missing}", {}),
    /missing template binding 'missing'/
  );
});
