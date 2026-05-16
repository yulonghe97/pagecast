import matter from "gray-matter";
import yaml from "js-yaml";
import {
  ArtifactDocument,
  Block,
  ComponentBlock,
  ParseError,
  SourceLocation,
} from "./types.js";

/**
 * Grammar (informal):
 *   ::Name           open
 *   <YAML props>     props (until first blank line, close, or next open)
 *   <blank line>     slot separator (only if slot body follows)
 *   <slot body>      markdown + nested components
 *   ::/Name          close (always named)
 */
export function parseArtifact(source: string, file?: string): ArtifactDocument {
  const fm = matter(source);
  const frontmatter = (fm.data ?? {}) as Record<string, unknown>;

  let bodyStartLine = 0;
  if (/^---\s*\r?\n/.test(source)) {
    const lines = source.split("\n");
    for (let i = 1; i < lines.length; i++) {
      if (/^---\s*$/.test(lines[i]!)) {
        bodyStartLine = i + 1;
        break;
      }
    }
  }

  const body = fm.content;
  const blocks = parseBlocks(body, bodyStartLine, file);

  return { frontmatter, blocks, file };
}

interface ReaderState {
  lines: string[];
  baseLine: number;
  i: number;
  file?: string;
}

const OPEN_LINE = /^::([A-Za-z][A-Za-z0-9_]*)\s*$/;
const CLOSE_NAMED = /^::\/([A-Za-z][A-Za-z0-9_]*)\s*$/;
const BARE_CLOSE = /^::\s*$/;
const BLANK_LINE = /^\s*$/;

function parseBlocks(
  body: string,
  baseLine: number,
  file: string | undefined
): Block[] {
  const state: ReaderState = {
    lines: body.split("\n"),
    baseLine,
    i: 0,
    file,
  };
  return readBlocksUntil(state, null);
}

/**
 * Read blocks until we hit either EOF or a close-line for `closer`.
 * `closer` is the component name we are inside (for slot parsing) or
 * null at the top level.
 */
function readBlocksUntil(state: ReaderState, closer: string | null): Block[] {
  const blocks: Block[] = [];
  let markdownBuffer: string[] = [];
  let markdownStart = state.i;

  const flushMarkdown = () => {
    if (markdownBuffer.length === 0) return;
    const text = markdownBuffer.join("\n").replace(/^\n+|\n+$/g, "");
    if (text.length > 0) {
      blocks.push({
        kind: "markdown",
        text,
        loc: locOf(state, markdownStart),
      });
    }
    markdownBuffer = [];
  };

  while (state.i < state.lines.length) {
    const line = state.lines[state.i] ?? "";

    const closeMatch = line.match(CLOSE_NAMED);
    if (closeMatch) {
      if (!closer) {
        throw parseError(
          state,
          state.i,
          `Unexpected close ::/${closeMatch[1]} — no matching open component`
        );
      }
      if (closeMatch[1] !== closer) {
        throw parseError(
          state,
          state.i,
          `Expected ::/${closer} but found ::/${closeMatch[1]}`
        );
      }
      state.i++;
      flushMarkdown();
      return blocks;
    }

    if (BARE_CLOSE.test(line)) {
      throw parseError(
        state,
        state.i,
        `Bare "::" close is not supported. Use "::/${closer ?? "Name"}" to close a component.`
      );
    }

    const openMatch = line.match(OPEN_LINE);
    if (openMatch) {
      flushMarkdown();
      const block = readComponentBlock(state, openMatch);
      blocks.push(block);
      markdownStart = state.i;
      continue;
    }

    if (markdownBuffer.length === 0) markdownStart = state.i;
    markdownBuffer.push(line);
    state.i++;
  }

  if (closer) {
    throw parseError(
      state,
      markdownStart,
      `Missing ::/${closer} — component opened but never closed`
    );
  }

  flushMarkdown();
  return blocks;
}

