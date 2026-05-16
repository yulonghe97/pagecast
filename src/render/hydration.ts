import { marked } from "marked";
import { ArtifactDocument, Block, ComponentBlock } from "../core/types.js";

export interface HydrationPayload {
  islands: Array<{ id: string; node: HydrationNode }>;
}

export type HydrationNode =
  | { kind: "markdown"; html: string }
  | {
      kind: "component";
      name: string;
      props: Record<string, unknown>;
      slot: HydrationNode[];
    };

export function collectHydrationPayload(
  doc: ArtifactDocument,
  interactiveComponents: Set<string>
): HydrationPayload {
  const islands: HydrationPayload["islands"] = [];
  let counter = 0;

  function walk(blocks: Block[], insideIsland: boolean): void {
    for (const block of blocks) {
      if (block.kind !== "component") continue;
      const isIslandRoot =
        !insideIsland && interactiveComponents.has(block.name);
      if (isIslandRoot) {
        islands.push({
          id: `island-${counter++}`,
          node: serializeComponent(block),
        });
        continue;
      }
      walk(block.slot, insideIsland || isIslandRoot);
    }
  }

  walk(doc.blocks, false);
  return { islands };
}

function serializeBlock(block: Block): HydrationNode {
  if (block.kind === "markdown") {
    return {
      kind: "markdown",
      html: marked.parse(block.text, { async: false }) as string,
    };
  }
  return serializeComponent(block);
}

function serializeComponent(block: ComponentBlock): HydrationNode {
  return {
    kind: "component",
    name: block.name,
    props: block.props,
    slot: block.slot.map(serializeBlock),
  };
}
