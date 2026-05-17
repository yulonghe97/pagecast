import React, { useState, useMemo } from "react";

export interface PlaygroundProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  /** Path to the demo artifact file, declared by the author. */
  demo: string;
  /** Registered component whose source/manifest fill the side tabs. */
  show: string;
  /** Filled by the engine from `demo` via the manifest's `derived` map. */
  initialArtifact: string;
  /** Filled by the engine from `show` via the manifest's `derived` map. */
  componentCode: string;
  /** Filled by the engine from `show` via the manifest's `derived` map. */
  manifestCode: string;
  hint?: string;
}

type Item = { label: string; status: string };
type ParseResult =
  | { ok: true; items: Item[] }
  | { ok: false; line: number; message: string; received?: string };

const STATUS_LABEL: Record<string, string> = {
  ready: "READY",
  blocked: "BLOCKED",
  warning: "AT RISK",
};
const ALLOWED_STATUS = ["ready", "blocked", "warning"];

function parseKV(text: string): { key: string; value: string } | null {
  const i = text.indexOf(":");
  if (i < 0) return null;
  return {
    key: text.slice(0, i).trim(),
    value: text.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
  };
}

function parseStatusGrid(src: string): ParseResult {
  const lines = src.split("\n");
  let openIdx = -1;
  let closeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === "::StatusGrid") openIdx = i;
    else if (t === "::/StatusGrid") closeIdx = i;
  }
  if (openIdx < 0) return { ok: false, line: 1, message: "expected ::StatusGrid directive at the top" };
  if (closeIdx < 0 || closeIdx <= openIdx) return { ok: false, line: lines.length || 1, message: "missing ::/StatusGrid close" };

  const inner = lines.slice(openIdx + 1, closeIdx);
  let i = 0;
  while (i < inner.length && inner[i].trim() === "") i++;
  if (!inner[i] || inner[i].trim() !== "items:") {
    return { ok: false, line: openIdx + 2, message: 'expected "items:" at the top of props' };
  }
  i++;

  const items: Item[] = [];
  let current: { label?: string; status?: string } | null = null;

  const flush = (lineNo: number): ParseResult | null => {
    if (!current) return null;
    if (!current.label) return { ok: false, line: lineNo, message: 'items.* missing required field "label"' };
    if (!current.status) return { ok: false, line: lineNo, message: 'items.* missing required field "status"' };
    items.push(current as Item);
    current = null;
    return null;
  };

  for (; i < inner.length; i++) {
    const raw = inner[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const absLine = openIdx + 1 + i + 1;

    if (trimmed.startsWith("- ")) {
      const err = flush(absLine);
      if (err) return err;
      current = {};
      const kv = parseKV(trimmed.slice(2));
      if (kv) applyField(current, kv, absLine);
    } else if (current) {
      const kv = parseKV(trimmed);
      if (kv) {
        const err = applyField(current, kv, absLine);
        if (err) return err;
      }
    }
  }
  {
    const err = flush(closeIdx + 1);
    if (err) return err;
  }

  if (items.length === 0) return { ok: false, line: openIdx + 2, message: "items: must contain at least one entry" };
  return { ok: true, items };

  function applyField(
    target: { label?: string; status?: string },
    kv: { key: string; value: string },
    absLine: number
  ): ParseResult | null {
    if (kv.key === "label") {
      target.label = kv.value;
      return null;
    }
    if (kv.key === "status") {
      if (!ALLOWED_STATUS.includes(kv.value)) {
        return {
          ok: false,
          line: absLine,
          message: 'status must be one of "ready" | "blocked" | "warning"',
          received: kv.value,
        };
      }
      target.status = kv.value;
      return null;
    }
    return null;
  }
}

function StatusGridDemo({ items }: { items: Item[] }) {
  return (
    <div className="pg-render">
      {items.map((it, i) => (
        <div key={i} className="pg-render__row">
          <span className="pg-render__label">{it.label}</span>
          <span className={`pg-render__tag pg-render__tag--${it.status}`}>
            {STATUS_LABEL[it.status] ?? it.status.toUpperCase()}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Playground({
  eyebrow,
  title,
  sub,
  demo,
  show,
  initialArtifact,
  componentCode,
  manifestCode,
  hint,
}: PlaygroundProps) {
  const [activeTab, setActiveTab] = useState<"artifact" | "component" | "manifest">("artifact");
  const [source, setSource] = useState(initialArtifact);
  const result = useMemo(() => parseStatusGrid(source), [source]);
  const demoLabel = demo.split("/").pop() ?? "demo.artifact.md";
  const componentLabel = `${show}.tsx`;
  const manifestLabel = `${show}.json`;

  return (
    <section className="section playground">
      <div className="page">
        <div className="playground__head">
          {eyebrow ? <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div> : null}
          <h2 className="playground__h2">{title}</h2>
          {sub ? <p className="playground__sub">{sub}</p> : null}
        </div>

        <div className="playground__frame">
          <div className="playground__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "artifact"}
              className={`playground__tab${activeTab === "artifact" ? " playground__tab--active" : ""}`}
              onClick={() => setActiveTab("artifact")}
            >
              <span className="playground__tab-dot" aria-hidden="true" />
              {demoLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "component"}
              className={`playground__tab${activeTab === "component" ? " playground__tab--active" : ""}`}
              onClick={() => setActiveTab("component")}
            >
              {componentLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "manifest"}
              className={`playground__tab${activeTab === "manifest" ? " playground__tab--active" : ""}`}
              onClick={() => setActiveTab("manifest")}
            >
              {manifestLabel}
            </button>
            <span className="playground__tab-spacer" />
            <span className="playground__tab-label">EDITABLE</span>
          </div>

          <div className="playground__split">
            <div className="playground__editor">
              {activeTab === "artifact" ? (
                <textarea
                  className="playground__textarea"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  aria-label="artifact source"
                />
              ) : (
                <pre className="playground__source">
                  {activeTab === "component" ? componentCode : manifestCode}
                </pre>
              )}
            </div>
            <div className="playground__preview">
              <div className="playground__preview-label">RENDERED OUTPUT</div>
              <div className="playground__rendered">
                {result.ok ? <StatusGridDemo items={result.items} /> : null}
              </div>
              {result.ok ? (
                <div className="playground__status playground__status--ok">
                  ✓ valid · {result.items.length} item{result.items.length === 1 ? "" : "s"}
                </div>
              ) : (
                <div className="playground__error">
                  <div className="playground__error-line">✗ {result.message}</div>
                  {result.received !== undefined ? (
                    <div className="playground__error-detail">Received: "{result.received}"</div>
                  ) : null}
                  <div className="playground__error-loc">at line {result.line}</div>
                </div>
              )}
            </div>
          </div>
          {hint ? <div className="playground__hint">{hint}</div> : null}
        </div>
      </div>
    </section>
  );
}
