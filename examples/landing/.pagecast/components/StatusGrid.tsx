import React from "react";

export interface StatusGridItem {
  label: string;
  status: "ready" | "blocked" | "warning";
}

export interface StatusGridProps {
  items: StatusGridItem[];
}

const STATUS_LABEL: Record<StatusGridItem["status"], string> = {
  ready: "READY",
  blocked: "BLOCKED",
  warning: "AT RISK",
};

export default function StatusGrid({ items }: StatusGridProps) {
  return (
    <div className="status-grid">
      {items.map((it) => (
        <div key={it.label} className={`status-grid__row status-grid__row--${it.status}`}>
          <span className="status-grid__label">{it.label}</span>
          <span className={`status-grid__tag status-grid__tag--${it.status}`}>
            {STATUS_LABEL[it.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
