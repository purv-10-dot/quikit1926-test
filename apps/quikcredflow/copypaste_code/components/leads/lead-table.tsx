"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, RotateCcw, Star, Trash2, X } from "lucide-react";
import { LeadChangeLogDrawer } from "@/components/leads/lead-change-log-drawer";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Pagination } from "@/components/shared/pagination";
import { CallButton } from "@/components/telephony/call-button";
import { ColumnHeaderMenu } from "@/components/leads/column-header-menu";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils/date-helpers";
import { RelativeTime } from "@/components/shared/relative-time";
import { STANDARD_KEYS, type LeadFieldDefinition } from "@/types/field-definition";

export interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  stage: string;
  status: string;
  score: number;
  ownerName: string | null;
  isStarred: boolean;
  /** Optional fields appearing only when the column is enabled. */
  mobile?: string | null;
  jobTitle?: string | null;
  source?: string | null;
  dynamicFields?: Record<string, unknown> | null;
  /** Populated only in trash view. */
  deletedAt?: string | Date | null;
}

interface Props {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Field defs (standard + custom) — used to render arbitrary columns. If omitted, falls back to default columns. */
  fieldDefs?: LeadFieldDefinition[];
  /** Ordered list of column keys to show. If omitted, uses DEFAULT_COLUMNS. */
  visibleKeys?: string[];
  /** Currently active sort column. */
  sortBy?: string;
  sortDir?: "asc" | "desc";
  /** Frozen column keys (rendered sticky-left in the order given). */
  frozenKeys?: string[];
  /** Optional — when provided together with onPageSizeChange, the footer renders the rows-per-page dropdown. */
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (next: number) => void;
  onPageChange?: (next: number) => void;
  onChanged?: () => void;
  onSort?: (key: string, dir: "asc" | "desc") => void;
  onToggleFreeze?: (key: string) => void;
  onHide?: (key: string) => void;
  /** Trash mode swaps row actions (Restore + Delete forever). */
  viewTrash?: boolean;
  /** Permanent-delete is admin-only. */
  isAdmin?: boolean;
  /** Active mode → Move to Trash (soft delete). */
  onLeadDelete?: (lead: LeadRow) => void;
  /** Trash mode → Restore. */
  onLeadRestore?: (lead: LeadRow) => void;
  /** Trash mode + admin → Permanent delete. */
  onLeadPermanentDelete?: (lead: LeadRow) => void;
}

const DEFAULT_COLUMNS = ["name", "company", "email", "phone", "stage", "status", "score", "ownerName"];
/** Fixed min-width for frozen columns so we can compute a sticky-left offset without measuring DOM widths. */
const FROZEN_COL_WIDTH = 180;

