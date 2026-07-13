"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Upload } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { useColumnPrefs, useColumnWidths } from "@/lib/hooks/useColumnPrefs";
import { useMembersChanged } from "@/lib/hooks/useMembersChanged";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { useFilterPersistence } from "@/lib/hooks/usePersistentFilters";
import { ListTable } from "./list-table";
import { ListFilterButton } from "./list-filters";
import { ColumnMenuButton } from "./column-menu-button";
import { COLUMN_DEFAULT_WIDTHS, resolveColumns } from "./list-columns";
import { BulkActionBar } from "./bulk-action-bar";
import { ImportModal } from "./import-modal";
import { downloadBlob, toCsv, TEMPLATE_HEADERS } from "./csv-utils";
import {
  type IssueStatus,
  type ListFilters,
  type ListIssue,
  type SortKey,
  type UserLite,
} from "./list-types";
import { useApiData } from "@/lib/hooks/useApiData";
import type { CustomFieldDTO } from "@/lib/services/customFields";

// The edit-issue modal carries a large static dependency graph; it only opens
// on row click, so load it on demand to keep it out of the list's initial bundle.
const EditIssueModal = dynamic(
  () => import("@/components/edit-issue-modal").then((m) => m.EditIssueModal),
  { ssr: false },
);

interface Props {
  projectId: string;
}

