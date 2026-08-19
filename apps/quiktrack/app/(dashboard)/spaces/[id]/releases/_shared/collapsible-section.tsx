"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * A titled card whose body can be collapsed via a chevron next to the title
 * — matches Jira's release-detail sections (Related work / Designs / Work
 * items / the top description block), each independently collapsible.
 * Defaults open; state is local to the section (not persisted).
 */
export function CollapsibleSection({
  title,
  count,
  action,
  defaultOpen = true,
  bodyClassName,
  children,
}: {
  title: string;
  count?: number;
  /** Rendered on the right of the header, e.g. an "add" button. */
  action?: React.ReactNode;
  defaultOpen?: boolean;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-900"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {title}
          {count !== undefined && <span className="text-gray-400 font-normal">{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className={bodyClassName}>{children}</div>}
    </div>
  );
}
