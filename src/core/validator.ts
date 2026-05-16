import Ajv, { ErrorObject } from "ajv";
import {
  ArtifactDocument,
  Block,
  ComponentBlock,
  ValidationError,
} from "./types.js";
import { Registry } from "./registry.js";

const ajv = new Ajv({ allErrors: true, strict: false, verbose: true });

/** Validate every component block in the document against its manifest. */
export function validateArtifact(
  doc: ArtifactDocument,
  registry: Registry
): ValidationError[] {
  const errors: ValidationError[] = [];
  walk(doc.blocks, (block) => {
    if (block.kind !== "component") return;
    const manifest = registry.manifests.get(block.name);
    if (!manifest) {
      errors.push({
        file: block.loc.file,
        line: block.loc.line,
        column: block.loc.column,
        component: block.name,
        path: "",
        message: `Unknown component "${block.name}". ${suggest(block.name, registry)}`,
      });
      return;
    }
    if (!manifest.propsSchema) return;
    const validate = compile(block.name, manifest.propsSchema);
    const ok = validate(block.props ?? {});
    if (!ok && validate.errors) {
      for (const err of validate.errors) {
        errors.push(toValidationError(block, err));
      }
    }
  });
  return errors;
}

const compileCache = new Map<string, ReturnType<typeof ajv.compile>>();

function compile(name: string, schema: Record<string, unknown>) {
  const cached = compileCache.get(name);
  if (cached) return cached;
  const v = ajv.compile(schema);
  compileCache.set(name, v);
  return v;
}

function walk(blocks: Block[], fn: (b: Block) => void): void {
  for (const b of blocks) {
    fn(b);
    if (b.kind === "component") walk(b.slot, fn);
  }
}

function toValidationError(
  block: ComponentBlock,
  err: ErrorObject
): ValidationError {
  const instancePath = err.instancePath.replace(/^\//, "").replace(/\//g, ".");
  let path = instancePath;
  let message: string;
  let expected: string | undefined;
  if (err.keyword === "required") {
    const required = (err.params as { missingProperty?: string }).missingProperty;
    path = required ? (instancePath ? `${instancePath}.${required}` : required) : instancePath;
    message = `${block.name}.${path} is required`;
    expected = "present";
  } else if (err.keyword === "enum") {
    const allowed = (err.params as { allowedValues?: unknown[] }).allowedValues ?? [];
    expected = allowed.map((v) => JSON.stringify(v)).join(" | ");
    message = `${block.name}.${path} must be one of: ${expected}`;
  } else if (err.keyword === "type") {
    const type = (err.params as { type?: string }).type;
    expected = String(type);
    message = `${block.name}.${path} must be of type ${type}`;
  } else if (err.keyword === "minimum" || err.keyword === "maximum") {
    const limit = (err.params as { limit?: number }).limit;
    expected = `${err.keyword} ${limit}`;
    message = `${block.name}.${path} ${err.message ?? ""}`;
  } else if (err.keyword === "additionalProperties") {
    const extra = (err.params as { additionalProperty?: string }).additionalProperty;
    path = instancePath ? `${instancePath}.${extra}` : (extra ?? path);
    message = `${block.name}.${path} is not a recognized prop`;
    expected = "no extra props";
  } else {
    message = `${block.name}.${path || "<root>"} ${err.message ?? "invalid"}`;
  }

  return {
    file: block.loc.file,
    line: block.loc.line,
    column: block.loc.column,
    component: block.name,
    path,
    message,
    received: err.data,
    expected,
  };
}

function suggest(name: string, registry: Registry): string {
  const names = Array.from(registry.manifests.keys());
  let best: { name: string; score: number } | null = null;
  for (const n of names) {
    const score = similarity(name.toLowerCase(), n.toLowerCase());
    if (!best || score > best.score) best = { name: n, score };
  }
  if (best && best.score > 0.5) return `Did you mean "${best.name}"?`;
  return `Known components: ${names.join(", ")}`;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  if (longer.length === 0) return 1;
  const distance = levenshtein(longer, shorter);
  return (longer.length - distance) / longer.length;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function formatError(e: ValidationError): string {
  const loc = `${e.file ?? "<input>"}:${e.line}:${e.column}`;
  const received =
    e.received === undefined ? "" : `\n  Received: ${JSON.stringify(e.received)}`;
  return `${loc}\n  ${e.message}${received}`;
}