export function LeadTable({
  items,
  total,
  page,
  pageSize,
  fieldDefs,
  visibleKeys,
  sortBy,
  sortDir,
  frozenKeys = [],
  pageSizeOptions,
  onPageSizeChange,
  onPageChange,
  onChanged,
  onSort,
  onToggleFreeze,
  onHide,
  viewTrash = false,
  isAdmin = false,
  onLeadDelete,
  onLeadRestore,
  onLeadPermanentDelete,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [logFor, setLogFor] = useState<{ id: string; name: string } | null>(null);

  // Frozen columns always render leftmost, in the order they were frozen.
  // The "name" column is implicitly frozen so it stays visible while the user
  // scrolls horizontally — that's the column the row identity hangs off of.
  const requested = (visibleKeys && visibleKeys.length > 0 ? visibleKeys : DEFAULT_COLUMNS).filter(Boolean);
  const userFrozen = frozenKeys.filter((k) => requested.includes(k));
  const implicitFrozen = requested.includes("name") && !userFrozen.includes("name") ? ["name"] : [];
  const frozen = [...implicitFrozen, ...userFrozen];
  const unfrozen = requested.filter((k) => !frozen.includes(k));
  const cols = [...frozen, ...unfrozen];

  const labelByKey = new Map((fieldDefs ?? []).map((f) => [f.key, f.label]));
  const defByKey = new Map((fieldDefs ?? []).map((f) => [f.key, f]));

  function setPage(next: number) {
    if (onPageChange) {
      onPageChange(next);
      return;
    }
    const sp = new URLSearchParams(params.toString());
    sp.set("page", String(next));
    router.push(`/leads?${sp.toString()}`);
  }

  async function toggleStar(lead: LeadRow) {
    try {
      const res = await fetch(`/api/leads/${lead.id}/favorite`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isStarred: !lead.isStarred }),
      });
      if (!res.ok) throw new Error("Failed");
      if (onChanged) onChanged();
      else router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update");
    }
  }

  // The leftmost sticky cell is the row's star button (40px wide). Frozen data
  // columns start after that offset so they don't overlap it.
  const STAR_COL_WIDTH = 40;
  // Sticky cells need their own opaque background to occlude scrolled content
  // beneath them. Headers are white; body rows alternate peach/white to match
  // the zebra defined in `.crm-table-sticky`. `rowIndex` is the 0-based row
  // position so the caller can pass it from items.map().
  const ROW_BG_ODD = "#ffffff";
  const ROW_BG_EVEN = "#fff7ed"; // crm-peach
  function frozenStyle(
    key: string,
    isHeader = false,
    rowIndex?: number,
  ): React.CSSProperties | undefined {
    const idx = frozen.indexOf(key);
    if (idx === -1) return undefined;
    const bodyBg =
      rowIndex !== undefined && (rowIndex + 1) % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD;
    return {
      position: "sticky",
      left: STAR_COL_WIDTH + idx * FROZEN_COL_WIDTH,
      minWidth: FROZEN_COL_WIDTH,
      zIndex: isHeader ? 5 : 2,
      background: isHeader ? "#ffffff" : bodyBg,
      boxShadow:
        idx === frozen.length - 1
          ? "1px 0 0 var(--crm-border, #e5e7eb)"
          : undefined,
    };
  }

  // Body-cell alignment — truncate long text in data rows. Do not apply truncate
  // to header cells: overflow:hidden on <th> clips the column menu dropdown.
  function bodyCellClass(k: string): string {
    if (k === "score") return "text-right tabular-nums";
    if (k === "phone" || k === "mobile") return "whitespace-nowrap tabular-nums";
    if (k === "email") return "truncate max-w-[260px]";
    if (k === "stage" || k === "status" || k === "ownerName")
      return "whitespace-nowrap";
    if (k === "company" || k === "jobTitle" || k === "source")
      return "truncate max-w-[200px]";
    return "";
  }

  function headerCellClass(k: string): string {
    if (k === "score") return "text-right";
    return "min-w-0";
  }

  return (
    <div className="crm-card overflow-hidden">
      {/* `100dvh` adapts to iOS Safari's collapsing address bar.
       * The offsets account for: topbar (56) + main padding (12-24) +
       * tabs (32) + card padding (10-16) + toolbar (36) + saved-views (40)
       * + applied-filter-summary (~24) + pagination (~40) ≈ 250-260px on lg.
       * Trimmed from the previous 300px so the scroll container exposes
       * roughly two extra rows on a 13" laptop. */}
      <div className="crm-hscroll relative max-h-[calc(100dvh-200px)] overflow-auto sm:max-h-[calc(100dvh-220px)] lg:max-h-[calc(100dvh-250px)]">
        <Table className="crm-table-sticky">
          <THead>
            <TR>
              <TH
                className="w-10 px-3"
                style={{ position: "sticky", left: 0, zIndex: 5, background: "#ffffff" }}
              >
                <span className="sr-only">Star</span>
              </TH>
              {cols.map((k) => {
                const label = labelByKey.get(k) ?? humanize(k);
                const sortable = STANDARD_KEYS.has(k); // server only sorts standard columns for now
                const headerStyle = frozenStyle(k, true);
                const isFrozen = frozen.includes(k);
                const menuEnabled = onSort && onToggleFreeze && onHide;
                return (
                  <TH key={k} style={headerStyle} className={headerCellClass(k)}>
                    {menuEnabled ? (
                      <ColumnHeaderMenu
                        columnKey={k}
                        label={label}
                        sortBy={sortBy}
                        sortDir={sortDir}
                        isFrozen={isFrozen}
                        sortable={sortable}
                        onSort={onSort!}
                        onToggleFreeze={onToggleFreeze!}
                        onHide={onHide!}
                      />
                    ) : (
                      label
                    )}
                  </TH>
                );
              })}
              <TH className="w-12 text-center">Log</TH>
              {!viewTrash && <TH className="w-16 text-center">Call</TH>}
              {viewTrash && <TH className="w-32 whitespace-nowrap">Deleted</TH>}
              <TH className="w-20 text-center">
                {viewTrash ? "Actions" : <span className="sr-only">Row actions</span>}
              </TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR>
                <TD colSpan={cols.length + 4} className="py-16">
                  {viewTrash ? (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="rounded-full bg-amber-50 p-3 ring-1 ring-amber-200">
                        <Trash2 className="h-6 w-6 text-amber-600" />
                      </div>
                      <p className="text-sm font-medium text-crm-text">Trash is empty</p>
                      <p className="max-w-md text-xs text-crm-muted">
                        Leads you delete are kept here so you can restore them.
                      </p>
                    </div>
                  ) : (
                    <p className="text-center text-sm text-crm-muted">
                      No leads match your filters.
                    </p>
                  )}
                </TD>
              </TR>
            ) : (
              items.map((l, rowIndex) => {
                // Even rows (1-based) get the peach zebra; odd rows are white.
                // Trash mode keeps the amber tint regardless to signal that
                // these rows are deleted.
                const isEvenRow = (rowIndex + 1) % 2 === 0;
                const rowBg = viewTrash
                  ? "rgb(255 251 235 / 0.5)"
                  : isEvenRow
                    ? ROW_BG_EVEN
                    : ROW_BG_ODD;
                return (
                  <TR
                    key={l.id}
                    className={viewTrash ? "bg-amber-50/30 hover:bg-amber-50/60" : undefined}
                  >
                    <TD
                      className="px-3"
                      style={{ position: "sticky", left: 0, zIndex: 1, background: rowBg }}
                    >
                      <button
                        onClick={() => toggleStar(l)}
                        aria-label={l.isStarred ? "Unstar lead" : "Star lead"}
                        title={l.isStarred ? "Unstar" : "Star"}
                        disabled={viewTrash}
                        className={
                          "rounded p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow " +
                          (viewTrash ? "cursor-not-allowed opacity-40" : "hover:bg-crm-panel")
                        }
                      >
                        <Star
                          size={16}
                          className={
                            l.isStarred
                              ? "fill-amber-400 text-amber-400"
                              : "text-crm-muted"
                          }
                        />
                      </button>
                    </TD>
                    {cols.map((k) => {
                      const fStyle = frozenStyle(k, false, rowIndex);
                      // Trash mode overrides the row bg with the amber tint.
                      const style =
                        fStyle && viewTrash ? { ...fStyle, background: rowBg } : fStyle;
                      return (
                        <TD
                          key={k}
                          style={style}
                          className={
                            (bodyCellClass(k) ? bodyCellClass(k) + " " : "") +
                            (viewTrash ? "text-crm-muted" : "")
                          }
                        >
                          {renderCell(k, l, defByKey.get(k))}
                        </TD>
                      );
                    })}
                    <TD className="text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLogFor({ id: l.id, name: l.name });
                        }}
                        aria-label={`View change log for ${l.name}`}
                        title="View change log"
                        className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-crm-blue-glow"
                      >
                        <History size={14} />
                      </button>
                    </TD>
                    {!viewTrash && (
                      <TD className="text-center">
                        <CallButton
                          to={l.phone}
                          leadId={l.id}
                          leadName={l.name}
                          variant="icon"
                          disabledReason={
                            l.phone === null
                              ? "Phone hidden by your role"
                              : "No phone number"
                          }
                        />
                      </TD>
                    )}
                    {viewTrash && (
                      <TD className="whitespace-nowrap text-xs text-crm-muted">
                        <DeletedAtCell value={l.deletedAt ?? null} />
                      </TD>
                    )}
                    <TD className="text-center">
                      <RowActions
                        lead={l}
                        viewTrash={viewTrash}
                        isAdmin={isAdmin}
                        onLeadDelete={onLeadDelete}
                        onLeadRestore={onLeadRestore}
                        onLeadPermanentDelete={onLeadPermanentDelete}
                      />
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </div>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPage={setPage}
        pageSizeOptions={pageSizeOptions}
        onPageSizeChange={onPageSizeChange}
        showPageNumbers={Boolean(pageSizeOptions)}
      />
      <LeadChangeLogDrawer
        leadId={logFor?.id ?? ""}
        leadName={logFor?.name ?? ""}
        open={logFor !== null}
        onClose={() => setLogFor(null)}
      />
    </div>
  );
}