function readComponentBlock(
  state: ReaderState,
  openMatch: RegExpMatchArray
): ComponentBlock {
  const openLineIndex = state.i;
  const name = openMatch[1]!;
  state.i++; // consume the open line

  // Collect prop YAML lines until first blank line (= slot starts) or
  // the matching close. Encountering another `::Name` or `::/Other`
  // before a blank line is an error (props must be a contiguous block).
  const propLines: string[] = [];
  let hasSlot = false;

  while (state.i < state.lines.length) {
    const line = state.lines[state.i] ?? "";

    if (CLOSE_NAMED.test(line) || BARE_CLOSE.test(line)) {
      // close handled by caller after we return from prop collection
      break;
    }

    if (BLANK_LINE.test(line)) {
      hasSlot = true;
      state.i++; // consume the blank line separator
      break;
    }

    if (OPEN_LINE.test(line)) {
      throw parseError(
        state,
        state.i,
        `Nested component must be separated from ${name}'s props by a blank line`
      );
    }

    propLines.push(line);
    state.i++;
  }

  const yamlProps = parseYamlProps(propLines.join("\n"), name, state, openLineIndex);

  const slot: Block[] = hasSlot ? readBlocksUntil(state, name) : [];

  if (!hasSlot) {
    const close = state.lines[state.i] ?? "";
    const closeMatch = close.match(CLOSE_NAMED);
    if (closeMatch) {
      if (closeMatch[1] !== name) {
        throw parseError(
          state,
          state.i,
          `Expected ::/${name} but found ::/${closeMatch[1]}`
        );
      }
      state.i++;
    } else if (BARE_CLOSE.test(close)) {
      throw parseError(
        state,
        state.i,
        `Bare "::" close is not supported. Use "::/${name}" to close a component.`
      );
    } else {
      throw parseError(
        state,
        openLineIndex,
        `Missing ::/${name} — component opened but never closed`
      );
    }
  }

  return {
    kind: "component",
    name,
    props: yamlProps,
    slot,
    loc: locOf(state, openLineIndex),
  };
}

function parseYamlProps(
  text: string,
  name: string,
  state: ReaderState,
  openLineIndex: number
): Record<string, unknown> {
  const trimmed = text.trim();
  if (trimmed.length === 0) return {};
  try {
    const loaded = yaml.load(trimmed, { schema: yaml.CORE_SCHEMA });
    if (loaded == null) return {};
    if (typeof loaded !== "object" || Array.isArray(loaded)) {
      throw parseError(
        state,
        openLineIndex,
        `Component ${name} props must be a YAML mapping, got ${Array.isArray(loaded) ? "array" : typeof loaded}`
      );
    }
    return loaded as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && (err as { parseError?: ParseError }).parseError) {
      throw err;
    }
    const msg = err instanceof Error ? err.message : String(err);
    const hint = yamlColonHint(text, msg);
    throw parseError(
      state,
      openLineIndex,
      `Component ${name} props could not be parsed as YAML: ${msg}${hint}`
    );
  }
}

/**
 * If a YAML parse error looks like an unquoted ':' in a value, return a
 * fix hint. Otherwise return ''.
 */
function yamlColonHint(text: string, errMsg: string): string {
  // js-yaml errors tend to look like "mapping values are not allowed in this context"
  // or "bad indentation" when a value contains an unquoted ':'.
  const triggers = [
    "mapping values are not allowed",
    "bad indentation",
    "expected a single document",
    "unexpected end of the stream",
  ];
  if (!triggers.some((t) => errMsg.includes(t))) return "";

  // Find first line that has `key: value : more` (unquoted second colon)
  // or any value that contains an unquoted ':'.
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/);
    if (!m) continue;
    const value = m[2]!;
    // Already quoted — skip.
    if (/^["'].*["']\s*$/.test(value)) continue;
    if (value.includes(":")) {
      const key = m[1]!;
      const safe = value.replace(/"/g, '\\"');
      return `\n  Hint: line "${line.trim()}" contains an unquoted ':'. Try:\n    ${key}: "${safe}"`;
    }
  }
  return "";
}

function locOf(state: ReaderState, idx: number): SourceLocation {
  return {
    file: state.file,
    line: state.baseLine + idx + 1,
    column: 1,
  };
}

function parseError(
  state: ReaderState,
  idx: number,
  message: string
): Error & { parseError: ParseError } {
  const pe: ParseError = {
    file: state.file,
    line: state.baseLine + idx + 1,
    column: 1,
    message,
  };
  const err = new Error(message) as Error & { parseError: ParseError };
  err.parseError = pe;
  return err;
}
