"use client";

/**
 * Generic export button with a CSV / Excel chooser.
 *
 * Forwards the current URL's search params to `<apiPath>?format=csv|xlsx&...`
 * so the user gets the same filter set they're looking at on screen.
 * Triggers a navigation download via `window.location` — never collects
 * the response in JS so the streaming response from the server reaches
 * the disk directly.
 *
 * Permission gating happens server-side (`reports.export`); when the
 * caller lacks it, the route returns 403 and the browser shows a JSON
 * error rather than a file. Hide the button via `disabled={true}` when
 * you already know the user can't export.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";

export interface ExportButtonProps {
  /** API path that supports `?format=csv` and `?format=xlsx`. Example: `/api/leads`. */
  apiPath: string;
  /** Disable the button (greys + tooltip). Use for missing permission. */
  disabled?: boolean;
  /** Tooltip when disabled. Defaults to "Export permission required". */
  disabledReason?: string;
  /** Visual size. `sm` matches in-toolbar buttons; `md` matches PageHeader actions. */
  size?: "sm" | "md";
}

type ExportFormat = "csv" | "xlsx";

export function ExportButton({
  apiPath,
  disabled = false,
  disabledReason = "Export permission required",
  size = "sm",
}: ExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const trigger = useCallback(
    (format: ExportFormat) => {
      if (busy || disabled) return;
      setBusy(true);
      setMenuOpen(false);
      const here = new URL(window.location.href);
      const target = new URL(apiPath, window.location.origin);
      here.searchParams.forEach((value, key) => {
        if (key === "format") return;
        target.searchParams.set(key, value);
      });
      target.searchParams.set("format", format);
      window.location.href = target.toString();
      window.setTimeout(() => setBusy(false), 3000);
    },
    [apiPath, busy, disabled],
  );

  const sizeCls =
    size === "md" ? "h-9 px-3 text-sm" : "h-8 px-2.5 text-xs";
  const iconSize = size === "md" ? 16 : 14;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <div className="inline-flex">
        <button
          type="button"
          onClick={() => trigger("csv")}
          disabled={disabled || busy}
          title={disabled ? disabledReason : "Export current view as CSV"}
          className={`inline-flex items-center gap-1.5 rounded-l-md border border-r-0 border-crm-border bg-white font-medium text-crm-fg transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${sizeCls}`}
        >
          <Download size={iconSize} />
          <span>{busy ? "Preparing…" : "Export CSV"}</span>
        </button>
        <button
          type="button"
          aria-label="More export formats"
          aria-expanded={menuOpen}
          onClick={() => !disabled && !busy && setMenuOpen((o) => !o)}
          disabled={disabled || busy}
          className={`inline-flex items-center rounded-r-md border border-crm-border bg-white px-1.5 text-crm-fg transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400 disabled:cursor-not-allowed disabled:opacity-50 ${
            size === "md" ? "h-9" : "h-8"
          }`}
        >
          <ChevronDown size={iconSize} />
        </button>
      </div>

      {menuOpen && !disabled && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-crm-border bg-white shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => trigger("csv")}
            className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent-50"
          >
            <Download size={14} className="mt-0.5 text-crm-muted" />
            <div>
              <div className="font-medium text-crm-text">CSV</div>
              <div className="text-[11px] text-crm-muted">Plain text, smaller file</div>
            </div>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => trigger("xlsx")}
            className="flex w-full items-start gap-2 border-t border-crm-border px-3 py-2 text-left text-sm hover:bg-accent-50"
          >
            <Download size={14} className="mt-0.5 text-crm-muted" />
            <div>
              <div className="font-medium text-crm-text">Excel (.xlsx)</div>
              <div className="text-[11px] text-crm-muted">Native types, frozen header</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
