import React from "react";

export interface NumbersProps {
  eyebrow?: string;
  items: Array<{
    value: string;
    accent?: boolean;
    label: string;
    sub: string;
  }>;
}

export default function Numbers({ eyebrow, items }: NumbersProps) {
  return (
    <section className="section numbers">
      <div className="page">
        {eyebrow ? <div className="eyebrow numbers__eyebrow">{eyebrow}</div> : null}
        <div className="numbers__strip" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
          {items.map((n, i) => (
            <div key={i} className="numbers__cell">
              <div className={`numbers__value${n.accent ? " numbers__value--accent" : ""}`}>
                {n.value}
              </div>
              <div className="numbers__label">{n.label}</div>
              <div className="numbers__sub">{n.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
