# PageCast

Cast structured artifacts into self-contained HTML pages.

Write a React component. Add a JSON Schema for its props. Your agents fill data into `.artifact.md` files (Markdown plus typed component blocks); PageCast validates against the schema, renders through your component, and writes one self-contained HTML file.

PageCast is inspired by the agent HTML artifact workflow: once a plan, review, or report gets long, people read a browser page more readily than a Markdown file.

Direct agent-written HTML has sharp edges in team workflows. You cannot validate it against product fields. You cannot keep the layout consistent across runs. Review diffs get noisy, and agents can break markup with a small edit.

PageCast keeps the browser-page workflow while changing what agents write. Agents fill Markdown plus typed YAML blocks. Trusted local components render the page, enforce schemas, carry the styling, and opt into interactivity.

Best for repeat outputs: weekly plans, launch readiness, QA reports, status pages. The agent fills the data. Your components own the look.

Not MDX. Source files can't execute JavaScript.

Engine only. You supply the components.

## The shape

An agent writes:

```
::StatusGrid
items:
  - label: Docs
    status: ready
  - label: Billing
    status: blocked
::/StatusGrid
```

You wrote `StatusGrid.tsx` and `StatusGrid.json` (its prop schema) once, in `.pagecast/`. PageCast reads both, validates the YAML, renders the component server-side, writes `plan.html`.

If the agent writes `status: critical` and the schema only allows `ready | blocked | warning`, validation fails at the line and column, naming the exact prop path. The agent reads the error, fixes one line, retries. No HTML rewrite.

## CLI

```bash
pagecast list-components [--json]
pagecast validate <file> [--json]
pagecast export <file> [--out path]
pagecast dev <file> [--port n]
```

PageCast reads `.pagecast/` from cwd:

```
.pagecast/
  components/   *.tsx, default export is the component
  manifests/    *.json, one JSON Schema per component
  styles/       optional CSS, inlined on export
```

You create this directory yourself. Nothing scaffolds it for you.

## File format

```
artifact-file := frontmatter? block*
frontmatter   := --- yaml ---
block         := markdown | ::Name yaml-props? (blank-line slot)? ::/Name
```

Components open with `::Name`, take props as a YAML mapping on the
lines immediately after, and always close with `::/Name`. A blank line
ends the props block and starts the optional slot body. There are no
inline arguments and no `---` slot separator. Strings containing `:`
must be quoted (the parser tells you when you forget).

Example with a slot:

```md
---
title: Cycle 14 launch readiness
---

# Launch readiness

::Section
title: Top risks

Walk-through Friday. Owners tentative.

::RiskMatrix
items:
  - title: Webhook retries unverified
    severity: high
    confidence: 0.82
    owner: Payments
::/RiskMatrix
::/Section
```

## Errors

```
plans/cycle-14.artifact.md:14:1
  RiskMatrix.items.0.severity must be one of: "low" | "medium" | "high"
  Received: "critical"
```

Unknown component names get a Levenshtein suggestion from the registry.

## Rendering

- `export`: server-render with `react-dom/server`, inline the CSS, write one HTML file with no external assets.
- `dev`: HTTP + WebSocket server, watches the artifact and `.pagecast/`, reloads on save.
- User `.pagecast/components/*.tsx` files get bundled with esbuild and imported at runtime.
- Interactive components opt in via `interactive: true` in their manifest. They get hydration islands. Static components render once on the server with zero client JS.
- Exported HTML carries a restrictive Content Security Policy.

## Not

- Not MDX. No JS in source files.
- Not a templating language. Adjacent `.data.yaml` substitutes `${path}` tokens. No loops, no conditionals.
- Not an app framework. One CLI binary.

## Test

```bash
npm test
```

38 tests over parser, validator, registry, renderer, templates, CLI. Inline fixture components; no bundled library.

## Layout

```
src/
  cli/                  CLI entry
  core/                 parser, registry, validator, template
  render/               React tree, export, esbuild loader, hydration
  dev/                  dev server with file watcher and WS hot reload
tests/                  unit, integration, CLI
examples/
  landing/              dogfood landing page — built with PageCast
    .pagecast/          components, manifests, styles
    landing.artifact.md the source
    landing.html        the cast output
```

## Examples

The landing page in `examples/landing/` is built with PageCast itself. Eight components, one artifact, one self-contained HTML file out. The Playground component is interactive — edit the artifact in the browser and watch the cast update live.

```bash
npm run pagecast -- export examples/landing/landing.artifact.md --out examples/landing/landing.html
open examples/landing/landing.html
```

## What's next

1. Built-in component packs (`plan`, `review`, `qa`, `launch`) so authors render without writing components.
2. Installable packs: `pagecast components install` drops trusted code into `.pagecast/` for local edits. shadcn-style: code lives in your repo, not a black-box dependency.
3. Remote packs declared in frontmatter, fetched and locked by the CLI.
4. Pack publishing.
5. shadcn-backed default pack.

Three trust levels: artifact content is untrusted data, component packs are approved code, the CLI runtime is the trusted host.
