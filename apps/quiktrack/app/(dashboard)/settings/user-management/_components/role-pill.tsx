"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Shield } from "lucide-react";
import { roleDisplayName } from "./role-name";

interface RoleOption {
  id: string;
  name: string;
  isSystem?: boolean;
  isDefault?: boolean;
}

/**
 * Compact pill that shows the current role name and opens a dropdown to
 * switch. Options are passed in by the parent (already fetched from
 * /api/org/roles). The pill renders the role name plain — no native
 * <select> element — so it matches the reference UI.
 */
export function RolePill({
  currentRoleId,
  currentRoleName,
  options,
  onChange,
  disabled,
}: {
  currentRoleId: string | null;
  currentRoleName: string | null;
  options: RoleOption[];
  onChange: (roleId: string | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Compute portal position relative to the trigger every time the menu
  // opens — this lets the dropdown escape the table's overflow:hidden
  // wrapper and flip upward when it would clip the viewport bottom.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const menuHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 16 && rect.top > menuHeight + 16;
    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      openUp,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onScroll() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const label = currentRoleName ? roleDisplayName(currentRoleName) : "—";
  const isAdmin = (currentRoleName ?? "").toLowerCase() === "admin";

  const baseStyle = isAdmin
    ? "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100/70 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-400/30 dark:hover:bg-blue-500/25"
    : currentRoleId
      ? "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-700/60 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
      : "bg-white text-gray-400 border-dashed border-gray-300 hover:bg-gray-50 dark:bg-gray-800/40 dark:text-gray-400 dark:border-gray-600 dark:hover:bg-gray-700/60";

  const menu =
    open && coords && typeof window !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              minWidth: 220,
              zIndex: 1000,
            }}
            className="bg-white border border-gray-200 rounded-xl shadow-[0_12px_32px_-10px_rgba(15,23,42,0.18),0_4px_12px_-4px_rgba(15,23,42,0.08)] overflow-hidden"
          >
            <div className="px-3.5 pt-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
              Assign role
            </div>
            <div className="py-1 max-h-72 overflow-y-auto">
              {options.map((r) => {
                const active = r.id === currentRoleId;
                const isAdminRow = r.name.toLowerCase() === "admin";
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onChange(r.id);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${
                      active
                        ? "bg-blue-50/70 text-blue-700"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Shield
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isAdminRow
                          ? "text-amber-500"
                          : active
                            ? "text-blue-500"
                            : "text-gray-400"
                      }`}
                    />
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {roleDisplayName(r.name)}
                    </span>
                    {r.isSystem && (
                      <span className="text-[9px] uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                        system
                      </span>
                    )}
                    {r.isDefault && !r.isSystem && (
                      <span className="text-[9px] uppercase tracking-wider text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        default
                      </span>
                    )}
                    {active && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                  </button>
                );
              })}
              {options.length === 0 && (
                <p className="px-3 py-3 text-xs text-gray-400">No roles defined yet.</p>
              )}
            </div>
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-left text-gray-500 hover:bg-gray-50"
              >
                <span>Clear role</span>
                {currentRoleId === null && <Check className="h-3.5 w-3.5 text-blue-600" />}
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 min-w-[96px] justify-between text-[12px] font-medium rounded-md border transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : baseStyle
        }`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3 w-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {menu}
    </div>
  );
}
