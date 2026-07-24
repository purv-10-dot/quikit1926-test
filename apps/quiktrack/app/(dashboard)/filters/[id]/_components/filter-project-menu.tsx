"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Search } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

interface ProjectsResponse {
  success: boolean;
  data?: ProjectOption[];
  page?: number;
  totalPages?: number;
}

const PAGE_SIZE = 25;

/**
 * Project picker for the filter toolbar with SERVER-SIDE search + scroll
 * pagination. The old inline SingleSelect only ever loaded the first 50
 * projects and filtered them client-side, so orgs with more projects couldn't
 * reach the rest. Here the search box hits `/api/projects?search=` (debounced)
 * and scrolling to the bottom of the list fetches the next page.
 */
export function ProjectSelectMenu({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (value: string, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [items, setItems] = useState<ProjectOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Guards a stale response from overwriting a newer search's results.
  const reqIdRef = useRef(0);

  // Debounce the search box so each keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (nextPage: number, search: string, replace: boolean) => {
      const reqId = ++reqIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
          sort: "name",
          order: "asc",
        });
        if (search) params.set("search", search);
        const res = await fetch(`/api/projects?${params.toString()}`);
        const json = (await res.json()) as ProjectsResponse;
        // Ignore if a newer request has since started.
        if (reqId !== reqIdRef.current) return;
        if (!json.success) return;
        const rows = (json.data ?? []).map((p) => ({ id: p.id, name: p.name }));
        setItems((prev) => (replace ? rows : [...prev, ...rows]));
        setPage(json.page ?? nextPage);
        setTotalPages(json.totalPages ?? 1);
      } catch {
        // Leave the current list in place on a failed fetch.
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [],
  );

  // (Re)load from page 1 whenever the debounced query changes.
  useEffect(() => {
    void load(1, debouncedQ, true);
  }, [debouncedQ, load]);

  const hasMore = page < totalPages;

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      void load(page + 1, debouncedQ, false);
    }
  };

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
            placeholder="Search projects…"
            className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
      </div>
      <div ref={listRef} onScroll={onScroll} className="max-h-64 overflow-y-auto">
        {items.length === 0 && !loading ? (
          <div className="px-3 py-2 text-xs text-gray-400">No projects</div>
        ) : (
          items.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onPick(o.id, o.name)}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-gray-50 ${
                o.id === selected ? "text-blue-700 font-medium" : "text-gray-700"
              }`}
            >
              {o.id === selected ? (
                <Check className="h-3.5 w-3.5 text-blue-600" />
              ) : (
                <span className="h-3.5 w-3.5" />
              )}
              <span className="truncate">{o.name}</span>
            </button>
          ))
        )}
        {loading && (
          <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>
        )}
      </div>
    </div>
  );
}
