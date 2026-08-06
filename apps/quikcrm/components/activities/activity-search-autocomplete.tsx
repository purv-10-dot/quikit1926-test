"use client";

import { useEffect, useRef, useState } from "react";
import { Search, User, Link2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounce";

// A selected suggestion. `kind === "owner"` filters the list by ownerId;
// otherwise it's a linked record and `kind` carries the record type used to set
// the Linked-to / Linked-record quick filters.
export type ActivitySuggestion =
  | { kind: "owner"; id: string; name: string }
  | { kind: "Lead" | "Contact" | "Account" | "Opportunity"; id: string; name: string };

interface SuggestResponse {
  success: boolean;
  data?: {
    owners: { id: string; name: string }[];
    records: { id: string; name: string; kind: "Lead" | "Contact" | "Account" | "Opportunity" }[];
  };
}

interface Props {
  /** Free-text value (also used as the plain search term when nothing is picked). */
  value: string;
  onChange: (value: string) => void;
  /** Fires when the user picks a suggestion from the dropdown. */
  onSelect: (s: ActivitySuggestion) => void;
  placeholder?: string;
}

export function ActivitySearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Search subject, outcome, notes…",
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [records, setRecords] = useState<
    { id: string; name: string; kind: "Lead" | "Contact" | "Account" | "Opportunity" }[]
  >([]);
  const [loading, setLoading] = useState(false);

  const debounced = useDebouncedValue(value, 250);

  // Fetch suggestions as the user types. Aborts stale requests so the dropdown
  // always reflects the latest query.
  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setOwners([]);
      setRecords([]);
      setLoading(false);
      return;
    }
    let ignore = false;
    setLoading(true);
    const params = new URLSearchParams({ q });
    void fetch(`/api/activities/suggestions?${params.toString()}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? (r.json() as Promise<SuggestResponse>) : null))
      .then((body) => {
        if (ignore) return;
        if (body?.success && body.data) {
          setOwners(body.data.owners);
          setRecords(body.data.records);
        } else {
          setOwners([]);
          setRecords([]);
        }
      })
      .catch(() => {
        if (!ignore) {
          setOwners([]);
          setRecords([]);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [debounced]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (s: ActivitySuggestion) => {
    onSelect(s);
    setOpen(false);
  };

  const hasSuggestions = owners.length > 0 || records.length > 0;
  const showDropdown = open && value.trim().length >= 2;

  return (
    <div ref={rootRef} className="relative min-w-[14rem] flex-1 sm:max-w-md">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
        size={14}
      />
      <Input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="pl-8"
        data-testid="activities-search"
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown"
          data-testid="activities-suggestions"
        >
          {loading && !hasSuggestions ? (
            <div className="px-3 py-2 text-xs text-crm-muted">Searching…</div>
          ) : !hasSuggestions ? (
            <div className="px-3 py-2 text-xs text-crm-muted">No matches</div>
          ) : (
            <ul className="max-h-72 overflow-auto py-1" role="listbox">
              {owners.length > 0 && (
                <>
                  <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
                    Owners
                  </li>
                  {owners.map((o) => (
                    <li key={`owner:${o.id}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => pick({ kind: "owner", id: o.id, name: o.name })}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-crm-text hover:bg-crm-panel"
                      >
                        <User size={14} className="shrink-0 text-crm-muted" />
                        <span className="truncate">{o.name}</span>
                      </button>
                    </li>
                  ))}
                </>
              )}
              {records.length > 0 && (
                <>
                  <li className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-crm-muted">
                    Linked records
                  </li>
                  {records.map((r) => (
                    <li key={`${r.kind}:${r.id}`}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        onClick={() => pick({ kind: r.kind, id: r.id, name: r.name })}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-crm-text hover:bg-crm-panel"
                      >
                        <Link2 size={14} className="shrink-0 text-crm-muted" />
                        <span className="truncate">{r.name}</span>
                        <span className="ml-auto shrink-0 rounded-full bg-crm-panel px-1.5 py-0.5 text-[10px] font-medium text-crm-muted">
                          {r.kind}
                        </span>
                      </button>
                    </li>
                  ))}
                </>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
