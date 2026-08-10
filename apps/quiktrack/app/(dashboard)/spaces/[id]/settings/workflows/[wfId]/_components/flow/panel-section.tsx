"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";

/**
 * A Jira-style collapsible panel section: a header row (title + subtitle, an
 * optional count badge, a chevron and a `+` add button) over collapsible body
 * content. Used for Restrict / Validate / Perform / Incoming / Outgoing, etc.
 */
export function PanelSection({
  title,
  subtitle,
  count,
  onAdd,
  disabled,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  count?: number;
  onAdd?: () => void;
  disabled?: boolean;
  badge?: string;
  defaultOpen?: boolean;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-md border border-gray-200 ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => !disabled && setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
          disabled={disabled}
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="flex-1">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              {title}
              {typeof count === "number" && count > 0 && (
                <span className="rounded bg-accent-100 px-1.5 text-[10px] font-semibold text-accent-700">
                  {count}
                </span>
              )}
              {badge && (
                <span className="rounded bg-gray-100 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                  {badge}
                </span>
              )}
            </span>
            {subtitle && <span className="mt-0.5 block text-xs text-gray-500">{subtitle}</span>}
          </span>
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            disabled={disabled}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed"
            title={`Add ${title.toLowerCase()}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && children && <div className="border-t border-gray-100 px-3 py-2.5">{children}</div>}
    </div>
  );
}
