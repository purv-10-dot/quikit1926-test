"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounce";
import {
  ActivityAdvancedFilterModal,
  ActivityAppliedFilterSummary,
} from "@/components/activities/activity-advanced-filter";
import { LogActivityModal } from "@/components/activities/log-activity-modal";
import { ActivityDetailModal } from "@/components/activities/activity-detail-modal";
import type { ActivityRow } from "@/lib/services/activities/to-list-row";
import type { ConditionRow, FilterPayload } from "@/types/lead-filter";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const EMPTY: FilterPayload = { matchMode: "ALL", conditions: [] };

function readPageFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("page"));
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
}
function readPageSizeFromUrl(sp: URLSearchParams): number {
  const raw = Number(sp.get("limit"));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_PAGE_SIZE;
}

interface ListResponse {
  success: true;
  data: { items: ActivityRow[]; total: number; page: number; pageSize: number };
}

interface Props {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canViewLeads: boolean;
}

export function ActivitiesListClient({ canCreate, canEdit, canDelete, canViewLeads }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [filter, setFilter] = useState<FilterPayload>(EMPTY);
  const [page, setPageState] = useState<number>(() =>
    readPageFromUrl(new URLSearchParams(searchParams.toString())),
  );
  const [pageSize, setPageSizeState] = useState<number>(() =>
    readPageSizeFromUrl(new URLSearchParams(searchParams.toString())),
  );

  const writeUrl = useCallback(
    (nextPage: number, nextLimit: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (nextPage === 1) sp.delete("page");
      else sp.set("page", String(nextPage));
      if (nextLimit === DEFAULT_PAGE_SIZE) sp.delete("limit");
      else sp.set("limit", String(nextLimit));
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      writeUrl(next, pageSize);
    },
    [pageSize, writeUrl],
  );
  const setPageSize = useCallback(
    (next: number) => {
      setPageSizeState(next);
      setPageState(1);
      writeUrl(1, next);
    },
    [writeUrl],
  );

  // Mirror URL → state on browser back/forward.
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const nextPage = readPageFromUrl(sp);
    const nextSize = readPageSizeFromUrl(sp);
    setPageState((cur) => (cur === nextPage ? cur : nextPage));
    setPageSizeState((cur) => (cur === nextSize ? cur : nextSize));
  }, [searchParams]);

  const [items, setItems] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [detail, setDetail] = useState<ActivityRow | null>(null);

  const effectiveFilter: FilterPayload = useMemo(() => {
    if (!debounced.trim()) return filter;
    // Search expands into 4 OR conditions over text fields. The filter
    // engine collapses these via matchMode=ANY when no other conditions
    // exist; otherwise we keep the user's explicit conditions and add
    // the search as additional ANY conditions inside an inner block —
    // here we keep it simple: search only when no advanced conditions.
    if (filter.conditions.length > 0) return filter;
    const term = debounced.trim();
    const conditions: ConditionRow[] = [
      { field: "subject", operator: "contains", value: term },
      { field: "outcome", operator: "contains", value: term },
      { field: "detailNotes", operator: "contains", value: term },
      { field: "type", operator: "contains", value: term },
    ];
    return { matchMode: "ANY", conditions };
  }, [debounced, filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/activities/filter", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          filter: effectiveFilter,
          page,
          pageSize,
          sortBy: "occurredAt",
          sortDir: "desc",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to load activities");
      }
      const body = (await res.json()) as ListResponse;
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [effectiveFilter, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  // Reset to page 1 on search/filter change — but skip the very first render
  // so a deep-link like `/activities?page=3` isn't immediately reset.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, filter]);

  const filterActive = filter.conditions.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
            size={14}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject, outcome, notes…"
            className="pl-8"
            data-testid="activities-search"
          />
        </div>

        <Button
          variant="secondary"
          type="button"
          onClick={() => setShowAdvanced(true)}
          className="inline-flex items-center gap-1"
        >
          <SlidersHorizontal size={14} />
          Advanced filter
          {filterActive && (
            <span className="ml-1 rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-700">
              On
            </span>
          )}
        </Button>

        <Button
          type="button"
          onClick={() => setShowLog(true)}
          disabled={!canCreate}
          title={canCreate ? "Log a new activity" : "You don't have permission to create activities"}
          className="ml-auto inline-flex items-center gap-1"
          data-testid="activities-add-button"
        >
          <Plus size={14} /> Log activity
        </Button>
      </div>

      <ActivityAppliedFilterSummary filter={filter} onClear={() => setFilter(EMPTY)} />

      <div className="crm-card overflow-hidden">
        <TableScroll minWidth={900} bleed={false}>
          <Table>
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Related</TH>
                <TH>Subject / outcome</TH>
                <TH hideBelow="lg">Owner</TH>
                <TH>When</TH>
              </TR>
            </THead>
            <TBody>
              {loading && items.length === 0 ? (
                <TableSkeletonRows
                  rows={10}
                  columns={[
                    { widthClass: "w-24" },
                    { widthClass: "w-40" },
                    { widthClass: "w-56" },
                    { widthClass: "w-24", hideBelow: "lg" },
                    { widthClass: "w-20" },
                  ]}
                />
              ) : error ? (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-red-600">
                    {error}
                  </TD>
                </TR>
              ) : items.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-crm-muted">
                    No activities yet.
                  </TD>
                </TR>
              ) : (
                items.map((a) => (
                  <TR
                    key={a.id}
                    onClick={() => setDetail(a)}
                    className="cursor-pointer hover:bg-blue-50/30"
                  >
                    <TD className="whitespace-nowrap">{a.type}</TD>
                    <TD className="text-sm">
                      <span className="text-crm-muted">{a.relatedKind}</span>{" "}
                      <span className="font-medium">{a.relatedLabel}</span>
                    </TD>
                    <TD>
                      <div className="font-medium">{a.subject || "—"}</div>
                      {a.outcome && (
                        <div className="text-xs text-crm-muted">{a.outcome}</div>
                      )}
                      {a.detailNotes && (
                        <div className="line-clamp-1 text-xs text-crm-muted/80">
                          {a.detailNotes}
                        </div>
                      )}
                    </TD>
                    <TD hideBelow="lg" className="whitespace-nowrap">
                      {a.owner || "—"}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-crm-muted">
                      {a.when}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={setPageSize}
        showPageNumbers
      />

      <ActivityAdvancedFilterModal
        open={showAdvanced}
        initial={filter}
        onClose={() => setShowAdvanced(false)}
        onApply={(p) => setFilter(p)}
      />

      <LogActivityModal
        open={showLog}
        onClose={() => setShowLog(false)}
        onSuccess={() => void load()}
        canViewLeads={canViewLeads}
      />

      <ActivityDetailModal
        open={detail !== null}
        row={detail}
        canEdit={canEdit}
        canDelete={canDelete}
        onClose={() => setDetail(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}
