import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArtifact } from "../src/core/parser.js";

test("P-01 empty file → empty document", () => {
  const doc = parseArtifact("");
  assert.deepEqual(doc.frontmatter, {});
  assert.deepEqual(doc.blocks, []);
});

test("P-02 frontmatter only is parsed", () => {
  const doc = parseArtifact(`---\ntitle: Hi\n---\n`);
  assert.equal(doc.frontmatter.title, "Hi");
  assert.equal(doc.blocks.length, 0);
});

test("P-03 markdown only produces one markdown block", () => {
  const doc = parseArtifact(`# Hello\n\nWorld`);
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0]!.kind, "markdown");
});

test("P-04 component block parsed with YAML props and line number", () => {
  const src = `---\ntitle: T\n---\n\n# H\n\n::StatusGrid\nitems:\n  - label: Docs\n    status: ready\n::/StatusGrid\n`;
  const doc = parseArtifact(src, "f.md");
  const comp = doc.blocks.find((b) => b.kind === "component");
  assert.ok(comp && comp.kind === "component");
  assert.equal(comp.name, "StatusGrid");
  assert.deepEqual(comp.props, { items: [{ label: "Docs", status: "ready" }] });
  // After 3 frontmatter lines + blank + heading + blank => :: at line 7
  assert.equal(comp.loc.line, 7);
});

test("P-05 atom component (no slot) parses with ::/Name close", () => {
  const src = `::Callout\nkind: note\nbody: hello\n::/Callout\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.name, "Callout");
    assert.equal(c.slot.length, 0);
    assert.equal(c.props.kind, "note");
    assert.equal(c.props.body, "hello");
  }
});

test("P-06 slot body separated from props by blank line", () => {
  const src = `::Section\ntitle: Hi\n\nbody\n::/Section\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.name, "Section");
    assert.equal(c.props.title, "Hi");
    assert.equal(c.slot.length, 1);
    assert.equal(c.slot[0]?.kind, "markdown");
  }
});

test("P-07 nested component in slot parses recursively", () => {
  const src = `::Section\ntitle: Hi\n\n::Callout\nkind: note\nbody: nested\n::/Callout\n::/Section\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.slot[0]?.kind, "component");
  }
});

test("P-08 missing close throws with component name in message", () => {
  assert.throws(
    () => parseArtifact("::Foo\nbar: 1\n"),
    /Missing ::\/Foo/
  );
});

test("P-09 unknown component parses syntactically", () => {
  const doc = parseArtifact("::Nope\nvalue: 1\n::/Nope\n");
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") assert.equal(c.name, "Nope");
});

test("P-10 bare :: close is rejected with a fix suggestion", () => {
  assert.throws(
    () => parseArtifact("::Callout\nkind: note\n::\n"),
    /Bare "::" close is not supported/
  );
});

test("P-11 indented YAML is preserved", () => {
  const doc = parseArtifact(
    `::DecisionTable\ncolumns:\n  - Area\n  - Decision\nrows:\n  - - Billing\n    - Verify retries\n::/DecisionTable\n`
  );
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.deepEqual(c.props.rows, [["Billing", "Verify retries"]]);
  }
});

test("P-12 mid-line :: is not a component open", () => {
  const doc = parseArtifact(`Some text :: nope\n\nmore`);
  assert.equal(doc.blocks.length, 1);
  assert.equal(doc.blocks[0]?.kind, "markdown");
});

test("P-13 mismatched close name is reported", () => {
  assert.throws(
    () => parseArtifact("::Section\ntitle: a\n\nbody\n::/Other\n"),
    /Expected ::\/Section but found ::\/Other/
  );
});

test("P-14 component with no props and no slot still needs a close", () => {
  const doc = parseArtifact("::Spacer\n::/Spacer\n");
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.name, "Spacer");
    assert.deepEqual(c.props, {});
    assert.equal(c.slot.length, 0);
  }
});

test("P-15 YAML with unquoted colon in value gives a fix hint", () => {
  assert.throws(
    () =>
      parseArtifact(
        `::Risk\ntitle: A\ndescription: Use blocks: status, risks\n::/Risk\n`
      ),
    /Hint:.*unquoted ':'/
  );
});

test("P-16 nested component must be separated from props by blank line", () => {
  assert.throws(
    () =>
      parseArtifact(
        `::Section\ntitle: Hi\n::Callout\nkind: note\n::/Callout\n::/Section\n`
      ),
    /must be separated from Section's props by a blank line/
  );
});
