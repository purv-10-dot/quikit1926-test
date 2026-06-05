"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Star,
  MoreHorizontal,
  ArrowDown,
  ArrowUp,
} from "lucide-react";

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
}

interface Space {
  id: string;
  name: string;
  projectKey: string;
  icon?: string | null;
  color?: string | null;
  projectType?: string;
  status?: string;
  updatedAt?: string;
  lead?: Lead | null;
}

interface ApiResponse {
  success: boolean;
  data: Space[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 8;

function leadInitials(l: Lead | null | undefined): string {
  if (!l) return "?";
  const f = (l.firstName ?? "").trim();
  const ln = (l.lastName ?? "").trim();
  return ((f[0] ?? "") + (ln[0] ?? "")).toUpperCase() || (l.email[0] ?? "?").toUpperCase();
}

function leadName(l: Lead | null | undefined): string {
  if (!l) return "—";
  const fn = `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim();
  return fn || l.email;
}

function typeLabel(t?: string): string {
  if (t === "software") return "Team-managed software";
  if (t === "discovery") return "Product Discovery";
  if (t === "service") return "Service management";
  return t ?? "—";
}

export function SpacesGrid() {
  const perms = useMyPermissions();
  const canCreateProject = perms.loading || perms.has("Project", "create");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  // All project keys (id-less, just key + name) for the "Filter by key" list,
  // fetched once so the dropdown shows every key regardless of the current page.
  const [allKeys, setAllKeys] = useState<{ key: string; name: string }[]>([]);
  const [keyQuery, setKeyQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [resp, setResp] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const filterRef = useRef<HTMLDivElement>(null);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
      sort: "name",
      order: sortOrder,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (filters.size) {
      params.set("keys", Array.from(filters).join(","));
    }

    setLoading(true);
    fetch(`/api/projects?${params.toString()}`)
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (alive) setResp(j);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [debouncedSearch, filters, sortOrder, page]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (filterOpen && filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [filterOpen]);

  // Load every project key once for the filter dropdown.
  useEffect(() => {
    fetch("/api/projects?pageSize=100&sort=name&order=asc")
      .then((r) => r.json())
      .then((j: ApiResponse) => {
        if (j?.success) {
          setAllKeys((j.data ?? []).map((s) => ({ key: s.projectKey, name: s.name })));
        }
      })
      .catch(() => undefined);
  }, []);

  const spaces = resp?.data ?? [];
  const totalPages = resp?.totalPages ?? 1;

  const visibleKeys = useMemo(() => {
    const q = keyQuery.trim().toLowerCase();
    if (!q) return allKeys;
    return allKeys.filter(
      (k) => k.key.toLowerCase().includes(q) || k.name.toLowerCase().includes(q),
    );
  }, [allKeys, keyQuery]);

  function toggleFilter(key: string) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="px-10 py-7">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Spaces</h1>
        <div className="flex items-center gap-2">
          {canCreateProject && (
            <>
              <Link
                href="/spaces/templates"
                className="inline-flex items-center h-9 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded"
              >
                Create space
              </Link>
              <Link
                href="/spaces/templates"
                className="inline-flex items-center h-9 px-4 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50 rounded"
              >
                Templates
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-[260px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search spaces"
            className="w-full h-9 pl-9 pr-3 text-sm border border-gray-300 rounded-md placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="relative" ref={filterRef}>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`inline-flex items-center justify-between gap-2 h-9 w-[180px] px-3 text-sm border rounded-md ${
              filterOpen ? "border-blue-500" : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="text-gray-700">
              {filters.size === 0 ? "Filter by key" : `Filter by key (${filters.size})`}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </button>
          {filterOpen && (
            <div className="absolute left-0 top-full mt-1 w-[260px] bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
              <div className="px-2 pt-1 pb-1.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input
                    autoFocus
                    value={keyQuery}
                    onChange={(e) => setKeyQuery(e.target.value)}
                    placeholder="Search keys…"
                    className="w-full pl-7 pr-2 h-7 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {visibleKeys.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">No keys found</div>
                ) : (
                  visibleKeys.map((k) => (
                    <label
                      key={k.key}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={filters.has(k.key)}
                        onChange={() => toggleFilter(k.key)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span className="font-medium text-gray-900">{k.key}</span>
                      <span className="text-gray-500 truncate">{k.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-md overflow-visible">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-gray-700">
              <th className="px-4 py-3 w-10">
                <Star className="h-4 w-4 text-gray-400" />
              </th>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                  className="inline-flex items-center gap-1 font-medium hover:text-gray-900"
                >
                  Name
                  {sortOrder === "asc" ? (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap">Space URL</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b border-gray-200 last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="h-4 w-4 rounded bg-gray-200 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
                      <div className="h-3 w-40 rounded bg-gray-200 animate-pulse" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-3 w-36 rounded bg-gray-200 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-gray-200 animate-pulse" />
                      <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="mx-auto h-4 w-4 rounded bg-gray-200 animate-pulse" />
                  </td>
                </tr>
              ))}
            {!loading && spaces.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-500">
                  {debouncedSearch || filters.size > 0 ? (
                    <span>No spaces match your filters.</span>
                  ) : canCreateProject ? (
                    <span>
                      No spaces yet.{" "}
                      <Link
                        href="/spaces/templates"
                        className="text-blue-600 hover:underline"
                      >
                        Create your first space
                      </Link>
                      .
                    </span>
                  ) : (
                    <span>
                      You haven&apos;t been added to any space yet. Ask your
                      organisation admin to invite you to a project — spaces
                      you join will appear here.
                    </span>
                  )}
                </td>
              </tr>
            )}
            {!loading && spaces.map((s) => (
              <tr key={s.id} className="border-b border-gray-200 last:border-b-0 hover:bg-blue-50/40">
                <td className="px-4 py-3">
                  <Star className="h-4 w-4 text-gray-300 hover:text-yellow-400 cursor-pointer" />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/spaces/${s.id}/backlog`}
                    className="inline-flex items-center gap-2 text-blue-700 hover:underline"
                  >
                    {s.icon ? (
                      <span className="h-6 w-6 rounded flex items-center justify-center text-base bg-gray-50 leading-none">
                        {s.icon}
                      </span>
                    ) : (
                      <span
                        className="h-6 w-6 rounded flex items-center justify-center text-white text-[11px] font-semibold"
                        style={{ background: s.color || "#2563eb" }}
                      >
                        {s.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>{s.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-700">{s.projectKey}</td>
                <td className="px-4 py-3 text-gray-700">{typeLabel(s.projectType)}</td>
                <td className="px-4 py-3">
                  <div className="inline-flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-blue-600 text-white text-[10px] font-semibold flex items-center justify-center">
                      {leadInitials(s.lead)}
                    </span>
                    <span className="text-gray-700">{leadName(s.lead)}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <SpaceRowMenu spaceId={s.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!loading && spaces.length > 0 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:text-gray-300"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }).map((_, i) => {
            const n = i + 1;
            const active = n === page;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`h-8 w-8 text-xs rounded border ${
                  active
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-transparent text-gray-700 hover:bg-gray-100"
                }`}
              >
                {n}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 disabled:text-gray-300"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function SpaceRowMenu({ spaceId }: { spaceId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`p-1 rounded border ${
          open
            ? "border-blue-500 bg-blue-50 text-blue-600"
            : "border-transparent text-gray-500 hover:bg-gray-100"
        }`}
        aria-label="More"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
          <Link
            href={`/spaces/${spaceId}/settings`}
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
          >
            Space settings
          </Link>
        </div>
      )}
    </div>
  );
}
