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
 *   ::Name             open
 *   <YAML props>       props (until first blank line, close, marker, or next open)
 *   <blank line>       anonymous slot separator (only if slot body follows)
 *   <slot body>        markdown + nested components
 *   ---slotName---     named slot marker (alternative to anonymous slot)
 *   <slot body>        raw text; fence-stripped if exactly one fenced code block
 *   ::/Name            close (always named)
 *
 * Modes are mutually exclusive per block: if any `---name---` marker appears
 * before the matching close, the block is in named-slot mode and all content
 * between markers is captured as raw string props. Otherwise it falls back
 * to anonymous-slot mode (blank-line separator + recursive child blocks).
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
const SLOT_MARKER = /^---([A-Za-z][A-Za-z0-9_-]*)---\s*$/;

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

  // Decide mode by peeking ahead until the matching close at column 0.
  // If any `---slotName---` appears before that close, use named-slot mode.
  // (We only scan for the FIRST `::/<name>` — named-slot bodies are raw text,
  //  so nested same-name components are not supported in this mode.)
  const namedSlotPlan = planNamedSlots(state, name, openLineIndex);
  if (namedSlotPlan) {
    return readNamedSlotBlock(state, name, openLineIndex, namedSlotPlan);
  }

  return readAnonymousSlotBlock(state, name, openLineIndex);
}

interface NamedSlotPlan {
  /** Index of the matching `::/Name` line in state.lines. */
  closeIdx: number;
  /** Sorted line indices (in state.lines) of every `---slotName---` marker. */
  markerIdxs: number[];
}

function planNamedSlots(
  state: ReaderState,
  name: string,
  openLineIndex: number
): NamedSlotPlan | null {
  // Rule: a block is in named-slot mode iff the FIRST non-blank line after
  // its prop region is a `---slotName---` marker. Markers that appear later
  // (in markdown content or inside a nested ::Other block) do not flip the
  // mode — they are just text in whatever slot/anonymous body they sit in.
  //
  // Walk the prop region first: any non-blank, non-marker, non-open,
  // non-close line is treated as YAML props. Stop on the first interesting
  // line, then skip blanks, then look at what we landed on.

  let scanI = state.i;

  while (scanI < state.lines.length) {
    const ln = state.lines[scanI] ?? "";
    if (
      BLANK_LINE.test(ln) ||
      SLOT_MARKER.test(ln) ||
      OPEN_LINE.test(ln) ||
      CLOSE_NAMED.test(ln)
    ) {
      break;
    }
    scanI++;
  }

  while (scanI < state.lines.length && BLANK_LINE.test(state.lines[scanI] ?? "")) {
    scanI++;
  }

  if (scanI >= state.lines.length) return null;
  if (!SLOT_MARKER.test(state.lines[scanI] ?? "")) return null;

  // Named-slot mode confirmed. Collect every marker until the matching close.
  // Inside the body we never recurse, so a stray `::/${name}` literally
  // inside slot text would prematurely close — this is the documented
  // sharp edge for named-slot mode.
  const markerIdxs: number[] = [];
  for (let j = scanI; j < state.lines.length; j++) {
    const ln = state.lines[j] ?? "";
    const closeMatch = ln.match(CLOSE_NAMED);
    if (closeMatch && closeMatch[1] === name) {
      return { closeIdx: j, markerIdxs };
    }
    if (SLOT_MARKER.test(ln)) markerIdxs.push(j);
  }

  // Walked past EOF without finding the matching close.
  throw parseError(
    state,
    openLineIndex,
    `Missing ::/${name} — component opened but never closed`
  );
}

function readNamedSlotBlock(
  state: ReaderState,
  name: string,
  openLineIndex: number,
  plan: NamedSlotPlan
): ComponentBlock {
  const { closeIdx, markerIdxs } = plan;
  const firstMarker = markerIdxs[0]!;

  // Prop region: lines between open and the first marker, trailing blanks stripped.
  const propLines: string[] = [];
  for (let j = state.i; j < firstMarker; j++) {
    propLines.push(state.lines[j] ?? "");
  }
  while (propLines.length > 0 && BLANK_LINE.test(propLines[propLines.length - 1]!)) {
    propLines.pop();
  }
  const yamlProps = parseYamlProps(propLines.join("\n"), name, state, openLineIndex);

  // Each marker → named slot, captured as raw text.
  const slotProps: Record<string, string> = {};
  for (let k = 0; k < markerIdxs.length; k++) {
    const markerIdx = markerIdxs[k]!;
    const markerMatch = SLOT_MARKER.exec(state.lines[markerIdx] ?? "")!;
    const slotName = markerMatch[1]!;
    const bodyStart = markerIdx + 1;
    const bodyEnd = k + 1 < markerIdxs.length ? markerIdxs[k + 1]! : closeIdx;

    const bodyLines: string[] = [];
    for (let j = bodyStart; j < bodyEnd; j++) {
      bodyLines.push(state.lines[j] ?? "");
    }
    while (bodyLines.length > 0 && BLANK_LINE.test(bodyLines[0]!)) bodyLines.shift();
    while (bodyLines.length > 0 && BLANK_LINE.test(bodyLines[bodyLines.length - 1]!)) {
      bodyLines.pop();
    }
    const text = stripFence(bodyLines.join("\n"));

    if (slotName in slotProps) {
      throw parseError(
        state,
        markerIdx,
        `Duplicate slot "${slotName}" in ${name} — each slot may appear only once`
      );
    }
    slotProps[slotName] = text;
  }

  // Slot props override YAML props of the same key. Validator catches the
  // semantic mismatch if both were specified; we don't second-guess here.
  const props = { ...yamlProps, ...slotProps };

  state.i = closeIdx + 1;

  return {
    kind: "component",
    name,
    props,
    slot: [],
    loc: locOf(state, openLineIndex),
  };
}

function readAnonymousSlotBlock(
  state: ReaderState,
  name: string,
  openLineIndex: number
): ComponentBlock {
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

/**
 * Strip a single surrounding fenced code block. The body must start with
 * ```optional-lang on its own line and end with ``` on its own line, with
 * no interior fence lines. Anything else is returned unchanged.
 */
function stripFence(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 2) return text;
  if (!/^```[\w-]*\s*$/.test(lines[0]!)) return text;
  if (!/^```\s*$/.test(lines[lines.length - 1]!)) return text;
  const middle = lines.slice(1, -1);
  if (middle.some((ln) => /^```/.test(ln))) return text;
  return middle.join("\n");
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
