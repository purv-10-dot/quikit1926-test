"use client";

import { useState } from "react";
import {
  Maximize2,
  Minimize2,
  Link2,
  Trash2,
} from "lucide-react";

/**
 * Shared chrome for every dashboard widget — Jira-style with a 3px blue
 * accent stripe at the top, a clean white title bar, and the standard
 * collapse/fullscreen/refresh/copy-link toolbar. In edit mode an extra
 * trash button appears.
 */
export function WidgetFrame({
  title,
  editing,
  onRemove,
  children,
}: {
  title: string;
  editing?: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // No `overflow-hidden` — child dropdowns (chart / filter pickers in the
  // project rows) need to escape the card's rounded clip. The blue accent
  // is rendered as a top border so it doesn't depend on overflow clipping.
  const containerCls = fullscreen
    ? "fixed inset-4 z-[80] bg-white border border-gray-200 border-t-[3px] border-t-blue-500 rounded-md shadow-2xl flex flex-col"
    : "bg-white border border-gray-200 border-t-[3px] border-t-blue-500 rounded-md";

  return (
    <section className={containerCls}>
      <div className="flex items-center justify-between px-4 py-2.5">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center gap-0.5 text-gray-500">
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="p-1 rounded hover:bg-gray-100"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            <Minimize2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="p-1 rounded hover:bg-gray-100"
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          {/* <button
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              void navigator.clipboard?.writeText(window.location.href);
            }}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="Copy link"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button> */}
          {editing && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded hover:bg-red-50 text-red-500"
              aria-label="Remove widget"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      {!collapsed && <div className={fullscreen ? "flex-1 overflow-y-auto" : ""}>{children}</div>}
    </section>
  );
}
