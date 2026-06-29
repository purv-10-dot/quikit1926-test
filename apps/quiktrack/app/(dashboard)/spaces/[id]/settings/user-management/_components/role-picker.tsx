"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Shield } from "lucide-react";

interface PickerRole {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface Props {
  value: string | null;
  roles: PickerRole[];
  onChange: (next: string | null) => void;
  disabled?: boolean;
}

const POPOVER_W = 240;
const POPOVER_MAX_H = 280;

export function RolePicker({ value, roles, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const selected = roles.find((r) => r.id === value) ?? null;
  const label = selected
    ? `${selected.name}${selected.isDefault ? " (default)" : ""}`
    : "Unassigned";

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    function place() {
      const r = btnRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const flip = spaceBelow < POPOVER_MAX_H + 12 && r.top > spaceBelow;
      setPos({
        top: flip ? r.top - 4 : r.bottom + 4,
        left: Math.min(Math.max(8, r.left), window.innerWidth - POPOVER_W - 8),
        flip,
      });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center justify-between gap-2 min-w-[180px] text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
          selected
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
        } ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5 truncate">
          <Shield className={`h-3.5 w-3.5 ${selected ? "text-emerald-500" : "text-gray-400"}`} />
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted && open && pos &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            style={{
              position: "fixed",
              top: pos.flip ? undefined : pos.top,
              bottom: pos.flip ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width: POPOVER_W,
              maxHeight: POPOVER_MAX_H,
            }}
            className="z-[1000] bg-white rounded-md shadow-xl border border-gray-200 py-1 overflow-y-auto"
          >
            <Row
              label="Unassigned"
              sub="No project role"
              selected={!selected}
              onClick={() => pick(null)}
              neutral
            />
            <div className="my-1 border-t border-gray-100" />
            {roles.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No roles defined.</div>
            ) : (
              roles.map((r) => (
                <Row
                  key={r.id}
                  label={r.name}
                  sub={r.isDefault ? "Default for new members" : undefined}
                  selected={r.id === value}
                  onClick={() => pick(r.id)}
                />
              ))
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

function Row({
  label,
  sub,
  selected,
  onClick,
  neutral,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onClick: () => void;
  neutral?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`w-full text-left px-3 py-2 flex items-start gap-2 hover:bg-gray-50 ${
        selected ? "bg-emerald-50" : ""
      }`}
    >
      <Shield
        className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
          neutral ? "text-gray-300" : "text-emerald-500"
        }`}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-medium text-gray-900 truncate">{label}</span>
        {sub && <span className="block text-[11px] text-gray-500 truncate">{sub}</span>}
      </span>
      {selected && <Check className="h-3.5 w-3.5 text-emerald-600 mt-0.5" />}
    </button>
  );
}
