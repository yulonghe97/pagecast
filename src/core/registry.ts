import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { ComponentManifest } from "./types.js";

export interface Registry {
  /** Absolute path to the .pagecast directory. */
  root: string;
  /** Manifest index by component name. */
  manifests: Map<string, ComponentManifest>;
  /** Absolute paths to user .tsx component files keyed by component name. */
  componentFiles: Map<string, string>;
}

/**
 * Load the component registry from a project root.
 *
 * Search order: explicit `dir`, then `<cwd>/.pagecast`, then walk
 * upward to find one.
 */
export function loadRegistry(opts: { dir?: string; cwd?: string } = {}): Registry {
  const cwd = opts.cwd ?? process.cwd();
  const dir = opts.dir
    ? resolve(opts.dir)
    : findConfigDir(cwd);
  if (!dir) {
    throw new Error(
      `No .pagecast/ directory found from ${cwd}. Create one with components/ and manifests/ subdirectories.`
    );
  }

  const manifestDir = join(dir, "manifests");
  const componentsDir = join(dir, "components");

  const manifests = new Map<string, ComponentManifest>();
  const componentFiles = new Map<string, string>();

  if (existsSync(manifestDir)) {
    for (const f of readdirSync(manifestDir)) {
      if (!f.endsWith(".json")) continue;
      const full = join(manifestDir, f);
      const text = readFileSync(full, "utf8");
      let parsed: ComponentManifest;
      try {
        parsed = JSON.parse(text) as ComponentManifest;
      } catch (err) {
        throw new Error(`Manifest ${full} is invalid JSON: ${(err as Error).message}`);
      }
      if (!parsed.name) {
        throw new Error(`Manifest ${full} is missing required field 'name'.`);
      }
      manifests.set(parsed.name, parsed);
    }
  }

  if (existsSync(componentsDir)) {
    for (const f of readdirSync(componentsDir)) {
      if (!f.endsWith(".tsx") && !f.endsWith(".ts") && !f.endsWith(".jsx") && !f.endsWith(".js")) continue;
      const name = basename(f).replace(/\.[^.]+$/, "");
      componentFiles.set(name, join(componentsDir, f));
    }
  }

  return { root: dir, manifests, componentFiles };
}

function findConfigDir(start: string): string | undefined {
  let cur = resolve(start);
  while (true) {
    const candidate = join(cur, ".pagecast");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(cur, "..");
    if (parent === cur) return undefined;
    cur = parent;
  }
}

export function listComponents(reg: Registry): ComponentManifest[] {
  return Array.from(reg.manifests.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

/** Concatenate every .css file under `.pagecast/styles/`, sorted by name. */
export function loadStyles(reg: Registry): string {
  const stylesDir = join(reg.root, "styles");
  if (!existsSync(stylesDir)) return "";
  const parts: string[] = [];
  for (const f of readdirSync(stylesDir).sort()) {
    if (!f.endsWith(".css")) continue;
    parts.push(readFileSync(join(stylesDir, f), "utf8"));
  }
  return parts.join("\n");
}