function RowActions({
  lead,
  viewTrash,
  isAdmin,
  onLeadDelete,
  onLeadRestore,
  onLeadPermanentDelete,
}: {
  lead: LeadRow;
  viewTrash: boolean;
  isAdmin: boolean;
  onLeadDelete?: (lead: LeadRow) => void;
  onLeadRestore?: (lead: LeadRow) => void;
  onLeadPermanentDelete?: (lead: LeadRow) => void;
}) {
  const stop = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };
  if (viewTrash) {
    return (
      <div className="inline-flex items-center justify-center divide-x divide-amber-200/60 overflow-hidden rounded-md ring-1 ring-amber-200/60 bg-white shadow-sm">
        {onLeadRestore && (
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onLeadRestore(lead);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-crm-blue transition hover:bg-crm-blue-soft"
            aria-label="Restore lead"
            title="Restore — return to active leads"
          >
            <RotateCcw size={12} />
            Restore
          </button>
        )}
        {isAdmin && onLeadPermanentDelete && (
          <button
            type="button"
            onClick={(e) => {
              stop(e);
              onLeadPermanentDelete(lead);
            }}
            className="inline-flex items-center justify-center px-2 py-1 text-red-600 transition hover:bg-red-50"
            aria-label="Permanently delete lead"
            title="Permanently delete — cannot be undone"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  }
  return onLeadDelete ? (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        onLeadDelete(lead);
      }}
      className="rounded-md p-1.5 text-crm-muted opacity-60 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 focus:opacity-100"
      aria-label="Move lead to trash"
      title="Move to Trash"
    >
      <Trash2 size={14} />
    </button>
  ) : null;
}

