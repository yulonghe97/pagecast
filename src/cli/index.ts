#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parseArtifact } from "../core/parser.js";
import { loadArtifactSource } from "../core/template.js";
import { loadRegistry, listComponents, loadStyles } from "../core/registry.js";
import { validateArtifact, formatError } from "../core/validator.js";
import { applyDerivations } from "../core/derive.js";
import { exportToHtml } from "../render/export.js";
import { buildHydrationBundle, loadComponentMap } from "../render/loader.js";
import { collectHydrationPayload } from "../render/hydration.js";
import { startDevServer } from "../dev/server.js";
import { ArtifactError } from "../core/types.js";

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [cmd = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < rest.length && !rest[i + 1]!.startsWith("--")) {
        flags[a.slice(2)] = rest[++i]!;
      } else {
        flags[a.slice(2)] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { command: cmd, positional, flags };
}

async function main() {
  const { command, positional, flags } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "list-components": return cmdList(flags);
    case "validate":     return cmdValidate(positional, flags);
    case "export":       return cmdExport(positional, flags);
    case "dev":          return cmdDev(positional, flags);
    case "help":
    case "-h":
    case "--help":
      return printHelp();
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  process.stdout.write(`pagecast — cast structured artifacts into self-contained HTML pages

Usage:
  pagecast list-components [--json]   List registered components
  pagecast validate <file> [--json]   Parse + validate an .artifact.md file
  pagecast export <file> [--out path] Write a single-file HTML page
  pagecast dev <file> [--port n]      Live preview with hot reload

Components and manifests are loaded from .pagecast/ in the project.
Bring your own; nothing ships in the box.

`);
}

function cmdList(flags: Record<string, string | boolean>) {
  const reg = loadRegistry();
  const comps = listComponents(reg);
  if (flags["json"]) {
    process.stdout.write(JSON.stringify(comps, null, 2) + "\n");
    return;
  }
  for (const c of comps) {
    console.log(`${c.name}`);
    if (c.description) console.log(`  ${c.description}`);
    if (c.tags?.length) console.log(`  tags: ${c.tags.join(", ")}`);
    if (c.interactive) console.log(`  interactive: yes`);
    console.log();
  }
}

function cmdValidate(positional: string[], flags: Record<string, string | boolean>) {
  const file = positional[0];
  if (!file) { console.error("pagecast validate <file>"); process.exit(2); }
  const abs = resolve(file);
  const reg = loadRegistry({ cwd: dirname(abs) });
  const source = loadArtifactSource(abs);
  const doc = parseArtifact(source, abs);
  const derive = applyDerivations(doc, reg, abs);
  const errors = [...derive.errors, ...validateArtifact(doc, reg)];
  if (flags["json"]) {
    process.stdout.write(JSON.stringify({ ok: errors.length === 0, errors }, null, 2) + "\n");
    process.exit(errors.length === 0 ? 0 : 1);
  }
  if (errors.length === 0) {
    console.log(`✓ ${file} (${countComponentBlocks(doc)} components, valid)`);
    process.exit(0);
  }
  console.error(`✗ ${file} — ${errors.length} error${errors.length === 1 ? "" : "s"}`);
  for (const e of errors) console.error(formatError(e));
  process.exit(1);
}

async function cmdExport(positional: string[], flags: Record<string, string | boolean>) {
  const file = positional[0];
  if (!file) { console.error("pagecast export <file>"); process.exit(2); }
  const abs = resolve(file);
  const reg = loadRegistry({ cwd: dirname(abs) });
  const source = loadArtifactSource(abs);
  const doc = parseArtifact(source, abs);
  const derive = applyDerivations(doc, reg, abs);
  const errors = [...derive.errors, ...validateArtifact(doc, reg)];
  if (errors.length > 0) {
    console.error(`✗ ${file} — ${errors.length} error${errors.length === 1 ? "" : "s"}; cannot export.`);
    for (const e of errors) console.error(formatError(e));
    throw new ArtifactError(errors);
  }
  const components = await loadComponentMap(reg);
  const interactiveComponents = interactiveNames(reg);
  const payload = collectHydrationPayload(doc, interactiveComponents);
  const hydrationBundle = payload.islands.length > 0
    ? await buildHydrationBundle(reg)
    : null;
  const html = exportToHtml(doc, {
    components,
    interactiveComponents,
    extraCss: loadStyles(reg),
    hydrationBundle: hydrationBundle ?? undefined,
    hydrationData: hydrationBundle ? JSON.stringify(payload) : undefined,
  });
  const outPath = typeof flags["out"] === "string" ? resolve(flags["out"]) : abs.replace(/\.artifact\.md$|\.md$/, ".html");
  writeFileSync(outPath, html);
  console.log(`✓ wrote ${outPath} (${(html.length / 1024).toFixed(1)} KB)`);
}

function interactiveNames(reg: { manifests: Map<string, { name: string; interactive?: boolean }> }): Set<string> {
  const names = new Set<string>();
  for (const manifest of reg.manifests.values()) {
    if (manifest.interactive) names.add(manifest.name);
  }
  return names;
}

async function cmdDev(positional: string[], flags: Record<string, string | boolean>) {
  const file = positional[0];
  if (!file) { console.error("pagecast dev <file>"); process.exit(2); }
  const port = typeof flags["port"] === "string" ? parseInt(flags["port"], 10) : 4321;
  await startDevServer({ file: resolve(file), port });
}

function countComponentBlocks(doc: { blocks: any[] }): number {
  let n = 0;
  const walk = (bs: any[]) => {
    for (const b of bs) {
      if (b.kind === "component") {
        n++;
        if (b.slot) walk(b.slot);
      }
    }
  };
  walk(doc.blocks);
  return n;
}

main().catch((err) => {
  if (err instanceof ArtifactError) process.exit(1);
  console.error(err?.stack ?? err);
  process.exit(1);
});
