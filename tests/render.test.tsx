import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { createElement, ReactNode } from "react";

import { parseArtifact } from "../src/core/parser.js";
import { renderDocument } from "../src/render/tree.js";
import { exportToHtml } from "../src/render/export.js";
import { collectHydrationPayload } from "../src/render/hydration.js";

/** Tiny inline test components — the engine does not ship a library. */
function StatusGrid({ items }: { items: Array<{ label: string; status: string }> }) {
  return (
    <div className="t-status-grid">
      {items.map((it, i) => (
        <span key={i} className={`t-status-grid__item t-status-grid__item--${it.status}`}>
          {it.label}
        </span>
      ))}
    </div>
  );
}
function Section({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <section className="t-section">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
function Toggle({ label }: { label: string }) {
  return <label className="t-toggle"><input type="checkbox" />{label}</label>;
}

const COMPONENTS = { StatusGrid, Section, Toggle };

test("RH-01 markdown block renders as pagecast-markdown wrapper", () => {
  const doc = parseArtifact(`Hello **world**`);
  const tree = renderDocument(doc, { components: {} });
  const html = renderToString(createElement("div", null, tree));
  assert.match(html, /pagecast-markdown/);
  assert.match(html, /Hello <strong>world<\/strong>/);
});

test("RH-02 known component renders with provided props", () => {
  const src = `::StatusGrid\nitems:\n  - label: Docs\n    status: ready\n  - label: Billing\n    status: blocked\n::/StatusGrid\n`;
  const doc = parseArtifact(src);
  const tree = renderDocument(doc, { components: COMPONENTS });
  const html = renderToString(createElement("div", null, tree));
  assert.match(html, /t-status-grid__item--ready/);
  assert.match(html, /t-status-grid__item--blocked/);
  assert.match(html, /Docs/);
  assert.match(html, /Billing/);
});

test("RH-03 unknown component renders error placeholder, not crash", () => {
  const doc = parseArtifact(`::DoesNotExist\n::/DoesNotExist\n`);
  const tree = renderDocument(doc, { components: COMPONENTS });
  const html = renderToString(createElement("div", null, tree));
  assert.match(html, /Unknown component &lt;DoesNotExist&gt;/);
});

test("RH-04 Section slot renders nested markdown as children", () => {
  const src = `::Section\ntitle: Hi\n\nInner paragraph.\n::/Section\n`;
  const doc = parseArtifact(src);
  const tree = renderDocument(doc, { components: COMPONENTS });
  const html = renderToString(createElement("div", null, tree));
  assert.match(html, /Hi/);
  assert.match(html, /Inner paragraph/);
});

test("I-03 export is self-contained and includes CSP", () => {
  const doc = parseArtifact(`# Hi\n\n::StatusGrid\nitems:\n  - label: Docs\n    status: ready\n::/StatusGrid\n`);
  const html = exportToHtml(doc, { components: COMPONENTS });
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.ok(!/<script\s+src=/.test(html), "no external scripts");
  assert.ok(!/<link\s+[^>]*href=/.test(html), "no external stylesheets");
});

test("I-04 interactive component emits hydration island and one inline script", () => {
  const doc = parseArtifact(`::Toggle\nlabel: Acknowledge\n::/Toggle\n`);
  const interactive = new Set(["Toggle"]);
  const payload = collectHydrationPayload(doc, interactive);
  const html = exportToHtml(doc, {
    components: COMPONENTS,
    interactiveComponents: interactive,
    hydrationBundle: "window.__hydrated=true;",
    hydrationData: JSON.stringify(payload),
  });
  assert.match(html, /data-pagecast-island="island-0"/);
  assert.equal((html.match(/<script>/g) ?? []).length, 1);
  assert.match(html, /window.__PAGECAST_DATA__=/);
  assert.match(html, /sha256-/);
});
