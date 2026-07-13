"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ComboboxOption = { value: string; label: string; hint?: string };

/**
 * A searchable single-select lookup. Drop-in replacement for a native <select>
 * where the option list can be long (customers, items, accounts, vendors…).
 * Closes on outside click; filters options by a type-ahead query.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches found.",
  disabled = false,
  className,
  id,
  createHref,
  createLabel,
  onCreate
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** When set, a "+ {createLabel}" entry opens this add form and returns here after saving. */
  createHref?: string;
  createLabel?: string;
  /** Inline create: called with the typed text, returns the new option's value (or null on failure). */
  onCreate?: (label: string) => Promise<string | null>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const goCreate = () => {
    setOpen(false);
    const here = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
    const sep = createHref!.includes("?") ? "&" : "?";
    router.push(`${createHref}${sep}return=${encodeURIComponent(here)}`);
  };

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || (o.hint ?? "").toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const canCreate = Boolean(onCreate) && trimmedQuery.length > 0 && !options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());

  const handleCreate = async () => {
    if (!onCreate || creating || !trimmedQuery) return;
    setCreating(true);
    try {
      const newValue = await onCreate(trimmedQuery);
      if (newValue) {
        onChange(newValue);
        setOpen(false);
        setQuery("");
      }
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-background px-3 text-left text-sm outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={cn("truncate", selected ? "" : "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-full min-w-[220px] overflow-hidden rounded-md border bg-popover shadow-md">
          <div className="flex items-center gap-2 border-b px-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-60 overflow-auto p-1">
            {filtered.length === 0 && !canCreate ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                  className={cn("flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted", o.value === value && "bg-primary/10 text-primary")}
                >
                  <span className="truncate">{o.label}</span>
                  {o.value === value ? <Check className="h-4 w-4 shrink-0" /> : null}
                </button>
              ))
            )}
          </div>
          {canCreate ? (
            <button type="button" onClick={handleCreate} disabled={creating} className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted disabled:opacity-60">
              <Plus className="h-4 w-4" />{creating ? "Adding…" : `${createLabel ?? "Add"} “${trimmedQuery}”`}
            </button>
          ) : createHref ? (
            <button type="button" onClick={goCreate} className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted">
              <Plus className="h-4 w-4" />{createLabel ?? "Add new"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
