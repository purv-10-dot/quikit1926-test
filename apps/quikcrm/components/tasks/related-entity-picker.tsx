"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounce";

export type RelatedKind = "Lead" | "Opportunity" | "Contact" | "Account";

interface EntityOption {
  id: string;
  primary: string;
  secondary?: string;
}

interface Props {
  kind: RelatedKind | null;
  objectId: string | null;
  initialLabel?: string;
  onChange: (next: { kind: RelatedKind | null; objectId: string | null; label: string | null }) => void;
}

const KINDS: RelatedKind[] = ["Lead", "Opportunity", "Contact", "Account"];

/**
 * Hit the kind-specific search endpoint.
 *
 * Lead/Account/Contact use the unified /api/search; Opportunity has its own
 * GET that we extended with `?q=&limit=`. Each branch normalises the row
 * shape into { id, primary, secondary } so the dropdown is uniform.
 */
async function searchEntities(kind: RelatedKind, q: string): Promise<EntityOption[]> {
  if (kind === "Opportunity") {
    const res = await fetch(`/api/opportunities?q=${encodeURIComponent(q)}&limit=10`, {
      credentials: "include",
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = Array.isArray(json?.items) ? json.items : [];
    return items.map((o: { id: string; title: string; stage?: string }) => ({
      id: o.id,
      primary: o.title,
      secondary: o.stage ?? undefined,
    }));
  }
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json();
  if (kind === "Lead") {
    const items = Array.isArray(json?.leads) ? json.leads : [];
    return items.map((l: { id: string; name: string; company?: string | null; stage?: string | null }) => ({
      id: l.id,
      primary: l.name,
      secondary: l.company || l.stage || undefined,
    }));
  }
  if (kind === "Account") {
    const items = Array.isArray(json?.accounts) ? json.accounts : [];
    return items.map((a: { id: string; name: string; industry?: string | null }) => ({
      id: a.id,
      primary: a.name,
      secondary: a.industry || undefined,
    }));
  }
  // Contact
  const items = Array.isArray(json?.contacts) ? json.contacts : [];
  return items.map(
    (c: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }) => ({
      id: c.id,
      primary: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.email || c.id,
      secondary: c.email || undefined,
    }),
  );
}

export function RelatedEntityPicker({ kind, objectId, initialLabel, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  // Pinned label for the currently-selected row so the input shows its name
  // even before the search dropdown is opened.
  const [selectedLabel, setSelectedLabel] = useState<string | null>(initialLabel ?? null);
  const debounced = useDebouncedValue(query, 200);

  useEffect(() => {
    setSelectedLabel(initialLabel ?? null);
  }, [initialLabel]);

  useEffect(() => {
    if (!kind || !open || debounced.trim().length < 2) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchEntities(kind, debounced.trim())
      .then((opts) => {
        if (!cancelled) setOptions(opts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, debounced, open]);

  const radioRow = useMemo(
    () => (
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <label
            key={k}
            className={
              "inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition " +
              (kind === k
                ? "border-crm-blue bg-crm-blue/10 text-crm-blue"
                : "border-crm-border text-crm-text hover:border-crm-blue/40")
            }
          >
            <input
              type="radio"
              className="hidden"
              name="related-kind"
              checked={kind === k}
              onChange={() => onChange({ kind: k, objectId: null, label: null })}
            />
            {k}
          </label>
        ))}
        <button
          type="button"
          onClick={() => onChange({ kind: null, objectId: null, label: null })}
          className={
            "inline-flex items-center gap-1 rounded-lg border border-crm-border px-3 py-1.5 text-xs text-crm-muted hover:border-red-300 hover:text-red-600 " +
            (kind === null ? "bg-slate-50" : "")
          }
        >
          <X size={12} /> None
        </button>
      </div>
    ),
    [kind, onChange],
  );

  return (
    <div className="space-y-2">
      {radioRow}
      {kind && (
        <div className="relative">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-crm-muted" />
            <input
              className="crm-input flex-1"
              placeholder={
                objectId && selectedLabel
                  ? selectedLabel
                  : `Search ${kind}s by name${kind === "Contact" ? " or email" : ""}…`
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
            />
            {objectId && (
              <button
                type="button"
                onClick={() => onChange({ kind, objectId: null, label: null })}
                className="crm-btn-ghost h-8 w-8 p-0"
                title="Clear selection"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {open && (loading || options.length > 0) && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-crm-border bg-white shadow-lg">
              {loading ? (
                <div className="px-3 py-2 text-xs text-crm-muted">Searching…</div>
              ) : (
                <ul className="max-h-60 overflow-auto py-1">
                  {options.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onChange({ kind, objectId: o.id, label: o.primary });
                          setSelectedLabel(o.primary);
                          setQuery("");
                          setOpen(false);
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
                      >
                        <span className="font-medium text-crm-text">{o.primary}</span>
                        {o.secondary && <span className="text-crm-muted">{o.secondary}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {objectId && selectedLabel && !open && (
            <p className="mt-1 text-xs text-crm-muted">
              Selected: <span className="text-crm-text">{selectedLabel}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
