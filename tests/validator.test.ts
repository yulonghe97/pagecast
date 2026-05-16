import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArtifact } from "../src/core/parser.js";
import { validateArtifact } from "../src/core/validator.js";
import { Registry } from "../src/core/registry.js";
import { ComponentManifest } from "../src/core/types.js";

function reg(...manifests: ComponentManifest[]): Registry {
  const m = new Map<string, ComponentManifest>();
  for (const x of manifests) m.set(x.name, x);
  return { root: "/x", manifests: m, componentFiles: new Map() };
}

const RISK: ComponentManifest = {
  name: "RiskMatrix",
  import: "RiskMatrix",
  propsSchema: {
    type: "object",
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["title", "severity"],
          properties: {
            title: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
          },
          additionalProperties: false,
        },
      },
    },
  },
};

const CALLOUT: ComponentManifest = {
  name: "Callout",
  import: "Callout",
  propsSchema: {
    type: "object",
    required: ["kind", "body"],
    properties: {
      kind: { type: "string", enum: ["note", "warn"] },
      body: { type: "string" },
    },
    additionalProperties: false,
  },
};

test("V-01 valid props produce no errors", () => {
  const doc = parseArtifact(
    `::RiskMatrix\nitems:\n  - title: A\n    severity: low\n::/RiskMatrix\n`,
    "x.md"
  );
  const errs = validateArtifact(doc, reg(RISK));
  assert.equal(errs.length, 0);
});

test("V-02 missing required prop", () => {
  const doc = parseArtifact(`::RiskMatrix\n::/RiskMatrix\n`, "x.md");
  const errs = validateArtifact(doc, reg(RISK));
  assert.equal(errs.length, 1);
  assert.match(errs[0]!.message, /items is required/);
});

test("V-03 wrong enum reports allowed values", () => {
  const doc = parseArtifact(
    `::RiskMatrix\nitems:\n  - title: A\n    severity: critical\n::/RiskMatrix\n`,
    "x.md"
  );
  const errs = validateArtifact(doc, reg(RISK));
  const e = errs.find((e) => e.path.includes("severity"));
  assert.ok(e, "should report a severity error");
  assert.match(e!.message, /low|medium|high/);
  assert.equal(e!.received, "critical");
});

test("V-04 nested array path is .items.0.severity style", () => {
  const doc = parseArtifact(
    `::RiskMatrix\nitems:\n  - title: A\n    severity: critical\n::/RiskMatrix\n`,
    "x.md"
  );
  const errs = validateArtifact(doc, reg(RISK));
  const e = errs.find((e) => e.path === "items.0.severity");
  assert.ok(e, `expected items.0.severity, got ${errs.map(e=>e.path)}`);
});

test("V-05 unknown component produces a friendly error", () => {
  const doc = parseArtifact(`::Whatever\n::/Whatever\n`, "x.md");
  const errs = validateArtifact(doc, reg(RISK));
  assert.equal(errs.length, 1);
  assert.match(errs[0]!.message, /Unknown component/);
});

test("V-06 additional props are rejected when schema disallows them", () => {
  const doc = parseArtifact(`::Callout\nkind: note\nbody: hi\nextra: nope\n::/Callout\n`, "x.md");
  const errs = validateArtifact(doc, reg(CALLOUT));
  assert.equal(errs.length, 1);
  assert.equal(errs[0]!.path, "extra");
  assert.match(errs[0]!.message, /not a recognized prop/);
});

test("V-07 number out of range reports limit", () => {
  const doc = parseArtifact(
    `::RiskMatrix\nitems:\n  - title: A\n    severity: low\n    confidence: 1.5\n::/RiskMatrix\n`,
    "x.md"
  );
  const errs = validateArtifact(doc, reg(RISK));
  const e = errs.find((e) => e.path.includes("confidence"));
  assert.ok(e);
});