interface IssuesResponse {
  success: boolean;
  data: ListIssue[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MembersResponse {
  success: boolean;
  data: { members: { userId: string; user: UserLite | null }[]; pendingInvites: unknown[] };
}

interface StatusesResponse {
  success: boolean;
  data: IssueStatus[];
}

const DEFAULT_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const VIEW_KEY = "spaces-list";

function readFiltersFromQuery(sp: URLSearchParams): ListFilters {
  return {
    search: sp.get("q") ?? "",
    statusId: sp.get("statusId") ?? "",
    type: sp.get("type") ?? "",
    priority: sp.get("priority") ?? "",
    assigneeId: sp.get("assigneeId") ?? "",
    // Custom filters aren't mirrored to the URL (kept clean); restored via
    // the per-user filter persistence instead.
    customFilters: [],
  };
}

function buildIssuesQuery(
  projectId: string,
  filters: ListFilters,
  sort: SortKey | "",
  order: "asc" | "desc",
  page: number,
  pageSize: number,
): string {
  const p = new URLSearchParams();
  p.set("projectId", projectId);
  p.set("page", String(page));
  p.set("pageSize", String(pageSize));
  p.set("expand", "true");
  if (filters.search) p.set("search", filters.search);
  if (filters.statusId) p.set("statusId", filters.statusId);
  if (filters.type) p.set("type", filters.type);
  if (filters.priority) p.set("priority", filters.priority);
  if (filters.assigneeId) p.set("assigneeId", filters.assigneeId);
  if (filters.customFilters.length) p.set("customFilters", JSON.stringify(filters.customFilters));
  if (sort) {
    p.set("sort", sort);
    p.set("order", order);
  }
  return `/api/issues?${p.toString()}`;
}

export function ListView({ projectId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const perms = useMyProjectPermissions(projectId);
  // Import/export move issue data in and out, so both ride on Issue:create —
  // the same grant that gates the New-issue paths. Bulk delete rides on
  // Issue:delete. A read-only Viewer holds none of these, so the whole bulk
  // action bar collapses to a plain selection count for them. Export is purely
  // client-side (no server route), so this UI gate is its only enforcement.
  const canImport = perms.loading || perms.has("Issue", "create");
  const canExport = perms.loading || perms.has("Issue", "create");
  const canDelete = perms.loading || perms.has("Issue", "delete");

  const initialFilters = useMemo(
    () => readFiltersFromQuery(new URLSearchParams(searchParams?.toString() ?? "")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // A deep-link with filter params wins over saved prefs for this visit.
  const urlHasFilters = useMemo(
    () => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      return ["q", "statusId", "type", "priority", "assigneeId"].some((k) => !!sp.get(k));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [filters, setFilters] = useState<ListFilters>(initialFilters);
  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const [page, setPage] = useState<number>(Number(searchParams?.get("page") || 1));
  const [pageSize, setPageSize] = useState<number>(
    Number(searchParams?.get("pageSize") || DEFAULT_PAGE_SIZE),
  );
  const [sort, setSort] = useState<SortKey | "">(
    (searchParams?.get("sort") as SortKey | null) ?? "updatedAt",
  );
  const [order, setOrder] = useState<"asc" | "desc">(
    (searchParams?.get("order") as "asc" | "desc" | null) ?? "desc",
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Bumping this triggers the main fetch effect — used to refresh after save.
  const [refreshTick, setRefreshTick] = useState(0);

  const [issues, setIssues] = useState<ListIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statuses, setStatuses] = useState<IssueStatus[]>([]);
  const [members, setMembers] = useState<{ userId: string; user: UserLite | null }[]>([]);
  const { data: customFields = [] } = useApiData<CustomFieldDTO[]>(
    ["quiktrack", "project-issue-fields", projectId],
    `/api/projects/${projectId}/issue-fields`,
  );

  // Column visibility + order persisted via /api/view-prefs (qtUserViewPref).
  // Widths are local-only to avoid hammering the network on every drag pixel.
  const colPrefs = useColumnPrefs(VIEW_KEY, projectId);
  const { getColWidth, startResize } = useColumnWidths(VIEW_KEY, COLUMN_DEFAULT_WIDTHS);
  const columns = useMemo(
    () => resolveColumns(colPrefs.order, colPrefs.hidden),
    [colPrefs.order, colPrefs.hidden],
  );

  // Debounce search input → applied filter.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => (f.search === searchInput ? f : { ...f, search: searchInput }));
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Auto-persist filters per user+project (no Save button). A URL deep-link
  // wins for the current visit; otherwise the last-saved filters are restored.
  useFilterPersistence<ListFilters>({
    viewKey: VIEW_KEY,
    projectId,
    filters,
    skipHydrate: urlHasFilters,
    applySaved: (s) => {
      setFilters((prev) => ({ ...prev, ...s }));
      if (typeof s.search === "string") setSearchInput(s.search);
    },
  });

  // Mirror state into URL so refresh / share preserves the view.
  useEffect(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set("q", filters.search);
    if (filters.statusId) p.set("statusId", filters.statusId);
    if (filters.type) p.set("type", filters.type);
    if (filters.priority) p.set("priority", filters.priority);
    if (filters.assigneeId) p.set("assigneeId", filters.assigneeId);
    if (sort) p.set("sort", sort);
    if (order) p.set("order", order);
    if (page > 1) p.set("page", String(page));
    if (pageSize !== DEFAULT_PAGE_SIZE) p.set("pageSize", String(pageSize));
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [filters, sort, order, page, pageSize, pathname, router]);

  // Load filter-options once per project.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/projects/${projectId}/statuses`).then((r) => r.json() as Promise<StatusesResponse>),
      fetch(`/api/projects/${projectId}/members`).then((r) => r.json() as Promise<MembersResponse>),
    ])
      .then(([s, m]) => {
        if (cancelled) return;
        if (s.success) setStatuses(s.data);
        if (m.success) setMembers(m.data.members ?? []);
      })
      .catch(() => { /* best-effort */ });
    return () => { cancelled = true; };
  }, [projectId]);

  // Refetch members when membership changes via the Add-people modal.
  useMembersChanged(projectId, () => {
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json() as Promise<MembersResponse>)
      .then((m) => { if (m.success) setMembers(m.data.members ?? []); })
      .catch(() => undefined);
  });

  // Refetch when an issue is created via the global header "Create" modal
  // (scoped to this project). The backlog/board/timeline views already listen
  // for this event; the List was the only main view not subscribed, so a
  // newly-created item didn't appear until a manual page refresh.
  useEffect(() => {
    function onCreated(e: Event) {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (!detail || detail.projectId !== projectId) return;
      setRefreshTick((t) => t + 1);
    }
    window.addEventListener("quiktrack:issue-created", onCreated);
    return () => window.removeEventListener("quiktrack:issue-created", onCreated);
  }, [projectId]);

  // Main fetch — `seq` guards against out-of-order responses.
  const seqRef = useRef(0);
  useEffect(() => {
    const mySeq = ++seqRef.current;
    setLoading(true);
    setError(null);
    fetch(buildIssuesQuery(projectId, filters, sort, order, page, pageSize))
      .then((r) => r.json() as Promise<IssuesResponse>)
      .then((res) => {
        if (mySeq !== seqRef.current) return;
        if (!res.success) throw new Error("Failed to load");
        setIssues(res.data ?? []);
        setTotal(res.total ?? 0);
        setTotalPages(res.totalPages ?? 1);
      })
      .catch((e) => {
        if (mySeq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load");
        setIssues([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (mySeq === seqRef.current) setLoading(false);
      });
  }, [projectId, filters, sort, order, page, pageSize, refreshTick]);

  const handleSortChange = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (prev === key) {
        setOrder((o) => (o === "asc" ? "desc" : "asc"));
        return key;
      }
      setOrder("asc");
      return key;
    });
    setPage(1);
  }, []);

