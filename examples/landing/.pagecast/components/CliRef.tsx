import React from "react";

export interface CliRefProps {
  eyebrow?: string;
  title: string;
  commands: Array<{ name: string; args?: string; desc: string }>;
}

export default function CliRef({ eyebrow, title, commands }: CliRefProps) {
  return (
    <section className="section">
      <div className="page">
        <div className="cliref__head">
          {eyebrow ? <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div> : null}
          <h2 className="cliref__h2">{title}</h2>
        </div>
        <div className="cliref__list">
          {commands.map((c, i) => (
            <div key={i} className="cliref__row">
              <div className="cliref__cmd">
                npx pagecast {c.name}
                {c.args ? <span className="cliref__cmd-arg"> {c.args}</span> : null}
              </div>
              <div className="cliref__desc">{c.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
