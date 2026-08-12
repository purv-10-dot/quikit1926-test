"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, User } from "lucide-react";
import type { OwnerOption } from "@/lib/cache/lead-form-lookups";

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_PALETTE = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-orange-500",
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]!;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-8 w-8 text-[13px]" : "h-6 w-6 text-[11px]";
  if (!name) {
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-slate-200 ${cls}`}>
        <User size={size === "md" ? 14 : 12} className="text-slate-500" />
      </span>
    );
  }
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${cls} ${avatarColor(name)}`}
    >
      {getInitials(name)}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  owners: OwnerOption[];
  ownersLoading: boolean;
  value: string;
  onChange: (id: string) => void;
  /** Fallback free-text value when no owners are loaded (e.g. no users API). */
  ownerNameRaw?: string;
  onOwnerNameRawChange?: (v: string) => void;
  error?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LeadOwnerPicker({
  owners,
  ownersLoading,
  value,
  onChange,
  ownerNameRaw = "",
  onOwnerNameRawChange,
  error,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);

  const selected = owners.find((o) => o.id === value) ?? null;

  // Filter owners by name or email.
  const filtered = query.trim()
    ? owners.filter(
        (o) =>
          o.name.toLowerCase().includes(query.toLowerCase()) ||
          o.email.toLowerCase().includes(query.toLowerCase()),
      )
    : owners;

  // Auto-focus search when dropdown opens.
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      setQuery("");
    }
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (ownersLoading) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-lg border border-crm-border bg-crm-panel/60 px-3 text-sm text-crm-muted">
        <Loader2 size={14} className="animate-spin text-crm-muted" />
        Loading owners…
      </div>
    );
  }

  // ── Text-only fallback (no users in system) ───────────────────────────────

  if (owners.length === 0) {
    return (
      <input
        type="text"
        value={ownerNameRaw}
        onChange={(e) => onOwnerNameRawChange?.(e.target.value)}
        placeholder="Enter owner name…"
        className={[
          "h-11 w-full rounded-lg border bg-white px-3 text-sm text-crm-text outline-none",
          "transition focus-visible:ring-2 focus-visible:ring-crm-blue-glow",
          error ? "border-red-400" : "border-crm-border",
        ].join(" ")}
      />
    );
  }

  // ── Searchable picker ─────────────────────────────────────────────────────

  return (
    <div className="relative" ref={wrapperRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={[
          "flex h-11 w-full items-center gap-2.5 rounded-lg border bg-white px-3",
          "text-left text-sm transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow",
          open
            ? "border-crm-blue ring-2 ring-crm-blue-glow"
            : error
            ? "border-red-400"
            : "border-crm-border hover:border-slate-400",
        ].join(" ")}
      >
        {selected ? (
          <>
            <Avatar name={selected.name} size="sm" />
            <span className="flex-1 truncate font-medium text-crm-text">
              {selected.name}
            </span>
          </>
        ) : (
          <>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <User size={12} className="text-slate-400" />
            </span>
            <span className="flex-1 truncate text-crm-muted">Select owner…</span>
          </>
        )}
        <ChevronDown
          size={15}
          className={[
            "shrink-0 text-crm-muted transition-transform duration-150",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className={[
            "absolute left-0 right-0 z-40 mt-1",
            "overflow-hidden rounded-xl border border-crm-border bg-white",
            "shadow-[0_8px_32px_rgba(15,23,42,0.12)]",
            "animate-in fade-in-0 zoom-in-95 duration-100 origin-top",
          ].join(" ")}
        >
          {/* Search input */}
          <div className="border-b border-crm-border/60 px-3 py-2.5">
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
              <Search size={13} className="shrink-0 text-crm-muted" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Users"
                className="min-w-0 flex-1 bg-transparent text-sm text-crm-text outline-none placeholder:text-crm-muted/70"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="text-crm-muted hover:text-crm-text"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <ul className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-crm-muted">
                No users match &ldquo;{query}&rdquo;
              </li>
            ) : (
              filtered.map((owner) => {
                const isSelected = owner.id === value;
                return (
                  <li key={owner.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelect(owner.id)}
                      className={[
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left",
                        "transition-colors hover:bg-slate-50",
                        isSelected ? "bg-blue-50" : "",
                      ].join(" ")}
                    >
                      <Avatar name={owner.name} size="md" />

                      {/* Text block */}
                      <div className="min-w-0 flex-1">
                        <p
                          className={[
                            "truncate text-sm leading-tight",
                            isSelected
                              ? "font-semibold text-blue-700"
                              : "font-medium text-crm-text",
                          ].join(" ")}
                        >
                          {owner.name}
                        </p>
                        {owner.email && (
                          <p className="truncate text-[11px] text-crm-muted">
                            {owner.email}
                          </p>
                        )}
                      </div>

                      {/* Checkmark for selected */}
                      {isSelected && (
                        <Check
                          size={15}
                          className="shrink-0 text-blue-600"
                          strokeWidth={2.5}
                        />
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
