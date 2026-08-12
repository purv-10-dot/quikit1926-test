"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { apiGet } from "@/lib/client/fetcher";
import { cn } from "@/lib/utils";

/**
 * The one reusable value control (Data-Level Design §5) — the whole reason
 * "Rohit" shows up. Given a field's semantic type + valueSource it decides the
 * control: inline chips for status/dropdown, an async typeahead for dynamic
 * sources (people/reference/module records — loaded from GET /api/options), or a
 * plain input otherwise. Reused by conditions, trigger filters, and action params.
 */
export interface ValuePickerField {
  semanticType?: string;
  valueSource?: string | null;
  values?: string[] | null;
}

interface OptionItem {
  id: string;
  label: string;
  sublabel?: string;
}

const INPUT_CLS =
  "w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm";

export function ValuePicker({
  field,
  value,
  onChange,
  placeholder,
}: {
  field: ValuePickerField | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const source = field?.valueSource && field.valueSource !== "static" ? field.valueSource : null;
  const inline = field?.values && field.values.length ? field.values : null;

  // Inline enum (status / dropdown) → a simple select.
  if (inline) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT_CLS}>
        <option value="">Choose…</option>
        {inline.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    );
  }

  // Dynamic source (people / reference / module records) → async typeahead.
  if (source) {
    return <AsyncOptionSelect source={source} value={value} onChange={onChange} />;
  }

  // Free input (number / text / date).
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_CLS}
    />
  );
}

/** Typeahead that lazy-loads options from /api/options for a dynamic source. */
function AsyncOptionSelect({
  source,
  value,
  onChange,
}: {
  source: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Remember the chosen option's label so a selected id displays as a name.
  const [chosen, setChosen] = useState<OptionItem | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["options", source, search],
    queryFn: () =>
      apiGet<{ items: OptionItem[] }>(
        `/api/options?source=${encodeURIComponent(source)}&search=${encodeURIComponent(search)}`,
      ),
    enabled: open,
    staleTime: 30_000,
  });
  const items = data?.items ?? [];

  // A value is set → show a removable chip instead of the search box.
  if (value && (!open || chosen?.id === value)) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
        <span className="truncate text-sm">{chosen?.label ?? value}</span>
        <button
          type="button"
          aria-label="Clear"
          onClick={() => {
            onChange("");
            setChosen(null);
            setOpen(false);
          }}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        autoFocus={open}
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search…"
        className={INPUT_CLS}
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] shadow-lg">
          {isFetching ? (
            <p className="px-3 py-2 text-xs text-gray-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-500">No matches</p>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onChange(it.id);
                  setChosen(it);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent-50",
                )}
              >
                <span>{it.label}</span>
                {it.sublabel ? <span className="text-xs text-gray-500">{it.sublabel}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
