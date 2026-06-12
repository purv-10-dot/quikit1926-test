"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { Input } from "@/components/ui/input";

interface AccountOption {
  id: string;
  name: string;
}

/**
 * Multi-select account picker — fetches /api/accounts?q=, filters client-side
 * by selected ids, and emits the selected list to the parent.
 */
export function AccountPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);
  const [options, setOptions] = useState<AccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNames, setSelectedNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const url = debounced
      ? `/api/accounts/picker?q=${encodeURIComponent(debounced)}`
      : "/api/accounts/picker";
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (cancel) return;
        const items: AccountOption[] = Array.isArray(j?.data?.items)
          ? j.data.items.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }))
          : [];
        setOptions(items);
        // remember names for currently-selected ids that aren't in this page's options
        setSelectedNames((prev) => {
          const next = new Map(prev);
          for (const o of items) next.set(o.id, o.name);
          return next;
        });
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [debounced]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  return (
    <div>
      <Input
        placeholder="Search accounts…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-2"
      />
      <div className="max-h-64 overflow-y-auto rounded-lg border border-crm-border">
        {loading && options.length === 0 ? (
          <p className="px-3 py-3 text-sm text-crm-muted">Loading…</p>
        ) : options.length === 0 ? (
          <p className="px-3 py-3 text-sm text-crm-muted">No accounts match.</p>
        ) : (
          <ul>
            {options.map((opt) => (
              <li key={opt.id} className="border-b border-crm-border last:border-0">
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-crm-panel">
                  <input
                    type="checkbox"
                    checked={value.includes(opt.id)}
                    onChange={() => toggle(opt.id)}
                  />
                  <span>{opt.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <p className="mt-2 text-xs text-crm-muted">
          {value.length} selected: {value.map((id) => selectedNames.get(id) ?? id.slice(0, 6)).slice(0, 5).join(", ")}
          {value.length > 5 && ` +${value.length - 5} more`}
        </p>
      )}
    </div>
  );
}
