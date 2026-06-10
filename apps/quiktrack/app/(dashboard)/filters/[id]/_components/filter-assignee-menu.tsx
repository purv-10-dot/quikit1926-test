"use client";

import { useEffect, useState } from "react";
import { Search, Check } from "lucide-react";

interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

/**
 * People picker for the Assignee / Reporter filters. Searches the org
 * server-side (debounced) via `/api/users/search?q=` so we only fetch the
 * matches the user is looking for rather than the whole member list.
 */
export function AssigneeMenu({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (value: string, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/users/search?limit=20${query ? `&q=${encodeURIComponent(query)}` : ""}`)
        .then((r) => r.json())
        .then((j) => {
          if (alive && j?.success) setResults(j.data ?? []);
        })
        .catch(() => undefined)
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const query = q.trim().toLowerCase();
  // Pseudo-options only when not actively searching for a name.
  const pseudo = query
    ? []
    : [
        { value: "me", label: "Current User" },
        { value: "unassigned", label: "Unassigned" },
      ];
  const people = results.map((u) => ({
    value: u.id,
    label: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
  }));

  return (
    <div>
      <div className="px-2 pt-1 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search people…"
            className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {[...pseudo, ...people].map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value, o.label)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
              o.value === selected ? "text-blue-700 font-medium" : "text-gray-700"
            }`}
          >
            {o.value === selected ? (
              <Check className="h-3.5 w-3.5 text-blue-600" />
            ) : (
              <span className="h-3.5 w-3.5" />
            )}
            {o.label}
          </button>
        ))}
        {loading && (
          <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>
        )}
        {!loading && query && people.length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-400">No people found</div>
        )}
      </div>
    </div>
  );
}
