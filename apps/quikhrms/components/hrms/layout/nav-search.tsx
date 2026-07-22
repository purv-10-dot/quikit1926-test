"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Search, User, Building2, Briefcase, UserSearch, ClipboardList, FileText, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface SearchHit {
  type: "employee" | "department" | "designation" | "candidate" | "requisition" | "document";
  id: string;
  label: string;
  sub?: string | null;
  href: string;
}

const ICON = {
  employee: User,
  department: Building2,
  designation: Briefcase,
  candidate: UserSearch,
  requisition: ClipboardList,
  document: FileText,
} as const;

/** Global top-bar search — debounced type-ahead over employees / departments / designations. */
export function NavSearch() {
  const api = useApiClient();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Debounce input → query key (250ms) so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const enabled = debounced.length >= 2;
  const { data, isFetching } = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => api.get<SearchHit[]>(`/api/v1/hrms/search?q=${encodeURIComponent(debounced)}`),
    enabled,
    staleTime: 30_000,
  });
  const hits = data?.data ?? [];

  useEffect(() => { setActive(0); }, [debounced]);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery("");
    router.push(hit.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (!hits.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const h = hits[active]; if (h) go(h); }
  };

  const showPanel = open && enabled;

  return (
    <div ref={ref} className="relative hidden md:block">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search anything..."
        aria-label="Search employees, departments and designations"
        className="w-64 pl-9 pr-3 py-2 rounded-full text-sm bg-white ring-1 ring-gray-200 focus:ring-green-300 focus:outline-none placeholder:text-gray-400"
      />

      {showPanel && (
        <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          {isFetching && hits.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-xs text-gray-500 justify-center">
              <Loader2 size={14} className="animate-spin" /> Searching…
            </div>
          ) : hits.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-gray-500">
              No results for &ldquo;{debounced}&rdquo;
            </div>
          ) : (
            <div className="max-h-96 overflow-auto py-1">
              {hits.map((h, i) => {
                const Icon = ICON[h.type];
                return (
                  <button
                    key={`${h.type}-${h.id}`}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(h)}
                    className={clsx(
                      "w-full flex items-center gap-3 px-3 py-2 text-left transition",
                      i === active ? "bg-green-50" : "hover:bg-slate-50",
                    )}
                  >
                    <span className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-gray-500">
                      <Icon size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-gray-900 truncate">{h.label}</span>
                      {h.sub && <span className="block text-[11px] text-gray-500 truncate">{h.sub}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
