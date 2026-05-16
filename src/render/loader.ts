import { build } from "esbuild";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Registry } from "../core/registry.js";
import { ComponentMap } from "./tree.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Package root: src/render/loader.ts -> ../.. */
function packageRoot(): string {
  return resolve(__dirname, "..", "..");
}

/** Cache directory under this package so bundled output can resolve react. */
function loaderCacheDir(): string {
  const dir = join(packageRoot(), "node_modules", ".pagecast");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve a `ComponentMap` for rendering.
 *
 * Bundles user `.tsx` files declared by the registry with esbuild and
 * imports the resulting ESM. Components not declared by the registry
 * render as unknown-component error placeholders.
 */
export async function loadComponentMap(registry: Registry): Promise<ComponentMap> {
  if (registry.componentFiles.size === 0) return {};

  const reexports: string[] = [];
  for (const [name, file] of registry.componentFiles) {
    reexports.push(`import ${name} from ${JSON.stringify(file)};`);
  }
  reexports.push(
    `export const __components = { ${Array.from(registry.componentFiles.keys()).join(", ")} };`
  );

  const tmpDir = loaderCacheDir();
  const entryFile = join(tmpDir, `entry-${process.pid}-${Date.now()}.mjs`);
  writeFileSync(entryFile, reexports.join("\n"));

  const result = await build({
    entryPoints: [entryFile],
    bundle: true,
    format: "esm",
    platform: "node",
    target: ["node18"],
    write: true,
    outfile: entryFile.replace(/\.mjs$/, ".bundle.mjs"),
    jsx: "automatic",
    loader: { ".ts": "tsx", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx" },
    external: ["react", "react-dom", "react/jsx-runtime"],
    nodePaths: [join(packageRoot(), "node_modules")],
    logLevel: "silent",
  });

  if (result.errors?.length) {
    throw new Error("Failed to bundle user components: " + result.errors.map((e) => e.text).join("; "));
  }

  const mod = await import(pathToFileURL(entryFile.replace(/\.mjs$/, ".bundle.mjs")).href + `?t=${Date.now()}`);
  return (mod.__components ?? {}) as ComponentMap;
}

/**
 * Build a client-side hydration bundle for interactive components.
 * Produces a single self-contained <script> body that hydrates
 * islands marked with data-pagecast-island.
 *
 * Returns null when there is nothing to hydrate: no interactive
 * manifests, or no user component files to back them.
 */
export async function buildHydrationBundle(registry: Registry): Promise<string | null> {
  const interactiveNames: string[] = [];
  for (const m of registry.manifests.values()) {
    if (m.interactive) interactiveNames.push(m.name);
  }
  if (interactiveNames.length === 0) return null;
  if (registry.componentFiles.size === 0) return null;

  const tmpDir = loaderCacheDir();
  const entryFile = join(tmpDir, `hydrate-${process.pid}-${Date.now()}.tsx`);

  const importLines = Array.from(registry.componentFiles.entries()).map(
    ([n, f]) => `import ${n} from ${JSON.stringify(f)};`
  );
  const componentMap = `{ ${Array.from(registry.componentFiles.keys()).join(", ")} }`;
  const interactiveList = JSON.stringify(interactiveNames);

  const source = `
${importLines.join("\n")}
import { createElement, Fragment } from "react";
import { hydrateRoot } from "react-dom/client";

const components = ${componentMap};
const interactive = new Set(${interactiveList});

function buildTree(node) {
  if (node.kind === "markdown") {
    return createElement("div", { className: "pagecast-markdown", dangerouslySetInnerHTML: { __html: node.html } });
  }
  const Comp = components[node.name];
  if (!Comp) return createElement("div", { className: "pagecast-error" }, "Unknown component " + node.name);
  const children = node.slot && node.slot.length ? node.slot.map((c, i) => createElement(Fragment, { key: i }, buildTree(c))) : undefined;
  return createElement(Comp, node.props || {}, children);
}

function ready(fn){ if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

ready(() => {
  const dataEl = document.getElementById("pagecast-data");
  let payload;
  if (window.__PAGECAST_DATA__) {
    payload = window.__PAGECAST_DATA__;
  } else if (dataEl) {
    try { payload = JSON.parse(dataEl.textContent || "null"); } catch { return; }
  }
  if (!payload || !payload.islands) return;
  for (const island of payload.islands) {
    const el = document.querySelector("[data-pagecast-island=\\""+island.id+"\\"]");
    if (!el) continue;
    hydrateRoot(el, buildTree(island.node));
  }
});
`;

  writeFileSync(entryFile, source);

  const result = await build({
    entryPoints: [entryFile],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    write: false,
    jsx: "automatic",
    loader: { ".ts": "tsx", ".tsx": "tsx", ".js": "jsx", ".jsx": "jsx" },
    nodePaths: [join(packageRoot(), "node_modules")],
    minify: true,
    logLevel: "silent",
  });

  if (result.errors?.length) {
    throw new Error("Failed to build hydration bundle: " + result.errors.map((e) => e.text).join("; "));
  }
  return result.outputFiles[0]?.text ?? null;
}
