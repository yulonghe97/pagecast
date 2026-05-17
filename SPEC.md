# PageCast Spec v0.1

This document describes the implemented v0.1 reference behavior and
the product constraints behind it.

The engine ships on its own. No starter component library is bundled.
Components, manifests, and styles live in the consumer project's
`.pagecast/` directory.

## Product contract

PageCast turns AI-generated structured intent (an *artifact*) into a
validated, trusted HTML *page*.

The content author, often an agent, writes:

- Markdown prose;
- typed component blocks;
- YAML props for those blocks;
- optional frontmatter.

The trusted runtime provides:

- component manifests with JSON Schema props;
- React components that render those props;
- styles and optional hydration logic;
- validation, preview, and single-file HTML export.

The artifact file is data and structure. It does not import modules,
execute JavaScript, or define arbitrary runtime behavior.

## Goals

1. Make AI-generated artifact outputs easier to read than raw Markdown.
2. Make repeated agent outputs safer than direct HTML/JSX generation.
3. Keep components and visual quality reusable across artifacts.
4. Validate structure and business fields before rendering.
5. Export portable HTML that opens with no network or app server.
6. Support local customization without requiring a full React app.

## Non-goals for v0.1

- Arbitrary JSX or JavaScript in artifact files.
- General-purpose templating with loops or conditionals.
- Remote component loading.
- Public component registry.
- Multi-page sites.
- Full design-system integration.
- A starter component library shipped with the engine.

## Decisions

1. **Manifests are JSON Schema Draft 7.** Standalone JSON manifests in
   `.pagecast/manifests/` are the source of truth at validation time.
2. **Components are trusted code.** Local `.pagecast/components/*.tsx`
   files are bundled by the CLI and dynamically imported by the host.
   Artifact files can reference registered component names but cannot
   define new code.
3. **Slots are supported but optional.** Components may accept nested
   Markdown and component blocks through a default slot.
4. **Hydration is opt-in per component.** Manifests carry an
   `interactive: true` flag. Static components render once on the
   server. Interactive components get hydration islands.
5. **Templates use explicit data binding.** Adjacent `.data.yaml`,
   `.data.yml`, or `.data.json` files can substitute `${path.to.value}`
   tokens. Missing bindings fail loudly. Loops and conditionals are
   out of scope.
6. **Export is self-contained.** HTML export inlines CSS and any
   required hydration bundle, and emits a restrictive Content Security
   Policy.
7. **No bundled components.** The engine has no opinions about
   typography, palette, or layout. Consumers provide everything under
   `.pagecast/`.

## Naming

- **PageCast** is the brand, the CLI, and the verb. PageCast *casts*
  an artifact into a page.
- **Artifact** is the noun for the structured input the agent writes
  (`.artifact.md`). Internal APIs use this term: `parseArtifact`,
  `validateArtifact`, `ArtifactDocument`, `ArtifactError`.
- **Page** is the rendered HTML output.
- **`.pagecast/`** is the tool-namespaced config directory (analogous
  to `.next/`, `.nuxt/`). It holds components, manifests, styles.

## Authoring grammar

```txt
artifact-file    := frontmatter? block*
frontmatter      := "---" NL yaml NL "---" NL
block            := markdown-block | component-block
component-block  := open-line yaml-props? body? close-line
body             := anonymous-slot | named-slot+
anonymous-slot   := blank-line slot-body
named-slot       := slot-marker text-body
slot-marker      := "---" name "---" NL
open-line        := "::" name NL
close-line       := "::/" name NL
blank-line       := /^\s*$/ NL
```

`yaml-props` is parsed as YAML and must resolve to a mapping.
`slot-body` (anonymous) is parsed recursively as artifact blocks.
`text-body` (named) is captured as raw text and assigned to a string
prop with the same name as the marker.

A block is in **named-slot mode** iff the first non-blank line after
its prop region is a `---name---` marker. Otherwise it is in
**anonymous-slot mode**. The two modes are mutually exclusive per block.

Markers that appear later in an anonymous slot body — inside markdown
content or inside a nested `::Other` block — do **not** flip the outer
mode. They are just text in whichever body they sit in. This means an
author can write a `---tldr---` line as a Markdown thematic-break-style
divider inside an anonymous slot, and the parser will leave it alone.

The grammar has **one** way to pass props (YAML), **one** way to close
a component (`::/Name`), and **two** ways to give a component body
(anonymous slot for nested blocks, named slots for raw text props).

Example:

```md
::Section
title: Implementation scope
subtitle: What the agent will change

The agent will update documentation, examples, and demo wiring. It will
not change the parser or renderer in this plan.

::RiskMatrix
items:
  - title: README promises future remote-pack behavior as current
    severity: medium
    confidence: 0.72
    owner: Docs
::/RiskMatrix
::/Section
```

## Props

Props are written as a YAML mapping on the lines immediately after the
open line, with no blank line between the open line and the first prop.
A blank line ends the props block and begins the optional slot body —
*unless* the block uses named slots, in which case blank lines before
the first `---name---` marker are treated as whitespace.

A few rules content authors and agents should know:

1. **YAML is the primary prop syntax.** Inline values, simple objects,
   and arrays all go in YAML on the open line side. Named slots are an
   alternative source for *string* props that benefit from being
   written as block text (long prose, code samples).
2. **Strings containing `:` must be quoted.** YAML treats an unquoted
   `:` as a mapping delimiter. Write
   `description: "Use blocks: status, risks"` rather than
   `description: Use blocks: status, risks`. The parser reports this
   case with a fix suggestion when it fires.
3. **Nested components must be separated from props by a blank line.**
   In anonymous-slot mode this is what tells the parser "the YAML is
   done; what follows is slot content." In named-slot mode, nested
   components go inside an anonymous slot — named slots themselves
   capture raw text, not artifact blocks.

