import * as React from "react";

export function Menu({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="qc-menu" role="menu" aria-label={label}>
      {children}
    </div>
  );
}

export interface MenuItemProps {
  onSelect: () => void;
  children: React.ReactNode;
  /** Renders the item in the danger color (e.g. delete). */
  danger?: boolean;
  icon?: React.ReactNode;
}

export function MenuItem({ onSelect, children, danger, icon }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={`qc-menu-item${danger ? " qc-menu-item--danger" : ""}`}
      onClick={onSelect}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
