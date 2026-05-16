import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { ArtifactDocument } from "../core/types.js";
import { renderDocument, ComponentMap } from "./tree.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STYLES_PATH = join(__dirname, "..", "components", "styles.css");

export interface ExportOptions {
  components: ComponentMap;
  /** Optional additional CSS to inline after the base stylesheet. */
  extraCss?: string;
  /** Optional doc title; defaults to frontmatter.title. */
  title?: string;
  /** Render with hydration island bundle for interactive components. */
  hydrationBundle?: string;
  /** IR JSON used by the hydration runtime; required when hydrationBundle is set. */
  hydrationData?: string;
  /** Components to wrap in hydration roots during server render. */
  interactiveComponents?: Set<string>;
  /** Emit a restrictive Content-Security-Policy meta tag. Defaults to true. */
  csp?: boolean;
}

/**
 * Render an artifact document to a single self-contained HTML string.
 *
 * No external assets are referenced. CSS is inlined. Hydration is
 * optional and embedded as a single <script> tag.
 */
export function exportToHtml(doc: ArtifactDocument, opts: ExportOptions): string {
  const tree = renderDocument(doc, {
    components: opts.components,
    interactiveComponents: opts.interactiveComponents,
  });
  const body = renderToString(
    createElement("div", { className: "pagecast-root", id: "pagecast-root" }, tree)
  );

  let css = "";
  try {
    css = readFileSync(STYLES_PATH, "utf8");
  } catch {
    css = "";
  }
  if (opts.extraCss) css += "\n" + opts.extraCss;

  const fm = doc.frontmatter || {};
  const title = opts.title ?? (typeof fm.title === "string" ? fm.title : "Untitled");

  const hydrationScript = opts.hydrationBundle && opts.hydrationData
    ? `window.__PAGECAST_DATA__=${escapeJsonForScript(opts.hydrationData)};\n${opts.hydrationBundle}`
    : "";
  const hydration = hydrationScript
    ? `<script>${hydrationScript}</script>`
    : "";
  const csp = opts.csp === false ? "" : `  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(cspContent(hydrationScript))}" />\n`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
${csp}\
  <meta name="generator" content="pagecast v0.1" />
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
</head>
<body>
  ${body}
  ${hydration}
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function escapeJsonForScript(s: string): string {
  // Prevent </script> escape and lone surrogates.
  return s.replace(/<\//g, "<\\/");
}

function cspContent(script: string): string {
  const scriptSrc = script
    ? `'sha256-${createHash("sha256").update(script).digest("base64")}'`
    : "'none'";
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'none'",
    "form-action 'none'",
    "img-src data:",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'unsafe-inline'",
  ].join("; ");
}
