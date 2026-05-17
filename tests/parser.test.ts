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

test("P-17 named slot captures plain text as a string prop", () => {
  const src = `::Demo\ntitle: Hi\n---note---\nhello world\n::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.props.title, "Hi");
    assert.equal(c.props.note, "hello world");
    assert.equal(c.slot.length, 0);
  }
});

test("P-18 named slot strips a surrounding fenced code block", () => {
  const src = `::Demo\n---code---\n\`\`\`tsx\nexport default function X() {}\n\`\`\`\n::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.props.code, "export default function X() {}");
  }
});

test("P-19 named slot preserves blank lines inside the fenced body", () => {
  const src = `::Demo\n---code---\n\`\`\`\nline 1\n\nline 3\n\`\`\`\n::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.props.code, "line 1\n\nline 3");
  }
});

test("P-20 multiple named slots become separate props", () => {
  const src =
    `::Demo\ntitle: T\n` +
    `---a---\nalpha\n` +
    `---b---\nbeta\n` +
    `::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.props.title, "T");
    assert.equal(c.props.a, "alpha");
    assert.equal(c.props.b, "beta");
  }
});

test("P-21 named-slot mode allows blank lines inside YAML props", () => {
  // A blank line before the first slot marker is just whitespace, not a
  // legacy anonymous-slot trigger. This is the fix for the Playground
  // YAML-blank-line bug.
  const src = `::Demo\ntitle: T\n\n---body---\nhello\n::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.props.title, "T");
    assert.equal(c.props.body, "hello");
  }
});

test("P-22 duplicate slot name in same block is rejected", () => {
  const src = `::Demo\n---a---\none\n---a---\ntwo\n::/Demo\n`;
  assert.throws(() => parseArtifact(src), /Duplicate slot "a"/);
});

test("P-23 fence not stripped when body contains multiple fences", () => {
  const src =
    `::Demo\n---code---\n\`\`\`js\nfoo\n\`\`\`\n\`\`\`js\nbar\n\`\`\`\n::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  if (c?.kind === "component") {
    assert.ok(typeof c.props.code === "string");
    assert.match(c.props.code as string, /^```js/);
    assert.match(c.props.code as string, /```$/);
  }
});

test("P-24 named slot missing matching close points at open line", () => {
  const src = `::Demo\n---body---\nhi\n`;
  assert.throws(() => parseArtifact(src), /Missing ::\/Demo/);
});

test("P-25 anonymous slot containing a nested component with named slots stays anonymous", () => {
  // Regression: planNamedSlots used to scan past nested blocks and flip the
  // outer to named-slot mode if any `---marker---` appeared anywhere before
  // ::/Outer. The outer here is anonymous; its slot body contains an Inner
  // that legitimately uses named slots.
  const src =
    `::Outer\n` +
    `\n` +
    `::Inner\n` +
    `---body---\n` +
    `hello\n` +
    `::/Inner\n` +
    `::/Outer\n`;
  const doc = parseArtifact(src);
  const outer = doc.blocks[0];
  assert.equal(outer?.kind, "component");
  if (outer?.kind === "component") {
    assert.equal(outer.name, "Outer");
    assert.deepEqual(outer.props, {});
    assert.equal(outer.slot.length, 1);
    const inner = outer.slot[0];
    assert.equal(inner?.kind, "component");
    if (inner?.kind === "component") {
      assert.equal(inner.name, "Inner");
      assert.equal(inner.props.body, "hello");
    }
  }
});

test("P-26 anonymous slot whose markdown body contains a `---word---` line stays anonymous", () => {
  // Regression: the literal token `---tldr---` looks like a SLOT_MARKER but
  // here it sits inside markdown content of an anonymous slot. The outer
  // block should not flip to named-slot mode.
  const src =
    `::Section\n` +
    `title: Hi\n` +
    `\n` +
    `# Hello\n` +
    `\n` +
    `---tldr---\n` +
    `A short paragraph.\n` +
    `::/Section\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.name, "Section");
    assert.deepEqual(c.props, { title: "Hi" });
    assert.ok(c.slot.length >= 1, "anonymous slot body should not be empty");
    // The slot body is parsed as artifact blocks; the markdown block should
    // include the heading and the paragraph that follows the `---tldr---`.
    const md = c.slot.find((b) => b.kind === "markdown");
    assert.ok(md, "expected at least one markdown block in the slot");
    if (md?.kind === "markdown") {
      assert.match(md.text, /# Hello/);
      assert.match(md.text, /A short paragraph\./);
    }
  }
});

test("P-27 named-slot mode still triggers when first body line after blanks is a marker", () => {
  // Companion to P-25/P-26: confirms the new rule does not accidentally
  // disable named-slot mode when the author writes the canonical shape
  // (props, blank line, first marker).
  const src =
    `::Demo\n` +
    `title: T\n` +
    `\n` +
    `---body---\n` +
    `hello\n` +
    `::/Demo\n`;
  const doc = parseArtifact(src);
  const c = doc.blocks[0];
  assert.equal(c?.kind, "component");
  if (c?.kind === "component") {
    assert.equal(c.props.title, "T");
    assert.equal(c.props.body, "hello");
    assert.equal(c.slot.length, 0);
  }
});
