"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, Search, Trash2, Lock, Globe, Building2, Users } from "lucide-react";

type Visibility = "private" | "org" | "space" | "user";

interface SavedFilter {
  id: string;
  name: string;
  description: string | null;
  visibility: Visibility;
  viewerIds: string[];
  starred: boolean;
  isOwner: boolean;
  ownerUserId: string;
  updatedAt: string;
}

const VISIBILITY_META: Record<Visibility, { icon: typeof Lock; label: string }> = {
  private: { icon: Lock, label: "Private" },
  org: { icon: Globe, label: "My organization" },
  space: { icon: Building2, label: "Space" },
  user: { icon: Users, label: "Specific users" },
};

/**
 * "View all filters" index — the caller's own + org-shared saved filters, in a
 * table (Name, Visibility, Starred). Owners can star/unstar and delete. Mirrors
 * Jira's Filters list, scoped to our simpler private/shared visibility model.
 */
export function SavedFiltersIndex() {
  const [filters, setFilters] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/saved-filters")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.success) setFilters(j.data ?? []);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? filters.filter((f) => f.name.toLowerCase().includes(query)) : filters;
  }, [filters, q]);

  async function toggleStar(f: SavedFilter) {
    const next = !f.starred;
    setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, starred: next } : x)));
    try {
      await fetch(`/api/saved-filters/${f.id}/star`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: next }),
      });
    } catch {
      setFilters((prev) => prev.map((x) => (x.id === f.id ? { ...x, starred: !next } : x)));
    }
  }

  async function remove(f: SavedFilter) {
    if (!confirm(`Delete filter "${f.name}"? This can't be undone.`)) return;
    const snapshot = filters;
    setFilters((prev) => prev.filter((x) => x.id !== f.id));
    try {
      const res = await fetch(`/api/saved-filters/${f.id}`, { method: "DELETE" });
      const j = await res.json();
      if (!j?.success) throw new Error();
    } catch {
      setFilters(snapshot);
    }
  }

  return (
    <div className="px-6 py-4">
      <h1 className="text-xl font-semibold text-gray-900 mb-4">Filters</h1>

      <div className="mb-4 relative w-64">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search filters"
          className="w-full pl-8 pr-3 h-8 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-left text-xs font-medium text-gray-600 uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 w-10"></th>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5 w-40">Visibility</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-sm">
                  Loading…
                </td>
              </tr>
            ) : shown.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No saved filters yet. Save one from a filter view.
                </td>
              </tr>
            ) : (
              shown.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleStar(f)}
                      disabled={!f.isOwner}
                      aria-label={f.starred ? "Unstar" : "Star"}
                      className="p-1 rounded hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          f.starred ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/filters/${f.id}`}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {f.name}
                    </Link>
                    {f.description && (
                      <p className="text-xs text-gray-400 truncate max-w-md">{f.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const meta = VISIBILITY_META[f.visibility];
                      const Icon = meta.icon;
                      const suffix =
                        (f.visibility === "space" || f.visibility === "user") && f.viewerIds.length
                          ? ` (${f.viewerIds.length})`
                          : "";
                      return (
                        <span className="inline-flex items-center gap-1.5 text-gray-600">
                          <Icon className="h-3.5 w-3.5 text-gray-400" />
                          {meta.label}{suffix}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {f.isOwner && (
                      <button
                        type="button"
                        onClick={() => remove(f)}
                        aria-label="Delete filter"
                        className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
