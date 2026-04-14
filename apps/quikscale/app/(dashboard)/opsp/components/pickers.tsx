"use client";

/**
 * OPSP picker primitives — extracted from the 2225-line `page.tsx` monolith
 * in R6. These components are presentational + stateful but use only
 * imported hooks/utils, so they can live in their own file.
 *
 * Exports:
 *   - `WithTooltip`    — downward-positioned text tooltip used across OPSP
 *   - `OwnerSelect`    — avatar-initials user picker (uses `useUsers` hook)
 *   - `QuarterDropdown` — Q1-Q4 selector with radio-button styling
 */

import { useState, useMemo, useRef, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsers } from "@/lib/hooks/useUsers";

export function WithTooltip({
  content,
  children,
  className = "relative min-w-0",
}: {
  content: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const hasContent = !!(content && content.trim());
  return (
    <div
      className={className}
      onMouseEnter={() => hasContent && setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && hasContent && (
        <div className="absolute top-full left-0 mt-2 z-[9999] bg-gray-900 text-white text-xs rounded-lg px-3 py-2 max-w-sm whitespace-pre-wrap shadow-2xl pointer-events-none min-w-[120px]">
          <span className="absolute bottom-full left-4 w-0 h-0 border-x-4 border-x-transparent border-b-4 border-b-gray-900" />
          {content}
        </div>
      )}
    </div>
  );
}

export function OwnerSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: users = [] } = useUsers();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 208 });
  const [flipUp, setFlipUp] = useState(false);

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const flip = spaceBelow < 280;
    setFlipUp(flip);
    if (flip) {
      setDropPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left, width: 208 });
    } else {
      setDropPos({ top: rect.bottom + 4, left: rect.left, width: 208 });
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const { fullName, initials } = useMemo(() => {
    if (!value) return { fullName: "", initials: "" };
    const u = users.find((u) => u.id === value);
    if (!u) return { fullName: value, initials: value.slice(0, 2).toUpperCase() };
    const full = `${u.firstName} ${u.lastName}`;
    const init = `${u.firstName[0] ?? ""}${u.lastName[0] ?? ""}`.toUpperCase();
    return { fullName: full, initials: init };
  }, [users, value]);

  return (
    <div className="relative w-full min-w-0">
      <WithTooltip content={open ? "" : fullName} className="relative block w-full">
        <button
          ref={triggerRef}
          onClick={() => {
            if (!open) computePosition();
            setOpen((o) => !o);
            setSearch("");
          }}
          className="w-full flex items-center justify-between border border-gray-200 rounded px-2 py-1.5 text-sm bg-white hover:bg-gray-50"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-left",
              fullName ? "text-gray-700 font-medium" : "text-gray-400",
            )}
          >
            {initials || "Owner"}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        </button>
      </WithTooltip>
      {open && (
        <>
          <div className="fixed inset-0 z-[209]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[210] bg-white border border-gray-200 rounded-lg shadow-lg py-1"
            style={{
              width: dropPos.width,
              left: dropPos.left,
              ...(flipUp ? { bottom: dropPos.bottom } : { top: dropPos.top }),
            }}
          >
            <div className="px-2 pb-1 pt-1">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>
            <div className="max-h-44 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">No users found.</p>
              )}
              {filtered.map((u) => {
                const fullName = `${u.firstName} ${u.lastName}`;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      onChange(u.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50",
                      value === u.id && "text-accent-600 font-medium",
                    )}
                  >
                    <span className="block truncate">{fullName}</span>
                    <span className="block text-[10px] text-gray-400 truncate">
                      {u.email}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function QuarterDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
  const LABELS = ["Quarter 01", "Quarter 02", "Quarter 03", "Quarter 04"];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 border-l border-gray-300 hover:bg-gray-50 min-w-[64px] justify-between"
      >
        {value} <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl border border-gray-100 w-52 p-3">
            <div className="space-y-1">
              {QUARTERS.map((q, i) => (
                <button
                  key={q}
                  onClick={() => {
                    onChange(q);
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      value === q
                        ? "border-accent-600 bg-accent-600"
                        : "border-gray-300",
                    )}
                  >
                    {value === q && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <span
                    className={cn(
                      "text-sm",
                      value === q ? "text-gray-900 font-medium" : "text-gray-600",
                    )}
                  >
                    {LABELS[i]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
