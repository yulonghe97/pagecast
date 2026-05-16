import React from "react";

export interface AgentsProps {
  eyebrow?: string;
  title: string;
  sub?: string;
  points: Array<{ title: string; body: string }>;
  termFile?: string;
  terminal: string;
}

function highlightTerminal(src: string): React.ReactNode[] {
  const lines = src.split("\n");
  return lines.map((line, i) => {
    let inner: React.ReactNode;
    if (line.startsWith("$ ")) {
      inner = (
        <span className="term__cmd">
          <span className="term__prompt">$</span> {line.slice(2)}
        </span>
      );
    } else if (line.startsWith("✗")) {
      inner = <span className="term__err">{line}</span>;
    } else if (line.startsWith("✓")) {
      inner = <span className="term__ok">{line}</span>;
    } else if (/^[\w./-]+:\d+:\d+/.test(line.trim())) {
      inner = <span className="term__loc">{line}</span>;
    } else if (line.trim().startsWith("—")) {
      inner = <span className="term__narrate">{line}</span>;
    } else {
      inner = <span>{line || " "}</span>;
    }
    return (
      <div
        key={i}
        className="term__line"
        style={{ animationDelay: `${0.18 + i * 0.16}s` }}
      >
        {inner}
      </div>
    );
  });
}

export default function Agents({ eyebrow, title, sub, points, termFile, terminal }: AgentsProps) {
  return (
    <section className="section agents">
      <div className="page agents__grid">
        <div className="agents__left">
          <div className="code term">
            <div className="code__head">
              <span className="code__dot" aria-hidden="true" />
              <span className="code__dot" aria-hidden="true" />
              <span className="code__dot" aria-hidden="true" />
              <span className="code__file">{termFile ?? "agent.log"}</span>
            </div>
            <pre className="code__body term__body">{highlightTerminal(terminal)}</pre>
          </div>
        </div>

        <div className="agents__right">
          {eyebrow ? <div className="eyebrow agents__eyebrow">{eyebrow}</div> : null}
          <h2 className="agents__h2">{title}</h2>
          {sub ? <p className="agents__sub">{sub}</p> : null}
          <ul className="agents__points">
            {points.map((p, i) => (
              <li key={i} className="agents__point">
                <span className="agents__arrow" aria-hidden="true">❯</span>
                <span className="agents__point-body">
                  <strong>{p.title}</strong> {p.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
