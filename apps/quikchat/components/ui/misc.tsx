import * as React from "react";

export function Badge({ count, className = "" }: { count: number; className?: string }) {
  return (
    <span className={`qc-badge ${className}`.trim()} aria-label={`${count} unread`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span className="qc-spinner" role="status" aria-label={label} />;
}

export function Divider() {
  return <hr className="qc-divider" />;
}

export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="qc-empty">
      {icon}
      <div className="qc-empty__title">{title}</div>
      {hint ? <div>{hint}</div> : null}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="qc-tooltip">
      {children}
      <span className="qc-tooltip__bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}
