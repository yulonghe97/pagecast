// Intermediate Representation (IR) — produced by the parser, consumed by
// validator and renderer. Pure JSON; no React or DOM types.

export interface SourceLocation {
  file?: string;
  /** 1-based line number where the block begins. */
  line: number;
  /** 1-based column number. */
  column: number;
}

export type Block = MarkdownBlock | ComponentBlock;

export interface MarkdownBlock {
  kind: "markdown";
  text: string;
  loc: SourceLocation;
}

export interface ComponentBlock {
  kind: "component";
  name: string;
  props: Record<string, unknown>;
  /** Nested artifact blocks for slot content. */
  slot: Block[];
  loc: SourceLocation;
}

export interface ArtifactDocument {
  frontmatter: Record<string, unknown>;
  blocks: Block[];
  /** Source file path, if known. */
  file?: string;
}

export interface ComponentManifest {
  name: string;
  import: string;
  description?: string;
  tags?: string[];
  interactive?: boolean;
  slots?: Record<string, { type: "markdown"; required?: boolean }>;
  propsSchema?: Record<string, unknown>;
  examples?: string[];
}

export interface ValidationError {
  file?: string;
  line: number;
  column: number;
  component: string;
  /** JSON-pointer-ish path inside the component's props. */
  path: string;
  message: string;
  received?: unknown;
  expected?: string;
}

export interface ParseError {
  file?: string;
  line: number;
  column: number;
  message: string;
}

export class ArtifactError extends Error {
  errors: (ParseError | ValidationError)[];
  constructor(errors: (ParseError | ValidationError)[]) {
    super(`Artifact validation failed (${errors.length} error${errors.length === 1 ? "" : "s"}).`);
    this.errors = errors;
  }
}
