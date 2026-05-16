import React from "react";

export interface FooterProps {
  source?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  version?: string;
}

export default function Footer({ source, sourceLabel, sourceUrl, version }: FooterProps) {
  return (
    <footer className="page footer">
      <div className="footer__cell footer__brand">
        <span className="glyph" aria-hidden="true">❯❯</span> PAGE<span style={{ color: "var(--red)" }}>CAST</span>
      </div>
      <div className="footer__cell footer__cell--mid">
        {source ?? "rendered by pagecast"}
        {sourceUrl ? (
          <>
            {" · "}
            <a className="footer__link" href={sourceUrl}>{sourceLabel ?? "view source"}</a>
          </>
        ) : null}
      </div>
      <div className="footer__cell footer__cell--right">
        {version ?? "v0.1"}
      </div>
    </footer>
  );
}
