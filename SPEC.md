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
component-block  := open-line yaml-props? (blank-line slot-body)? close-line
open-line        := "::" name NL
close-line       := "::/" name NL
blank-line       := /^\s*$/ NL
```

`yaml-props` is parsed as YAML and must resolve to a mapping.
`slot-body` is parsed recursively as artifact blocks. The grammar has
**one** way to pass props (YAML) and **one** way to close a component
(`::/Name`). There are no inline arguments and no `---` slot separator.

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
A blank line ends the props block and begins the optional slot body.

A few rules content authors and agents should know:

1. **YAML is the only prop syntax.** There are no inline arguments.
2. **Strings containing `:` must be quoted.** YAML treats an unquoted
   `:` as a mapping delimiter. Write
   `description: "Use blocks: status, risks"` rather than
   `description: Use blocks: status, risks`. The parser reports this
   case with a fix suggestion when it fires.
3. **Nested components must be separated from props by a blank line.**
   This is what tells the parser "the YAML is done; what follows is
   slot content." If you forget the blank line the parser will say so.

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
