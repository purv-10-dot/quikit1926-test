"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, User as UserIcon } from "lucide-react";
import {
  PRIORITY_META,
  userLabel,
  type IssueStatus,
  type ListIssue,
  type Priority,
  type UserLite,
} from "./list-types";

const PRIORITY_VALUES: Priority[] = ["HIGHEST", "HIGH", "MEDIUM", "LOW", "LOWEST"];

/**
 * Dropdown panel rendered in a portal, fixed at the trigger's position — so it
 * escapes any scrolling/overflow container (e.g. the wide filter/list tables)
 * instead of being clipped. Closes on outside-click, Escape, scroll, or resize.
 */
function PopoverPanel({
  triggerRef,
  onClose,
  className,
  children,
}: {
  triggerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    setPos({ left: r.left, top: r.bottom + 4 });
  }, [triggerRef]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Any scroll/resize invalidates the fixed position → just close.
    function onReposition() {
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [triggerRef, onClose]);

  if (typeof document === "undefined" || !pos) return null;
  return createPortal(
    <div
      ref={panelRef}
      // Very high z-index so the dropdown floats OVER the table (and any modal
      // the table lives in) rather than being covered by it.
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 9999 }}
      className={className}
    >
      {children}
    </div>,
    document.body,
  );
}

// ── Status ───────────────────────────────────────────────────────────────────

export function StatusEditor({
  value,
  statuses,
  onChange,
}: {
  value: ListIssue["status"];
  statuses: IssueStatus[];
  onChange: (statusId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium hover:ring-1 hover:ring-gray-300"
        style={value ? { backgroundColor: `${value.color}20`, color: value.color } : { backgroundColor: "#f3f4f6", color: "#9ca3af" }}
      >
        {value?.name ?? "—"}
      </button>
      {open && (
        <PopoverPanel
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          className="w-48 rounded border border-gray-200 bg-white py-1 shadow-lg"
        >
          {statuses.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { onChange(s.id); setOpen(false); }}
              className="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-gray-50"
            >
              <span
                className="inline-flex items-center rounded px-2 py-0.5 font-medium"
                style={{ backgroundColor: `${s.color}20`, color: s.color }}
              >
                {s.name}
              </span>
              {value?.id === s.id && <Check className="h-3 w-3 text-gray-500" />}
            </button>
          ))}
        </PopoverPanel>
      )}
    </div>
  );
}

// ── Priority ─────────────────────────────────────────────────────────────────

