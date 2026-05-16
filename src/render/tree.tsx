import { Fragment, ReactNode, createElement } from "react";
import { marked } from "marked";
import { ArtifactDocument, Block, ComponentBlock, ValidationError } from "../core/types.js";

export type ComponentMap = Record<string, React.ComponentType<any>>;

export interface RenderOptions {
  components: ComponentMap;
  /** Validation errors keyed by line+component, for inline placeholders. */
  errors?: ValidationError[];
  /** Components that should hydrate as client-side islands. */
  interactiveComponents?: Set<string>;
}

/** Build a React element tree from the artifact IR. */
export function renderDocument(doc: ArtifactDocument, opts: RenderOptions): ReactNode {
  const PageComp = opts.components.Page;
  const body = renderBlocksInContext(doc.blocks, {
    ...opts,
    islandCounter: { value: 0 },
    insideIsland: false,
  });
  if (PageComp) {
    const fm = doc.frontmatter || {};
    return createElement(
      PageComp,
      { title: fm.title, description: fm.description, theme: fm.theme },
      body
    );
  }
  return createElement(Fragment, null, body);
}

export function renderBlocks(blocks: Block[], opts: RenderOptions): ReactNode {
  return renderBlocksInContext(blocks, {
    ...opts,
    islandCounter: { value: 0 },
    insideIsland: false,
  });
}

interface RenderContext extends RenderOptions {
  islandCounter: { value: number };
  insideIsland: boolean;
}

function renderBlocksInContext(blocks: Block[], ctx: RenderContext): ReactNode {
  return blocks.map((b, i) => renderBlock(b, ctx, i));
}

function renderBlock(block: Block, ctx: RenderContext, key: number): ReactNode {
  if (block.kind === "markdown") {
    const html = marked.parse(block.text, { async: false }) as string;
    return createElement("div", {
      key,
      className: "pagecast-markdown",
      dangerouslySetInnerHTML: { __html: html },
    });
  }
  return renderComponentBlock(block, ctx, key);
}

function renderComponentBlock(
  block: ComponentBlock,
  ctx: RenderContext,
  key: number
): ReactNode {
  const Comp = ctx.components[block.name];
  const blockErrors = (ctx.errors ?? []).filter(
    (e) => e.component === block.name && e.line === block.loc.line
  );
  if (blockErrors.length > 0) {
    return createElement(
      "div",
      { key, className: "pagecast-error", role: "alert" },
      `${block.name} at ${block.loc.file ?? ""}:${block.loc.line}\n` +
        blockErrors.map((e) => `  ${e.message}` + (e.received !== undefined ? `\n    received ${JSON.stringify(e.received)}` : "")).join("\n")
    );
  }
  if (!Comp) {
    return createElement(
      "div",
      { key, className: "pagecast-error", role: "alert" },
      `Unknown component <${block.name}> at line ${block.loc.line}`
    );
  }
  const isIslandRoot =
    !ctx.insideIsland && !!ctx.interactiveComponents?.has(block.name);
  const childCtx: RenderContext = {
    ...ctx,
    insideIsland: ctx.insideIsland || isIslandRoot,
  };
  const children = block.slot.length > 0 ? renderBlocksInContext(block.slot, childCtx) : undefined;
  const element = createElement(Comp, { key, ...block.props }, children);
  if (!isIslandRoot) return element;
  const id = `island-${ctx.islandCounter.value++}`;
  return createElement("div", { key, "data-pagecast-island": id }, element);
}