## Named slots

A named slot lets a long string prop be written as a block of text
rather than crammed into a YAML scalar. The marker is `---name---` on
its own line at column 0. Everything between that marker and the next
marker (or `::/Name` close) is captured as a string and assigned to
the prop named `name`.

If the captured text is exactly one fenced code block — i.e. the body
starts with ```` ```lang ```` and ends with ```` ``` ```` and contains
no other fence lines — the fence markers are stripped and only the
fenced content becomes the prop value. This lets authors keep editor
syntax highlighting on the source while the component receives clean
code.

Example:

```md
::Playground
title: "Try it"
hint: "edit the status — set ready to critical"

---initialArtifact---
​```
::StatusGrid
items:
  - label: Docs
    status: ready
::/StatusGrid
​```

---componentCode---
​```tsx
export default function StatusGrid({ items }) { ... }
​```
::/Playground
```

Rules:

1. A given slot name may appear at most once per block.
2. Named-slot mode disables the legacy "blank line ends props" rule
   *for that block*. YAML props may span blank lines until the first
   marker.
3. Slot content is raw text. To embed nested artifact components, use
   anonymous-slot mode instead.
4. A slot name that does not correspond to a prop in the manifest will
   surface as a normal `additionalProperties` validation error.

## Frontmatter

Frontmatter is optional. The renderer passes `title`, `description`,
and `theme` to a `Page` component if one is registered. Other keys are
preserved in the artifact IR for future consumers.

## Component manifests

A manifest describes the public authoring contract for a component:

```json
{
  "name": "RiskMatrix",
  "description": "Risks by severity and confidence.",
  "tags": ["risk", "planning"],
  "interactive": false,
  "propsSchema": {
    "type": "object",
    "required": ["items"],
    "additionalProperties": false,
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["title", "severity", "confidence"],
          "properties": {
            "title": { "type": "string" },
            "severity": { "enum": ["low", "medium", "high"] },
            "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
            "owner": { "type": "string" }
          }
        }
      }
    }
  }
}
```

## Derived props

A manifest may declare props that are filled in by the engine from
external sources rather than written by hand in the artifact. This
keeps an artifact free of duplicated content (component source, demo
data) that already lives elsewhere as a single source of truth.

The manifest's optional `derived` field maps a target prop name to a
resolver descriptor:

```json
{
  "name": "Playground",
  "propsSchema": { ... },
  "derived": {
    "initialArtifact": { "from": "file",              "via": "demo" },
    "componentCode":   { "from": "componentSource",   "via": "show" },
    "manifestCode":    { "from": "componentManifest", "via": "show" }
  }
}
```

`from` selects a built-in resolver; `via` names the prop holding its
lookup key. Three resolvers ship in v0.1:

| `from`                | Lookup key (`via`) | Returns |
|-----------------------|--------------------|---------|
| `file`                | relative path under the artifact directory | file contents as a string |
| `componentSource`     | registered component name     | source of `.pagecast/components/<name>.tsx` |
| `componentManifest`   | registered component name     | the manifest serialized as pretty JSON |

The `file` resolver enforces the trust boundary: absolute paths are
rejected, and any relative path whose normalized resolution escapes
the artifact's directory is rejected. The engine refuses to be a
generic file reader on behalf of an artifact prop value, because
artifact content is untrusted.

Derivation runs after parse and before validation, so derived values
participate in schema checks like any other prop. Errors (missing
file, path-escape, unknown component, missing `via` prop) are
reported in the same shape as validation errors and tied to the
source line of the host block.

If a prop appears both in the artifact YAML and in `derived`, the
derived value wins — the manifest decided that prop is computed.

## Error model

Validation errors carry:

- `file`: absolute path of the source file;
- `line`: 1-based line number where the offending block begins;
- `column`: best-effort column of the offending token;
- `component`: component name;
- `path`: JSON-pointer-ish prop path such as `items.0.severity`;
- `message`: one-line human description;
- `received`: actual value when available;
- `expected`: short schema-derived expectation when available.

Example:

```txt
plans/cycle-14.artifact.md:18:1
  RiskMatrix.items.0.severity must be one of: "low" | "medium" | "high"
  Received: "critical"
```

Unknown components are validation errors, not parse errors, and
include a best-effort suggestion from the loaded registry.

## CLI surface

```txt
pagecast list-components [--json]     print registry
pagecast validate <file> [--json]     parse + validate, exit 0/1
pagecast export   <file> [--out path] write single-file HTML
pagecast dev      <file> [--port n]   live preview with hot reload
```

`--json` prints structured output for machine integration where
supported.

## Project layout expected by the CLI

```txt
.pagecast/
  components/   *.tsx files. Default export is the component.
  manifests/    *.json files. One JSON Schema manifest per component.
  styles/       Optional CSS bundled into export output.
```

The engine does not scaffold this directory.

## DOM and runtime namespacing

Exported pages reserve the `pagecast` namespace in the user's HTML:

- root container: `.pagecast-root`
- markdown wrappers: `.pagecast-markdown`
- inline error placeholders: `.pagecast-error`
- hydration island roots: `data-pagecast-island="island-N"`
- hydration payload global: `window.__PAGECAST_DATA__`
- generator meta: `<meta name="generator" content="pagecast vX.Y" />`

User components are free to use any class names that do not collide
with this prefix.

## Conformance

A v0.1 renderer is conformant if:

1. It parses the grammar above without ambiguity.
2. It validates props against the loaded manifests.
3. `validate` exits non-zero on any validation error.
4. `export` writes a self-contained HTML file that opens without a
   network connection.
5. `dev` updates the rendered page within roughly 500ms of a source
   save in normal local development.
6. Artifact files cannot execute arbitrary JavaScript.
