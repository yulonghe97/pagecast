# AGENTS.md

PageCast is a CLI that casts Markdown with typed component blocks into self-contained HTML. The engine lives at the repo root. `examples/landing/` is dogfood — the landing page is built with PageCast itself.

For the product pitch, read [README.md](./README.md). For the artifact grammar and rendering contract, read [SPEC.md](./SPEC.md). This file is for agents working on the code.

## Commands

Run from the repo root.

```bash
npm install              # one-time
npm test                 # 58 tests via node:test + tsx
npm run pagecast -- validate examples/landing/landing.artifact.md
npm run pagecast -- export examples/landing/landing.artifact.md --out examples/landing/landing.html
npm run pagecast -- dev examples/landing/landing.artifact.md      # live preview on :4321
```

Once published, consumers run `npx pagecast` from anywhere.

## Layout

```
src/
  cli/                  CLI entry (argv → dispatch)
  core/                 parser, registry, validator, template
  render/               React tree, export, esbuild loader, hydration
  dev/                  HTTP + WebSocket dev server
tests/                  unit + integration + CLI
examples/
  landing/              dogfood landing page
    .pagecast/          components, manifests, styles
    landing.artifact.md the source
    landing.html        the cast output
```

## Architecture in one paragraph

An *artifact* is a Markdown file with typed component blocks (`::Name yaml-props ::/Name`). The *parser* (`src/core/parser.ts`) produces an IR. The *registry* (`src/core/registry.ts`) loads `.pagecast/components/*.tsx`, `.pagecast/manifests/*.json`, and `.pagecast/styles/*.css` from the artifact's directory (walks upward to find `.pagecast/`). The *validator* (`src/core/validator.ts`) checks every component block's props against its JSON Schema manifest using AJV; errors carry `file:line:column`, the prop path, and the value the agent wrote. The *renderer* (`src/render/tree.tsx`) walks the IR and renders React components server-side. The *export* (`src/render/export.tsx`) writes one self-contained HTML file with inlined CSS and a restrictive CSP. The *dev server* (`src/dev/server.ts`) does the same but with chokidar watching the artifact and `.pagecast/`, plus a WebSocket reload pulse.

Hydration is opt-in per component (`interactive: true` in the manifest). Static components ship zero client JS. Interactive ones get bundled by esbuild and hydrated by `hydrateRoot` on the client.

## Conventions

- TypeScript everywhere. The CLI runs via `tsx` for dev.
- Manifests are JSON Schema Draft 7. AJV validates.
- A component file is the default export of a React component. The manifest names the file and declares the props schema.
- Styles go in `.pagecast/styles/*.css` and get concatenated + inlined at export time. No CSS frameworks.
- One way to pass props (YAML on the lines after `::Name`). One way to close a component (`::/Name`).
- Tests use `node:test` via `tsx --test`. Don't add a test framework.

## Sharp edges

1. **Blank lines end YAML props in anonymous-slot mode.** A `|` literal block that contains a blank line silently truncates the prop. Workaround: use named slots (`---propName---` markers) for long strings — they capture raw text and accept fenced code blocks. The YAML escape form (`"foo\nbar"`) still works for short cases.
2. **Named-slot bodies are raw text only.** No nested artifact components inside a named slot, and the parser closes the block at the first `::/<OuterName>` it sees — so don't put `::/<sameName>` literally inside a named slot. Use anonymous-slot mode if you need nested components.
3. **Registry walks upward** from the artifact file's directory to find `.pagecast/`. An artifact in `examples/landing/` finds `examples/landing/.pagecast/`. Don't move `.pagecast/` without keeping it on the lookup path.
4. **Hydration bundles every user component.** Even one `interactive: true` manifest triggers a full bundle of every `.pagecast/components/*` file. Page weight jumps by ~170 KB (React + components). Engine optimization is on the v0.2 list.
5. **CSP is strict by default.** Export emits `connect-src 'none'`, `script-src 'sha256-<hash>'` (only when there's a hydration script), `style-src 'unsafe-inline'`. No external assets. Anything that needs network won't load.

## Testing

```bash
npm test
```

58 tests across parser, validator, registry, renderer, template, CLI. Inline fixture components in `tests/render.test.tsx`. No bundled component library.

Add tests next to the file you're changing when the change is behavior. Don't add tests for refactors. Run the suite before opening a PR.

## Commits and PRs

- Atomic commits. Engine fixes separate from example or consumer changes.
- Commit messages: imperative present tense. One-line summary, paragraph of *why* if non-obvious.
- PRs target `main`. Open with `gh pr create --base main`.
- The repo is small. Don't add CI config until there's a reason.

## Dependencies

Runtime: `ajv`, `chokidar`, `esbuild`, `gray-matter`, `js-yaml`, `marked`, `react`, `react-dom`, `ws`. Each has a single clear role. Don't add dependencies casually. Anything new ends up in the consumer's `node_modules` and may end up in their hydration bundle.

## What this is not

- Not MDX. Source artifacts cannot execute JavaScript.
- Not a templating language. Adjacent `.data.yaml` files do `${path.to.value}` substitution. No loops, no conditionals.
- Not an app framework. One CLI binary, one HTML file out.

Three trust levels: artifact content is untrusted data, component packs are approved code, the CLI runtime is the trusted host.
