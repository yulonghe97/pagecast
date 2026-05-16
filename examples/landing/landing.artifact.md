---
title: "PageCast: cast Markdown into self-contained HTML pages"
---

::Hero
eyebrow: "PAGECAST · v0.1"
title: "Markdown in. One HTML file out."
sub: "Write Markdown with typed component blocks. PageCast checks every prop against a JSON Schema and writes one self-contained HTML page. No build step. No app server."
command: "npx pagecast export plan.artifact.md"
codeFile: "plan.artifact.md"
code: |
  ::StatusGrid
  items:
    - label: Docs
      status: ready
    - label: Billing
      status: blocked
    - label: Webhooks
      status: warning
  ::/StatusGrid
links:
  - label: "github"
    href: "https://github.com/"
  - label: "npm"
    href: "https://npmjs.com/package/pagecast"
  - label: "spec"
    href: "./SPEC.md"
worksWithLabel: "WORKS WITH"
worksWith:
  - name: "Claude Code"
    logo: "claude"
  - name: "Cursor"
    logo: "cursor"
  - name: "Codex"
    logo: "codex"
  - name: "Windsurf"
    logo: "windsurf"
  - name: "MCP"
    logo: "mcp"
::/Hero

::Numbers
eyebrow: "BY THE NUMBERS"
items:
  - value: "~5×"
    accent: true
    label: "LESS WRITTEN"
    sub: "Agents write the artifact data. The component owns the markup, the classes, and the DOM scaffolding."
  - value: "< 50ms"
    label: "VALIDATE"
    sub: "Parse and schema check. Errors point at the source line and the value the agent wrote."
  - value: "0"
    label: "RUNTIME DEPS"
    sub: "The exported HTML ships with `connect-src 'none'` in its CSP. Nothing loads from the network."
  - value: "1"
    label: "HTML FILE"
    sub: "No asset directory, no bundler chain. Open the file in any browser and it works."
::/Numbers

::Playground
eyebrow: "TRY IT LIVE"
title: "Edit the artifact. Watch it cast."
sub: "Change a label. Change a status to something the schema doesn't allow. Errors appear with line numbers — the same format the CLI emits in your terminal."
hint: "try editing the status — change \"ready\" to \"critical\" and watch the error appear"
initialArtifact: "::StatusGrid\nitems:\n  - label: Docs\n    status: ready\n  - label: Billing\n    status: blocked\n  - label: Webhooks\n    status: warning\n::/StatusGrid"
componentCode: "export default function StatusGrid({ items }) {\n  return (\n    <div className=\"status-grid\">\n      {items.map((it) => (\n        <div key={it.label} className={`row row--${it.status}`}>\n          <span>{it.label}</span>\n          <span className=\"tag\">{it.status}</span>\n        </div>\n      ))}\n    </div>\n  );\n}"
manifestCode: "{\n  \"name\": \"StatusGrid\",\n  \"import\": \"./components/StatusGrid.tsx\",\n  \"propsSchema\": {\n    \"type\": \"object\",\n    \"required\": [\"items\"],\n    \"properties\": {\n      \"items\": {\n        \"type\": \"array\",\n        \"items\": {\n          \"properties\": {\n            \"label\":  { \"type\": \"string\" },\n            \"status\": { \"enum\": [\"ready\", \"blocked\", \"warning\"] }\n          }\n        }\n      }\n    }\n  }\n}"
::/Playground

::Agents
eyebrow: "FOR AGENTS"
title: "Built for the model, not the human."
sub: "Agents are bad at writing HTML and CSS. They're good at writing structured data. PageCast turns the second kind into the first, and checks every value on the way through."
termFile: "agent.log"
terminal: "$ npx pagecast validate plan.artifact.md\n✗ plan.artifact.md — 1 error\nplan.artifact.md:14:5\n  RiskMatrix.items.0.severity must be one of: \"low\" | \"medium\" | \"high\"\n  Received: \"critical\"\n— agent edits line 14 —\n$ npx pagecast validate plan.artifact.md\n✓ plan.artifact.md (6 components, valid)"
points:
  - title: "Agents write YAML, not HTML."
    body: "No invented classes. No missing attributes. The component renders the look; the artifact carries the data."
  - title: "Errors are structured and addressable."
    body: "Validation returns the source location and what the prop should have been. The model fixes one line and retries."
  - title: "One verb, runs over npx."
    body: "`npx pagecast export` is a single shell call. Easy to wire into a CI step or an agent turn."
  - title: "No SDK to learn."
    body: "Any agent that can run a shell command can cast pages. Skills and MCP integrations sit on top of that floor, never under it."
::/Agents

::Features
eyebrow: "WHAT YOU GET"
title: "Bring your own components."
sub: "PageCast renders, validates, and exports. You write the components in `.pagecast/`. Remote packs are coming so you can skip that step too."
items:
  - logo: "json-schema"
    title: "JSON Schema on every block."
    body: "Every prop is checked against a Draft 7 schema before render. Failures point at the source line and the value the agent wrote."
  - logo: "react"
    title: "Hydrate only what needs JS."
    body: "Static components render once on the server. Interactive ones opt in per manifest and get a hydration island. The rest is zero client JS."
  - logo: "esbuild"
    title: "esbuild bundles your components."
    body: "esbuild bundles your .tsx files on demand. The dev server watches the artifact and the .pagecast directory; a save triggers a WebSocket reload."
  - logo: "html5"
    title: "One HTML file. No dependencies."
    body: "Export inlines the CSS, embeds any hydration script, and writes a restrictive CSP. The output runs without a server or a network."
::/Features

::CliRef
eyebrow: "CLI"
title: "Four commands. That's the whole surface."
commands:
  - name: "export"
    args: "<file> [--out path]"
    desc: "Render an artifact to a single self-contained HTML file. CSS inlined, CSP set."
  - name: "validate"
    args: "<file> [--json]"
    desc: "Parse the artifact, check every block against its prop schema, exit non-zero on the first failure. Use --json for machine-readable output."
  - name: "dev"
    args: "<file> [--port n]"
    desc: "Start a live preview server. Watches the artifact and the .pagecast directory; reloads on save."
  - name: "list-components"
    args: "[--json]"
    desc: "Print every component the registry knows about, with its description, tags, and interactive flag."
::/CliRef

::Footer
source: "rendered by pagecast"
sourceLabel: "view source on github"
sourceUrl: "https://github.com/pagecast/pagecast"
version: "v0.1 · MIT"
::/Footer