  const handleFiltersChange = useCallback((next: ListFilters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const toggleColumnVisibility = useCallback((col: string) => {
    if (colPrefs.hidden.has(col)) colPrefs.show(col);
    else colPrefs.hide(col);
  }, [colPrefs]);

  const handlePatchIssue = useCallback(
    (issueId: string, patch: Record<string, unknown>) => {
      // Snapshot the row for revert-on-error.
      let snapshot: ListIssue | null = null;
      setIssues((prev) =>
        prev.map((i) => {
          if (i.id !== issueId) return i;
          snapshot = i;
          // Apply optimistic patch. For statusId we also rewrite the embedded
          // `status` object so the row's pill / strikethrough updates instantly.
          const next: ListIssue = { ...i };
          if ("title" in patch) next.title = patch.title as string;
          if ("priority" in patch) next.priority = patch.priority as ListIssue["priority"];
          if ("statusId" in patch) {
            next.statusId = patch.statusId as string;
            next.status = statuses.find((s) => s.id === patch.statusId) ?? next.status;
          }
          if ("assigneeId" in patch) {
            next.assigneeId = (patch.assigneeId as string | null) ?? null;
            next.assignee = next.assigneeId
              ? members.find((m) => m.user?.id === next.assigneeId)?.user ?? null
              : null;
          }
          if ("storyPoints" in patch) next.storyPoints = patch.storyPoints as number | null;
          if ("eta" in patch) next.eta = patch.eta as number | null;
          if ("dueDate" in patch) next.dueDate = patch.dueDate as string | null;
          if ("startDate" in patch) next.startDate = patch.startDate as string | null;
          return next;
        }),
      );

      fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then((r) => r.json() as Promise<{ success: boolean; error?: string }>)
        .then((res) => {
          if (!res.success) throw new Error(res.error ?? "Save failed");
        })
        .catch((e) => {
          // Revert.
          if (snapshot) {
            const revertTo = snapshot;
            setIssues((prev) => prev.map((i) => (i.id === issueId ? revertTo : i)));
          }
          setError(e instanceof Error ? e.message : "Save failed");
        });
    },
    [statuses, members],
  );

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const res = await fetch("/api/issues/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ids: Array.from(selected) }),
    });
    const json = (await res.json()) as { success: boolean; error?: string };
    if (!json.success) {
      setError(json.error ?? "Bulk delete failed");
      return;
    }
    setSelected(new Set());
    setRefreshTick((t) => t + 1);
  }, [projectId, selected]);

  const handleBulkExport = useCallback(() => {
    if (selected.size === 0) return;
    const picked = issues.filter((i) => selected.has(i.id));
    const headerRow = TEMPLATE_HEADERS as unknown as string[];
    const dataRows = picked.map((i) => [
      i.title,
      i.type,
      i.priority ?? "",
      i.status?.name ?? "",
      i.assignee?.email ?? "",
      i.storyPoints ?? "",
      i.eta ?? "",
      i.dueDate ? i.dueDate.slice(0, 10) : "",
      "", // description omitted from export — preserves template-roundtrip
    ]);
    const csv = toCsv([headerRow, ...dataRows]);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(`quiktrack-export-${stamp}.csv`, csv);
  }, [issues, selected]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search work…"
            className="w-full rounded border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-400"
          />
        </div>
        <ListFilterButton
          filters={filters}
          onChange={handleFiltersChange}
          statuses={statuses}
          members={members}
          customFields={customFields}
        />
        <div className="ml-auto flex items-center gap-2">
          {canImport && (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              title="Import from CSV"
            >
              <Upload className="h-4 w-4" />
              Import
            </button>
          )}
          <ColumnMenuButton
            hidden={colPrefs.hidden}
            onToggle={toggleColumnVisibility}
            onShowAll={colPrefs.showAll}
          />
        </div>
      </div>

      <BulkActionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onDelete={handleBulkDelete}
        onExport={handleBulkExport}
        canDelete={canDelete}
        canExport={canExport}
      />

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <ListTable
        projectId={projectId}
        columns={columns}
        issues={issues}
        loading={loading}
        sort={sort}
        order={order}
        onSortChange={handleSortChange}
        selected={selected}
        onSelectionChange={setSelected}
        getColWidth={getColWidth}
        onResizeStart={startResize}
        onHideColumn={colPrefs.hide}
        onReorderColumns={colPrefs.setColumnOrder}
        onOpenIssue={setEditingIssueId}
        statuses={statuses}
        members={members}
        onPatchIssue={handlePatchIssue}
      />

      <EditIssueModal
        open={editingIssueId != null}
        issueId={editingIssueId}
        projectId={projectId}
        onClose={() => setEditingIssueId(null)}
        onSaved={() => setRefreshTick((t) => t + 1)}
      />

      <ImportModal
        open={importOpen}
        projectId={projectId}
        onClose={() => setImportOpen(false)}
        onImported={() => setRefreshTick((t) => t + 1)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />
    </div>
  );
}
