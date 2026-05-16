# PageCast landing page

Dogfood. The PageCast landing page itself, cast by PageCast.

## Build

From the repo root:

```bash
npm run pagecast -- export examples/landing/landing.artifact.md --out examples/landing/landing.html
```

Or once `pagecast` is published, anywhere:

```bash
cd examples/landing
npx pagecast export landing.artifact.md
```

## Structure

- `landing.artifact.md` — the source. YAML + Markdown the page is cast from.
- `landing.html` — the output. One self-contained file, opens anywhere.
- `.pagecast/` — components, manifests, and the stylesheet.

## Components

| Name | Purpose |
|---|---|
| Hero | H1, install command, works-with logo strip, artifact code preview |
| Numbers | 4-cell stats band (proof under pitch) |
| Playground | Interactive: edit the artifact, watch the cast |
| Agents | Why this exists for AI agents, plus a terminal demo of the validate/fix loop |
| Features | Engine capabilities with tech-stack logos (JSON Schema, React, esbuild, HTML5) |
| CliRef | Four-command reference table |
| Footer | Brand, source link, version |

`Playground` is the only interactive component (`interactive: true` in its manifest). Everything else renders once on the server and ships with zero client JS.
