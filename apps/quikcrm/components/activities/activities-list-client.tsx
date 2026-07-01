"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Pagination } from "@/components/shared/pagination";
import { Table, TableScroll, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { TableSkeletonRows } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounce";
import {
  ActivityAdvancedFilterModal,
  ActivityAppliedFilterSummary,
} from "@/components/activities/activity-advanced-filter";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/activities/log-activity/searchable-select";
import { LogActivityModal } from "@/components/activities/log-activity-modal";
import { DraftActivitiesModal } from "@/components/activities/draft-activities-modal";
import { ActivityDetailModal } from "@/components/activities/activity-detail-modal";
import type { NamedDraft } from "@/lib/activities/activity-drafts";
import { ACTIVITY_QUICK_SEARCH_FIELD } from "@/lib/services/activities/filter-engine";
import type { ActivityRow } from "@/lib/services/activities/to-list-row";
import type { ConditionRow, FilterPayload } from "@/types/lead-filter";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 10;
const EMPTY: FilterPayload = { matchMode: "ALL", conditions: [] };

// Top-level "Linked To" options for the toolbar filter. "" = All. "None" is the
// stored sentinel for Standalone activities (see target-existence.ts).
const LINKED_TO_OPTIONS = [
  { value: "", label: "All linked types" },
  { value: "Lead", label: "Lead" },
  { value: "Account", label: "Account" },
  { value: "Contact", label: "Contact" },
  { value: "Opportunity", label: "Opportunity" },
  { value: "None", label: "Standalone" },
] as const;

// Which picker API to query per record type for the "Linked Record" dropdown.
const LINKED_RECORD_PICKERS: Record<string, string> = {
  Lead: "/api/leads/picker?limit=200",
  Account: "/api/accounts/picker?limit=200",
  Contact: "/api/contacts/picker?limit=200",
  Opportunity: "/api/opportunities/picker?limit=200",
};

// Merge/replace a single quick-filter condition. When a condition is actually
// added it forces top-level AND (matchMode ALL) so the quick filter ANDs with
// the advanced filter — the intended "narrow down" behaviour. When the value is
// empty it only strips the field and leaves the advanced filter's matchMode
// untouched, so an unused toolbar control never alters an advanced ANY filter.
// Mirrors the leads-explorer helper.
function withQuickFilter(
  filter: FilterPayload,
  field: string,
  value: string,
  operator: ConditionRow["operator"],
): FilterPayload {
  const stripped = filter.conditions.filter((c) => c.field !== field);
  if (!value) return { ...filter, conditions: stripped };
  return { ...filter, matchMode: "ALL", conditions: [...stripped, { field, operator, value }] };
}

// Merge/replace a `between` date-range condition. Either bound may be empty
// (open-ended); clears entirely when both are empty (leaving matchMode intact).
function withDateRangeFilter(
  filter: FilterPayload,
  field: string,
  from: string,
  to: string,
): FilterPayload {
  const stripped = filter.conditions.filter((c) => c.field !== field);
  if (!from && !to) return { ...filter, conditions: stripped };
  return {
    ...filter,
    matchMode: "ALL",
    conditions: [
      ...stripped,
      { field, operator: "between", value: from || null, valueTo: to || null },
    ],
  };
}

// Soft per-type badge tokens for the "Linked To" kind label. Follows the
// design-system badge pattern (bg-*-50 / text-*-700 / ring-*-200) used by
// sourceBadgeClass and the activity-timeline type colours — subtle, accessible,
// low-saturation. Hardcoded (not accent-*) because they encode record type, not
// brand — see CLAUDE.md. Unknown kinds fall back to the neutral slate badge.
const KIND_BADGE: Record<string, string> = {
  Lead: "bg-blue-50 text-blue-700 ring-blue-200",
  Account: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Contact: "bg-violet-50 text-violet-700 ring-violet-200",
  Opportunity: "bg-amber-50 text-amber-800 ring-amber-200",
};
const KIND_BADGE_FALLBACK = "bg-slate-50 text-slate-600 ring-slate-200";

// Renders the "Subject / Outcome" cell. Manually logged activities frequently
// have no subject or outcome — only user-entered notes. In that case we promote
// the notes to the primary (bold) line instead of showing an empty "—"
// placeholder above muted notes. The precedence is subject → outcome → notes for
// the primary line; whatever remains renders as muted secondary lines. Only when
// none of the three fields carry content do we fall back to the "—" placeholder.
function renderSubjectOutcome(a: ActivityRow) {
  const subject = a.subject.trim();
  const outcome = a.outcome.trim();
  const notes = a.detailNotes.trim();

  // Build the display lines from the non-empty fields, in precedence order
  // subject → outcome → notes. The first line renders bold (primary); the rest
  // render as muted secondary lines. Promoting notes into this list means a
  // notes-only manual activity shows the notes as the bold primary line instead
  // of an empty "—" placeholder.
  const lines = [subject, outcome, notes].filter((v) => v.length > 0);

  if (lines.length === 0) {
    return <div className="font-medium">—</div>;
  }

  const [primary, ...secondary] = lines;
  return (
    <>
      <div className="font-medium">{primary}</div>
      {secondary.map((line, i) => (
        <div key={i} className="line-clamp-1 text-xs text-crm-muted">
          {line}
        </div>
      ))}
    </>
  );
}

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
  const [showDrafts, setShowDrafts] = useState(false);
  // When a draft is resumed, it opens the Log-activity composer prefilled.
  const [resumeDraft, setResumeDraft] = useState<NamedDraft | null>(null);
  const [detail, setDetail] = useState<ActivityRow | null>(null);

  // Top-level toolbar filters (visible next to the search box).
  const [linkedKind, setLinkedKind] = useState(""); // "" = All; "None" = Standalone
  const [linkedRecordId, setLinkedRecordId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Record options for the "Linked Record" dropdown, loaded per selected kind.
  const [recordOptions, setRecordOptions] = useState<SearchableOption[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Owner options for the "Owner" searchable dropdown. Sourced from the org's
  // assignable users (when the caller can view leads) and merged with owners
  // observed in the loaded activity rows, so the list stays complete even for
  // owners the assignable-users endpoint doesn't return (or if it's forbidden).
  const [ownerOptions, setOwnerOptions] = useState<SearchableOption[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);

  // Merge helper: add any owners not already present (dedup by id).
  const mergeOwnerOptions = useCallback((incoming: SearchableOption[]) => {
    if (incoming.length === 0) return;
    setOwnerOptions((prev) => {
      const byId = new Map(prev.map((o) => [o.id, o]));
      let changed = false;
      for (const o of incoming) {
        if (o.id && !byId.has(o.id)) {
          byId.set(o.id, o);
          changed = true;
        }
      }
      return changed ? Array.from(byId.values()) : prev;
    });
  }, []);

  useEffect(() => {
    if (!canViewLeads) return;
    let ignore = false;
    setOwnersLoading(true);
    void fetch("/api/leads/assignable-users", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (ignore || !body?.success) return;
        const list: { id: string; name?: string; email?: string }[] = Array.isArray(body.data)
          ? body.data
          : [];
        mergeOwnerOptions(
          list.map((u) => ({ id: u.id, label: u.name || u.email || u.id })),
        );
      })
      .catch(() => {
        /* best-effort — row-derived owners still populate the list */
      })
      .finally(() => {
        if (!ignore) setOwnersLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [canViewLeads, mergeOwnerOptions]);

  // The record picker only applies to the 4 real record types (not All /
  // Standalone), and its options depend on the chosen kind.
  const recordPickerEnabled = linkedKind !== "" && linkedKind !== "None";

  useEffect(() => {
    if (!recordPickerEnabled) {
      setRecordOptions([]);
      return;
    }
    const path = LINKED_RECORD_PICKERS[linkedKind];
    if (!path) return;
    let ignore = false;
    setRecordsLoading(true);
    void fetch(path)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (ignore) return;
        const items: { id: string; name?: string; company?: string | null }[] =
          body?.data?.items ?? body?.items ?? [];
        setRecordOptions(
          items.map((it) => ({
            id: it.id,
            label: it.company ? `${it.name ?? "—"} — ${it.company}` : it.name ?? "—",
          })),
        );
      })
      .catch(() => {
        if (!ignore) setRecordOptions([]);
      })
      .finally(() => {
        if (!ignore) setRecordsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [linkedKind, recordPickerEnabled]);

  // Compose: advanced filter + free-text search + top-level quick filters. All
  // combine with AND (matchMode ALL). Search is a single virtual `__quickSearch`
  // condition the engine expands to an OR across text columns, so it composes
  // cleanly with the structured filters below.
  const effectiveFilter: FilterPayload = useMemo(() => {
    let f = filter;
    f = withQuickFilter(f, ACTIVITY_QUICK_SEARCH_FIELD, debounced.trim(), "contains");
    f = withQuickFilter(f, "relatedKind", linkedKind, "eq");
    // Linked record only makes sense for a real record kind.
    f = withQuickFilter(
      f,
      "relatedObjectId",
      recordPickerEnabled ? linkedRecordId : "",
      "eq",
    );
    f = withQuickFilter(f, "ownerId", ownerId, "eq");
    f = withDateRangeFilter(f, "occurredAt", dateFrom, dateTo);
    return f;
  }, [
    filter,
    debounced,
    linkedKind,
    linkedRecordId,
    recordPickerEnabled,
    ownerId,
    dateFrom,
    dateTo,
  ]);

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
      // Supplement the Owner dropdown with owners seen in this page of rows.
      mergeOwnerOptions(
        body.data.items
          .filter((r) => r.ownerId && r.owner)
          .map((r) => ({ id: r.ownerId as string, label: r.owner })),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [effectiveFilter, page, pageSize, mergeOwnerOptions]);

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
  }, [debounced, filter, linkedKind, linkedRecordId, ownerId, dateFrom, dateTo]);

  const filterActive = filter.conditions.length > 0;
  const quickFilterActive =
    !!linkedKind ||
    (recordPickerEnabled && !!linkedRecordId) ||
    !!ownerId ||
    !!dateFrom ||
    !!dateTo;

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
          variant="secondary"
          type="button"
          onClick={() => setShowDrafts(true)}
          className="inline-flex items-center gap-1"
          data-testid="activities-drafts-button"
        >
          <FileText size={14} />
          Drafts
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

      {/* Top-level quick filters — visible next to the search box. */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-crm-muted">Linked to</span>
          <Select
            value={linkedKind}
            onChange={(e) => {
              setLinkedKind(e.target.value);
              setLinkedRecordId(""); // reset the record when the type changes
            }}
            className="min-w-[10rem]"
            data-testid="activities-linked-kind"
          >
            {LINKED_TO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </label>

        <div className="min-w-[15rem]">
          <SearchableSelect
            label="Linked record"
            placeholder={
              recordPickerEnabled
                ? `Search ${linkedKind.toLowerCase()}…`
                : "Select a linked type first"
            }
            value={linkedRecordId}
            loading={recordsLoading}
            disabled={!recordPickerEnabled}
            options={recordOptions}
            onChange={(id) => setLinkedRecordId(id)}
          />
        </div>

        <div className="min-w-[14rem]">
          <SearchableSelect
            label="Owner"
            placeholder="Search owner…"
            value={ownerId}
            loading={ownersLoading}
            options={ownerOptions}
            onChange={(id) => setOwnerId(id)}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-crm-muted">From</span>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="min-w-[9rem]"
            data-testid="activities-date-from"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-crm-muted">To</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="min-w-[9rem]"
            data-testid="activities-date-to"
          />
        </label>

        {quickFilterActive && (
          <button
            type="button"
            onClick={() => {
              setLinkedKind("");
              setLinkedRecordId("");
              setOwnerId("");
              setDateFrom("");
              setDateTo("");
            }}
            className="mb-1 text-xs font-medium text-crm-muted hover:text-crm-text"
          >
            Clear filters
          </button>
        )}
      </div>

      <ActivityAppliedFilterSummary filter={filter} onClear={() => setFilter(EMPTY)} />

      <div className="crm-card overflow-hidden">
        <TableScroll minWidth={900} bleed={false}>
          <Table className="crm-table-titlecase-head">
            <THead>
              <TR>
                <TH>Type</TH>
                <TH>Linked To</TH>
                <TH>Subject / Outcome</TH>
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
                      {a.relatedKind === "None" || !a.relatedLabel || a.relatedLabel === "—" ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${KIND_BADGE_FALLBACK}`}
                        >
                          Standalone
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${KIND_BADGE[a.relatedKind] ?? KIND_BADGE_FALLBACK}`}
                          >
                            {a.relatedKind}
                          </span>
                          <span className="font-medium text-crm-text">{a.relatedLabel}</span>
                        </span>
                      )}
                    </TD>
                    <TD>{renderSubjectOutcome(a)}</TD>
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

      <DraftActivitiesModal
        open={showDrafts}
        onClose={() => setShowDrafts(false)}
        onResume={(draft) => {
          setShowDrafts(false);
          setResumeDraft(draft);
          setShowLog(true);
        }}
      />

      <LogActivityModal
        open={showLog}
        onClose={() => {
          setShowLog(false);
          setResumeDraft(null);
        }}
        onSuccess={() => void load()}
        canViewLeads={canViewLeads}
        initialDraft={resumeDraft}
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
