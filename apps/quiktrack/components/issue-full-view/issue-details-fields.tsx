"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Search, User as UserIcon } from "lucide-react";
import type { Priority } from "./types";
import {
  PRIORITY_META,
  avatarColor,
  userInitials,
  memberName,
  useOutsideClose,
  type FieldMember,
} from "./issue-field-utils";

/**
 * Inline-editable controls for the right-rail Details panel. Each field is a
 * small click-to-edit popover/input that commits via the supplied callback
 * (the panel turns that into a `PATCH /api/issues/[id]`). Shared helpers live
 * in `issue-field-utils.ts` so this file stays under the 300 LOC ceiling.
 */

export function AssigneeField({
  members,
  value,
  onChange,
}: {
  members: FieldMember[];
  value: string | null;
  onChange: (userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));
  const searchRef = useRef<HTMLInputElement>(null);
  const current = members.find((m) => m.userId === value);

  // Reset the query and focus the search box each time the menu opens.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = members
    .filter((m) => m.user)
    .filter((m) => !q || memberName(m.user).toLowerCase().includes(q));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded px-1 py-0.5 hover:bg-gray-100"
      >
        {current?.user ? (
          <>
            <span
              className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
              style={{ background: avatarColor(current.userId) }}
            >
              {userInitials(current.user)}
            </span>
            <span className="text-gray-800">{memberName(current.user)}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-gray-500">
            <UserIcon className="h-4 w-4" />
            Unassigned
          </span>
        )}
      </button>
      {open && (
        // Right-aligned so it opens toward the panel interior — the trigger sits
        // at the right edge of the details rail, so a left-aligned menu was cut
        // off by the viewport.
        <div className="absolute right-0 top-full mt-1 w-60 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-md shadow-lg z-40 py-1">
          <div className="px-2 pb-1">
            <div className="flex items-center gap-1.5 border border-gray-200 rounded px-2 h-7 focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400">
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="flex-1 text-xs bg-transparent focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {!q && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
              >
                <span className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center">
                  <UserIcon className="h-3 w-3 text-gray-500" />
                </span>
                Unassigned
              </button>
            )}
            {filtered.map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => {
                  onChange(m.userId);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                  m.userId === value ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <span
                  className="h-5 w-5 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                  style={{ background: avatarColor(m.userId) }}
                >
                  {userInitials(m.user)}
                </span>
                <span className="truncate">{memberName(m.user)}</span>
                {m.userId === value && <Check className="h-3 w-3 ml-auto shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-gray-400">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PriorityField({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (p: Priority) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));
  // `priority` is unconstrained in the DB, so an unmapped value must not crash
  // the whole details panel — fall back to Medium for display.
  const P = PRIORITY_META[value] ?? PRIORITY_META.MEDIUM;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-100 ${P.color}`}
      >
        <P.Icon className="h-4 w-4" />
        {P.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-36 bg-white border border-gray-200 rounded-md shadow-lg z-40 py-1">
          {(Object.keys(PRIORITY_META) as Priority[]).map((p) => {
            const m = PRIORITY_META[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                  p === value ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <m.Icon className={`h-3.5 w-3.5 ${m.color}`} />
                {m.label}
                {p === value && <Check className="h-3 w-3 ml-auto" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SprintField({
  sprints,
  value,
  onChange,
}: {
  sprints: { id: string; name: string }[];
  value: string | null;
  onChange: (sprintId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useOutsideClose<HTMLDivElement>(open, () => setOpen(false));
  const searchRef = useRef<HTMLInputElement>(null);
  const current = sprints.find((s) => s.id === value);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = sprints.filter((s) => !q || s.name.toLowerCase().includes(q));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1 py-0.5 hover:bg-gray-100 text-blue-600"
      >
        {current?.name ?? "None"}
      </button>
      {open && (
        // Right-aligned so it opens toward the panel interior instead of off the
        // right edge of the details rail.
        <div className="absolute right-0 top-full mt-1 w-60 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-md shadow-lg z-40 py-1">
          <div className="px-2 pb-1">
            <div className="flex items-center gap-1.5 border border-gray-200 rounded px-2 h-7 focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400">
              <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sprints…"
                className="flex-1 text-xs bg-transparent focus:outline-none"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {!q && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full px-2.5 py-1.5 text-xs text-left text-gray-700 hover:bg-gray-50"
              >
                None
              </button>
            )}
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center px-2.5 py-1.5 text-xs text-left hover:bg-gray-50 ${
                  s.id === value ? "bg-blue-50 text-blue-700" : "text-gray-700"
                }`}
              >
                <span className="truncate">{s.name}</span>
                {s.id === value && <Check className="h-3 w-3 ml-auto shrink-0" />}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-gray-400">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function DateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
}) {
  const ymd = value ? new Date(value).toISOString().slice(0, 10) : "";
  return (
    <input
      type="date"
      value={ymd}
      onChange={(e) => {
        const v = e.target.value;
        onChange(v ? new Date(`${v}T00:00:00.000Z`).toISOString() : null);
      }}
      className="bg-transparent text-xs text-gray-800 rounded px-1 py-0.5 hover:bg-gray-100 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  );
}

export function NumberField({
  value,
  suffix,
  onCommit,
}: {
  value: number | null;
  suffix?: string;
  onCommit: (n: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const trimmed = draft.trim();
          const n = trimmed === "" ? null : Number(trimmed);
          if (n === null || !Number.isNaN(n)) onCommit(n);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 text-xs text-gray-800 rounded px-1 py-0.5 border border-blue-400 focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value != null ? String(value) : "");
        setEditing(true);
      }}
      className="rounded px-1 py-0.5 hover:bg-gray-100 text-gray-700"
    >
      {value != null ? `${value}${suffix ?? ""}` : "None"}
    </button>
  );
}
