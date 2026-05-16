import { existsSync, readFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import yaml from "js-yaml";

/**
 * Read an artifact file and apply optional adjacent data bindings.
 *
 * Supported data files, in lookup order:
 *   reports/foo.artifact.md -> reports/foo.data.yaml
 *   reports/foo.artifact.md -> reports/foo.data.yml
 *   reports/foo.artifact.md -> reports/foo.data.json
 *   reports/layout.artifact.md -> reports/content.yaml
 *   reports/layout.artifact.md -> reports/content.json
 */
export function loadArtifactSource(file: string): string {
  const source = readFileSync(file, "utf8");
  const dataFile = findDataFile(file);
  if (!dataFile) return source;
  const data = loadDataFile(dataFile);
  return applyTemplateBindings(source, data, file);
}

export function applyTemplateBindings(
  source: string,
  data: unknown,
  file = "<input>"
): string {
  return source.replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_match, rawPath: string) => {
    const value = lookup(data, rawPath);
    if (value === undefined) {
      throw new Error(`${file}: missing template binding '${rawPath}'`);
    }
    if (Array.isArray(value) || (value && typeof value === "object")) {
      return JSON.stringify(value);
    }
    return String(value);
  });
}

function findDataFile(file: string): string | undefined {
  const dir = dirname(file);
  const base = basename(file).replace(/\.artifact\.md$|\.md$/, "");
  const candidates = [
    join(dir, `${base}.data.yaml`),
    join(dir, `${base}.data.yml`),
    join(dir, `${base}.data.json`),
    join(dir, "content.yaml"),
    join(dir, "content.yml"),
    join(dir, "content.json"),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function loadDataFile(file: string): unknown {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".json")) return JSON.parse(text);
  return yaml.load(text, { schema: yaml.CORE_SCHEMA });
}

function lookup(data: unknown, path: string): unknown {
  let cur: unknown = data;
  for (const part of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(part)) {
      cur = cur[Number(part)];
      continue;
    }
    if (typeof cur === "object" && part in cur) {
      cur = (cur as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return cur;
}