/**
 * Renders a soft-deleted lead's `deletedAt` as relative time ("3 hours ago")
 * with a tooltip showing the full local timestamp. Falls back to "—" if absent.
 */
function DeletedAtCell({ value }: { value: string | Date | null }) {
  if (!value) return <span className="text-crm-muted">—</span>;
  const iso = typeof value === "string" ? value : value.toISOString();
  return <RelativeTime iso={iso} className="cursor-default" />;
}

function renderCell(key: string, lead: LeadRow, def?: LeadFieldDefinition): React.ReactNode {
  // Standard "name" cell links to detail
  if (key === "name") {
    return (
      <Link
        href={`/leads/${lead.id}`}
        className="crm-link block max-w-[220px] truncate font-medium"
        title={lead.name}
      >
        {lead.name}
      </Link>
    );
  }
  if (key === "stage") {
    return (
      <span className="inline-flex items-center rounded-full bg-crm-blue-soft px-2.5 py-0.5 text-xs font-medium text-crm-blue-dark">
        {lead.stage}
      </span>
    );
  }
  if (key === "status") {
    return <StatusBadge value={lead.status} />;
  }
  if (key === "score") return <span className="font-medium tabular-nums">{lead.score}</span>;
  if (key === "isStarred") return lead.isStarred ? "★" : "—";

  // Standard column → top-level lead property
  const standardKeys = ["email", "phone", "mobile", "company", "jobTitle", "source", "ownerName"];
  if (standardKeys.includes(key)) {
    const v = (lead as unknown as Record<string, unknown>)[key];
    return formatValue(v, def);
  }

  // Otherwise it's a dynamic field
  const v = lead.dynamicFields?.[key];
  return formatValue(v, def);
}

function StatusBadge({ value }: { value: string }) {
  if (!value) return <span className="text-crm-muted">—</span>;
  const v = value.toLowerCase();
  let cls = "bg-slate-100 text-slate-700 ring-slate-200";
  if (v.includes("converted") || v.includes("won")) {
    cls = "bg-green-50 text-green-700 ring-green-200";
  } else if (v.includes("disqualified") || v.includes("lost")) {
    cls = "bg-red-50 text-red-700 ring-red-200";
  } else if (v.includes("working") || v.includes("open")) {
    cls = "bg-blue-50 text-blue-700 ring-blue-200";
  } else if (v.includes("demo") || v.includes("booked")) {
    cls = "bg-violet-50 text-violet-700 ring-violet-200";
  }
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset " +
        cls
      }
    >
      {value}
    </span>
  );
}

function formatValue(v: unknown, def?: LeadFieldDefinition): React.ReactNode {
  if (v == null || v === "") return <span className="text-crm-muted">—</span>;
  if (def?.fieldType === "Date" && typeof v === "string") return formatDate(v);
  if (def?.fieldType === "Boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}