export function PriorityEditor({
  value,
  onChange,
}: {
  value: Priority | null;
  onChange: (next: Priority | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const meta = value ? PRIORITY_META[value] : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-xs font-medium ${meta?.color ?? "text-gray-400"} hover:underline`}
      >
        {meta?.label ?? "—"}
      </button>
      {open && (
        <PopoverPanel
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          className="w-36 rounded border border-gray-200 bg-white py-1 shadow-lg"
        >
          {PRIORITY_VALUES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { onChange(p); setOpen(false); }}
              className="flex w-full items-center justify-between px-2 py-1 text-left text-xs hover:bg-gray-50"
            >
              <span className={`font-medium ${PRIORITY_META[p].color}`}>{PRIORITY_META[p].label}</span>
              {value === p && <Check className="h-3 w-3 text-gray-500" />}
            </button>
          ))}
        </PopoverPanel>
      )}
    </div>
  );
}

// ── Assignee ─────────────────────────────────────────────────────────────────

export function AssigneeEditor({
  value,
  members,
  onChange,
}: {
  value: ListIssue["assignee"];
  members: { userId: string; user: UserLite | null }[];
  onChange: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);

  const filtered = members
    .filter((m): m is typeof m & { user: UserLite } => Boolean(m.user))
    .filter((m) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return userLabel(m.user).toLowerCase().includes(q) || m.user.email.toLowerCase().includes(q);
    });

  const initials = value
    ? (value.firstName?.[0] ?? value.email[0] ?? "?").toUpperCase() +
      (value.lastName?.[0] ?? "").toUpperCase()
    : "";

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 min-w-0 rounded px-1 py-0.5 hover:bg-gray-100"
      >
        {value ? (
          value.avatar ? (
            <img src={value.avatar} alt="" className="h-6 w-6 flex-shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-accent-600 text-[10px] font-medium text-white">
              {initials}
            </span>
          )
        ) : (
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-50 text-gray-400">
            <UserIcon className="h-3 w-3" />
          </span>
        )}
        <span className={`truncate text-sm ${value ? "text-gray-700" : "text-gray-400"}`}>
          {value ? userLabel(value) : "Unassigned"}
        </span>
      </button>
      {open && (
        <PopoverPanel
          triggerRef={triggerRef}
          onClose={() => setOpen(false)}
          className="w-64 rounded border border-gray-200 bg-white shadow-lg"
        >
          <input
            autoFocus
            type="text"
            placeholder="Search members…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-t border-b border-gray-200 px-2 py-1.5 text-sm focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-gray-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 bg-gray-50 text-gray-400">
                <UserIcon className="h-3 w-3" />
              </span>
              <span className="text-gray-500">Unassigned</span>
              {value === null && <Check className="ml-auto h-3 w-3 text-gray-500" />}
            </button>
            {filtered.map((m) => {
              const u = m.user;
              const init =
                (u.firstName?.[0] ?? u.email[0] ?? "?").toUpperCase() +
                (u.lastName?.[0] ?? "").toUpperCase();
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-gray-50"
                >
                  {u.avatar ? (
                    <img src={u.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-600 text-[10px] font-medium text-white">
                      {init}
                    </span>
                  )}
                  <span className="truncate text-gray-700">{userLabel(u)}</span>
                  {value?.id === u.id && <Check className="ml-auto h-3 w-3 text-gray-500" />}
                </button>
              );
            })}
            {filtered.length === 0 && search && (
              <p className="px-2 py-2 text-xs text-gray-400">No matches</p>
            )}
          </div>
        </PopoverPanel>
      )}
    </div>
  );
}

// ── Generic single-value popover editor (input swap on click) ────────────────

interface CellInputProps {
  initialValue: string;
  type: "text" | "number" | "date";
  onCommit: (raw: string) => void;
  onCancel: () => void;
  className?: string;
}

function CellInput({ initialValue, type, onCommit, onCancel, className }: CellInputProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select?.();
  }, []);
  return (
    <input
      ref={inputRef}
      type={type}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(value); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      className={`w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 ${className ?? ""}`}
    />
  );
}

export function TextEditor({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <CellInput
        type="text"
        initialValue={value}
        onCommit={(raw) => {
          setEditing(false);
          const trimmed = raw.trim();
          if (trimmed && trimmed !== value) onChange(trimmed);
        }}
        onCancel={() => setEditing(false)}
        className={className}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`block w-full truncate rounded px-1 py-0.5 text-left hover:bg-gray-100 ${className ?? ""}`}
    >
      {value || <span className="text-gray-400">{placeholder ?? "—"}</span>}
    </button>
  );
}

export function NumberEditor({
  value,
  onChange,
  unit,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  unit?: string;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <CellInput
        type="number"
        initialValue={value == null ? "" : String(value)}
        onCommit={(raw) => {
          setEditing(false);
          const trimmed = raw.trim();
          if (trimmed === "") {
            if (value !== null) onChange(null);
            return;
          }
          const n = Number(trimmed);
          if (!Number.isFinite(n)) return;
          if (n !== value) onChange(n);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full rounded px-1 py-0.5 text-left text-xs hover:bg-gray-100"
    >
      {value != null ? `${value}${unit ?? ""}` : <span className="text-gray-400">—</span>}
    </button>
  );
}

export function DateEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (nextIso: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const dateOnly = value ? value.slice(0, 10) : "";
  if (editing) {
    return (
      <CellInput
        type="date"
        initialValue={dateOnly}
        onCommit={(raw) => {
          setEditing(false);
          if (!raw) {
            if (value !== null) onChange(null);
            return;
          }
          const iso = new Date(raw).toISOString();
          if (iso !== value) onChange(iso);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }
  const fmt = (() => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  })();
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="block w-full rounded px-1 py-0.5 text-left text-xs hover:bg-gray-100"
    >
      {fmt ?? <span className="text-gray-400">—</span>}
    </button>
  );
}
