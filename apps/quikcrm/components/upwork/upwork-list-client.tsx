"use client";

/**
 * Upwork job list — mirrors components/icp/icp-list-client.tsx: plain fetch +
 * useState + useCallback load(), 300 ms debounced search, StatsBar, in-table
 * loading/empty rows, Trash tab, and useConfirm + useToast for row actions. No
 * react-query, so the loading/empty behaviour matches the other list pages.
 *
 * There is no "New" button: rows only ever arrive from the browser extension's
 * "Add to CRM". The empty state says so rather than offering a create form that
 * would have nothing sensible to fill in.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RotateCcw, Search, Trash2 } from "lucide-react";
import { TrashBanner, useConfirm } from "@quikit/ui";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { StatsBar } from "@/components/shared/stats-bar";
import { useToast } from "@/hooks/use-toast";

type Tab = "all" | "trash";

export interface UpworkStats {
  total: number;
  recent: number;
}

export interface UpworkRow {
  id: string;
  jobTitle: string;
  jobUrl: string | null;
  upworkJobId: string | null;
  projectType: string | null;
  skills: string | null;
  clientLocation: string | null;
  proposals: string | null;
  projectPrice: string | null;
  projectTime: string | null;
  requiredConnects: string | null;
  createdByUserId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * The prospect this job was converted to, from the real DB relation. At most
   * one (enforced by @@unique([orgId, upworkJobId])); empty when not converted.
   */
  convertedProspects?: Array<{ id: string; name: string }>;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function UpworkListClient({
  initialStats,
  canEdit,
  canDelete,
  isAdmin,
}: {
  initialStats?: UpworkStats;
  canEdit: boolean;
  canDelete: boolean;
  isAdmin: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>("all");
  const viewTrash = tab === "trash";

  const [items, setItems] = useState<UpworkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<"createdAt" | "updatedAt" | "jobTitle">("createdAt");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir: sortBy === "jobTitle" ? "asc" : "desc",
      });
      if (viewTrash) params.set("trashed", "true");
      if (debouncedSearch) params.set("q", debouncedSearch);

      const res = await fetch(`/api/upwork?${params.toString()}`, { credentials: "include" });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setItems(body.data.items);
      setTotal(body.data.total ?? body.data.items.length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load Upwork jobs");
    } finally {
      setLoading(false);
    }
  }, [viewTrash, page, pageSize, debouncedSearch, sortBy]);

  useEffect(() => {
    void load();
  }, [load]);

  // Any filter change invalidates the current page offset.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, viewTrash, sortBy]);

  const onSoftDelete = useCallback(
    async (row: UpworkRow) => {
      if (!canDelete) return;
      const ok = await confirm({
        title: "Move to Trash?",
        description: `"${row.jobTitle}" will be moved to Trash. You can restore it later.`,
        confirmLabel: "Move to Trash",
        cancelLabel: "Cancel",
        tone: "warning",
      });
      if (!ok) return;
      try {
        const res = await fetch(`/api/upwork/${row.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Delete failed");
        }
        toast.success("Upwork job moved to Trash");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [canDelete, confirm, load, toast],
  );

  const onRestore = useCallback(
    async (row: UpworkRow) => {
      try {
        const res = await fetch(`/api/upwork/${row.id}`, {
          method: "POST",
          credentials: "include",
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !(j as { success?: boolean }).success) {
          throw new Error((j as { error?: string }).error || "Restore failed");
        }
        toast.success("Upwork job restored");
        await load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Restore failed");
      }
    },
    [load, toast],
  );

  const tabs: Array<{ key: Tab; label: string }> = canDelete
    ? [
        { key: "all", label: "All" },
        { key: "trash", label: "Trash" },
      ]
    : [{ key: "all", label: "All" }];

  const showActionsCol = canEdit || canDelete;
  // Job Title, Type, Price, Duration, Location, Proposals, Status, Added.
  const colCount = 8 + (showActionsCol ? 1 : 0);

  return (
    <div className="space-y-3">
      {initialStats && (
        <StatsBar
          items={[
            { label: "jobs", value: initialStats.total.toLocaleString("en-IN") },
            {
              label: "added this week",
              value: initialStats.recent.toLocaleString("en-IN"),
              accent: initialStats.recent > 0,
            },
            ...(isAdmin ? [] : [{ label: "scope", value: "added by you" as const }]),
          ]}
        />
      )}

      {canDelete && tabs.length > 1 && (
        <div className="inline-flex max-w-full overflow-x-auto rounded border border-crm-border bg-white p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "shrink-0 rounded px-3 py-1.5",
                tab === t.key ? "bg-crm-blue text-white" : "text-crm-text hover:bg-crm-panel",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {viewTrash && canDelete && <TrashBanner count={total} onExit={() => setTab("all")} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-crm-muted"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, description, skills or location…"
            className="pl-8"
            aria-label="Search Upwork jobs"
          />
        </div>
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort Upwork jobs"
        >
          <option value="createdAt">Newest first</option>
          <option value="updatedAt">Recently updated</option>
          <option value="jobTitle">Title (A–Z)</option>
        </Select>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-crm-border bg-white">
        <TableScroll minWidth={1000}>
          <Table>
            <THead>
              <TR>
                <TH>Job Title</TH>
                <TH>Type</TH>
                <TH hideBelow="md">Price</TH>
                <TH hideBelow="lg">Duration</TH>
                <TH hideBelow="lg">Location</TH>
                <TH hideBelow="md">Proposals</TH>
                <TH>Status</TH>
                <TH hideBelow="sm">Added</TH>
                {showActionsCol && <TH>Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {loading && (
                <TR>
                  <TD colSpan={colCount} className="py-8 text-center text-crm-muted">
                    Loading…
                  </TD>
                </TR>
              )}

              {!loading && items.length === 0 && (
                <TR>
                  <TD colSpan={colCount} className="py-8 text-center text-crm-muted">
                    {viewTrash
                      ? "Trash is empty."
                      : debouncedSearch
                        ? "No Upwork jobs match your search."
                        : "No Upwork jobs yet. Open a job on Upwork and click “Add to CRM” in the QuikCRM extension."}
                  </TD>
                </TR>
              )}

              {!loading &&
                items.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/upwork/${row.id}`}
                        className="font-medium text-crm-text hover:underline"
                      >
                        {row.jobTitle}
                      </Link>
                      {row.skills && (
                        <div className="mt-0.5 truncate text-xs text-crm-muted" title={row.skills}>
                          {row.skills}
                        </div>
                      )}
                    </TD>
                    <TD>{row.projectType || "—"}</TD>
                    <TD hideBelow="md">{row.projectPrice || "—"}</TD>
                    <TD hideBelow="lg">{row.projectTime || "—"}</TD>
                    <TD hideBelow="lg">{row.clientLocation || "—"}</TD>
                    {/* Proposals. Must stay here and carry the SAME hideBelow as
                        its <TH>: a body cell that is missing, or that hides at a
                        different breakpoint than its header, shifts every column
                        after it out of alignment. */}
                    <TD hideBelow="md">{row.proposals || "—"}</TD>
                    {/* Conversion status, from the real Upwork → Prospect
                        relation loaded with the row. Converted links to the
                        prospect; Not Converted is a plain badge. */}
                    <TD>
                      {row.convertedProspects?.[0] ? (
                        <Link
                          href={`/settings/prospects?prospectId=${encodeURIComponent(
                            row.convertedProspects[0].id,
                          )}`}
                          title={`Converted to ${row.convertedProspects[0].name}`}
                          className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 hover:bg-green-200"
                        >
                          Converted
                        </Link>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Not Converted
                        </span>
                      )}
                    </TD>
                    <TD hideBelow="sm">{formatDate(row.createdAt)}</TD>
                    {showActionsCol && (
                      <TD>
                        <div className="flex items-center gap-1">
                          {row.jobUrl && (
                            <a
                              href={row.jobUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                              title="Open on Upwork"
                              aria-label={`Open “${row.jobTitle}” on Upwork`}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                          {viewTrash
                            ? canDelete && (
                                <button
                                  type="button"
                                  onClick={() => void onRestore(row)}
                                  className="rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
                                  title="Restore"
                                  aria-label={`Restore “${row.jobTitle}”`}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              )
                            : canDelete && (
                                <button
                                  type="button"
                                  onClick={() => void onSoftDelete(row)}
                                  className="rounded p-1.5 text-crm-muted hover:bg-crm-panel hover:text-red-600"
                                  title="Move to Trash"
                                  aria-label={`Move “${row.jobTitle}” to Trash`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
            </TBody>
          </Table>
        </TableScroll>

        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
