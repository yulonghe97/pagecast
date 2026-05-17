import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";

import {
  ArtifactDocument,
  Block,
  ComponentBlock,
  ValidationError,
  DerivedSource,
} from "./types.js";
import { Registry } from "./registry.js";

export interface DeriveResult {
  /** Errors raised during derivation. Shaped like ValidationError for uniform CLI handling. */
  errors: ValidationError[];
}

/**
 * Walk the document and fill in derived props on each component block, in
 * place. Derived props override author-written props of the same name —
 * the manifest decided that prop is computed.
 *
 * Errors are collected and returned alongside the (mutated) document. The
 * caller decides whether to halt (typically yes — derivation failure means
 * the artifact references a missing file or unknown component).
 */
export function applyDerivations(
  doc: ArtifactDocument,
  registry: Registry,
  artifactPath: string | undefined
): DeriveResult {
  const errors: ValidationError[] = [];
  const artifactDir = artifactPath ? dirname(artifactPath) : process.cwd();

  walk(doc.blocks, (block) => {
    const manifest = registry.manifests.get(block.name);
    if (!manifest?.derived) return;
    for (const [targetProp, source] of Object.entries(manifest.derived)) {
      const result = resolve1(source, block, registry, artifactDir);
      if (result.ok) {
        block.props[targetProp] = result.value;
      } else {
        errors.push({
          file: block.loc.file,
          line: block.loc.line,
          column: block.loc.column,
          component: block.name,
          path: targetProp,
          message: `${block.name}.${targetProp} (derived from "${source.from}") could not be resolved: ${result.message}`,
          received: result.received,
        });
      }
    }
  });

  return { errors };
}

type ResolveResult =
  | { ok: true; value: string }
  | { ok: false; message: string; received?: unknown };

function resolve1(
  source: DerivedSource,
  block: ComponentBlock,
  registry: Registry,
  artifactDir: string
): ResolveResult {
  const key = block.props[source.via];
  if (typeof key !== "string" || key.length === 0) {
    return {
      ok: false,
      message: `prop "${source.via}" must be a non-empty string`,
      received: key,
    };
  }

  if (source.from === "file") {
    const abs = isAbsolute(key) ? key : resolve(artifactDir, key);
    if (!existsSync(abs)) {
      return { ok: false, message: `file not found: ${key}`, received: key };
    }
    try {
      return { ok: true, value: readFileSync(abs, "utf8") };
    } catch (err) {
      return {
        ok: false,
        message: `read failed: ${(err as Error).message}`,
        received: key,
      };
    }
  }

  if (source.from === "componentSource") {
    const file = registry.componentFiles.get(key);
    if (!file) {
      return {
        ok: false,
        message: `no registered component "${key}" (known: ${Array.from(registry.componentFiles.keys()).join(", ")})`,
        received: key,
      };
    }
    try {
      return { ok: true, value: readFileSync(file, "utf8") };
    } catch (err) {
      return {
        ok: false,
        message: `read failed for ${file}: ${(err as Error).message}`,
        received: key,
      };
    }
  }

  if (source.from === "componentManifest") {
    const manifest = registry.manifests.get(key);
    if (!manifest) {
      return {
        ok: false,
        message: `no manifest for "${key}"`,
        received: key,
      };
    }
    return { ok: true, value: JSON.stringify(manifest, null, 2) };
  }

  return {
    ok: false,
    message: `unknown resolver "from": ${(source as { from: string }).from}`,
  };
}

function walk(blocks: Block[], fn: (b: ComponentBlock) => void): void {
  for (const b of blocks) {
    if (b.kind === "component") {
      fn(b);
      walk(b.slot, fn);
    }
  }
}
