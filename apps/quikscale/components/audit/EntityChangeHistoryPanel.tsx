"use client";

import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { X, Pin, Copy, Search, Download, ChevronDown, ChevronUp, Info } from "lucide-react";
import { OperationPill } from "@/components/audit/OperationPill";
import { Legend } from "@/components/audit/Legend";
import type { Operation } from "@/components/audit/auditLogTokens";
import {
  actionMeta,
  bucketCounts,
  filterByBucket,
  searchEvents,
  groupEventsByDay,
  formatTimestamp,
  uniqueActors,
  avatarColor,
  formatValue,
  exportEventsJSON,
  isStructuredChange,
  isArrayValue,
  isUpdateLikeAction,
  pruneEmptyEvents,
  diffObjectKeys,
  diffArrayValues,
  weekKeyLabel,
  weekRangeLabel,
  type TimelineEvent,
  type TimelineChange,
} from "@/lib/audit/timeline";
import type { AuditFilterBucket } from "@/lib/audit/actions";

/**
 * Generic, entity-driven Change History drawer.
 *
 * The KPI and Priority panels are thin wrappers that pass an `AuditEntityConfig`
 * describing the entity-specific bits (field labels, badge, period chip, status
 * dot, weekly rendering kind, the CREATE card, the data hooks, and an optional
 * comment composer). Everything else — chrome, search, tabs, day grouping,
 * diff rendering, export — lives here once.
 */

export interface AuditEntityBase {
  id: string;
  name: string;
}

export interface AuditTimelineHookResult {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
}

export interface AuditEntityConfig<T extends AuditEntityBase = AuditEntityBase> {
  /** Stored entityType (analytics / aria). e.g. "KPI" | "PRIORITY". */
  entityType: string;
  /** Short uppercase badge shown in the header. */
  badgeLabel: string;
  /** Header badge background color (hex). */
  badgeColor: string;
  /** aria-label for the dialog. */
  dialogLabel: string;
  /** Download filename prefix (e.g. "kpi", "priority"). */
  exportPrefix: string;
  /** Field-name → human label. */
  fieldLabel: (field: string) => string;
  /** Period chip text (e.g. "FY 2026-2027 · Q1"). Optional — omit for entities
   *  with no natural period (e.g. Client / Client Member); the chip is hidden. */
  periodLabel?: (entity: T) => string;
  /** Optional per-field value formatter for the diff (e.g. isActive → Active /
   *  Inactive). Return undefined to fall back to the default formatter. */
  formatFieldValue?: (fieldName: string, value: unknown) => string | undefined;
  /** Weekly diff is a numeric metric (KPI) or a status string (Priority).
   *  Optional — entities without weekly events (WWW/Client/Member) can omit it. */
  weeklyKind?: "numeric" | "status";
  /** Data hook: the entity's audit timeline. */
  useTimeline: (id: string) => AuditTimelineHookResult;
  /** Data hook: mark-read mutation (fires on open). */
  useMarkRead: () => { mutate: (id: string) => void };
  /** Hook returning week-range labels for the weekly diff table ([] if N/A). */
  useWeekLabels: (entity: T) => string[];
  /** Optional informational status/RAG dot in the header. */
  statusDot?: (entity: T) => { className: string; label: string } | null;
  /** Render the CREATE card body (entity-specific spec + breakdown). */
  renderCreateCard: (args: {
    entity: T;
    weekLabels: string[];
    open: boolean;
    onToggle: () => void;
  }) => ReactNode;
  /** Optional comment composer (rendered below the tabs when present). */
  renderComposer?: (entityId: string) => ReactNode;
  /**
   * Optional override for the operation pill of an action. Return undefined to
   * use the default mapping. KPI shows status edits as UPDATED; Priority shows
   * them as a distinct STATUS pill (per its design).
   */
  operationFor?: (action: string) => Operation | undefined;
}

const TABS: { key: AuditFilterBucket | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "create", label: "Create" },
  { key: "update", label: "Update" },
  { key: "delete", label: "Delete" },
];

export function EntityChangeHistoryPanel<T extends AuditEntityBase>({
  entity,
  config,
  onClose,
}: {
  entity: T;
  config: AuditEntityConfig<T>;
  onClose: () => void;
}) {
  const { data: rawEvents = [], isLoading, isError } = config.useTimeline(entity.id);
  // Drop the empty-UPDATE noise (legacy recompute logs with no field changes)
  // once at the source, so entry count, tabs, list, "Showing X of Y" and the
  // JSON export all stay consistent with what the user actually sees.
  const events = useMemo(
    () => pruneEmptyEvents((rawEvents as TimelineEvent[]) ?? []),
    [rawEvents],
  );
  const [bucket, setBucket] = useState<AuditFilterBucket | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedAll, setExpandedAll] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const [showLegend, setShowLegend] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [copied, setCopied] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Opening the drawer marks the timeline read for this user — optimistic badge
  // clear handled inside the mutation.
  const { mutate: markRead } = config.useMarkRead();
  useEffect(() => {
    markRead(entity.id);
  }, [entity.id, markRead]);

  const statusDot = config.statusDot?.(entity) ?? null;
  const periodLabel = config.periodLabel?.(entity);

  function copyPermalink() {
    try {
      void navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  const now = new Date();
  const weekLabels = config.useWeekLabels(entity);
  const counts = useMemo(() => bucketCounts(events), [events]);
  const actors = useMemo(() => uniqueActors(events), [events]);
  const createEvent = useMemo(() => events.find((e) => e.action === "CREATE"), [events]);

  // CREATED card is auto-expanded on first open. Seeded once; the user can
  // still collapse it afterwards.
  const seededCreate = useRef(false);
  useEffect(() => {
    if (createEvent && !seededCreate.current) {
      seededCreate.current = true;
      setOpenCards((prev) => new Set(prev).add(createEvent.id));
    }
  }, [createEvent]);

  const visible = useMemo(() => {
    const byBucket = filterByBucket(events, bucket);
    return searchEvents(byBucket, search);
  }, [events, bucket, search]);
  const groups = useMemo(() => groupEventsByDay(visible, now), [visible, now]);

  const expandableCount = useMemo(
    () =>
      visible.filter(
        (e) =>
          e.action === "CREATE" ||
          e.action === "BULK_UPDATE" ||
          (isUpdateLikeAction(e.action) && e.changes.some((c) => isStructuredChange(c.oldValue, c.newValue))),
      ).length,
    [visible],
  );

  function isOpen(id: string, action: string): boolean {
    if (action === "CREATE" || action === "BULK_UPDATE") {
      return expandedAll || openCards.has(id);
    }
    return true;
  }

  function toggleCard(id: string) {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleExport() {
    const json = exportEventsJSON(events);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.exportPrefix}-${entity.id}-history.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const lastEdit = events[0]?.createdAt;

  return (
    <div className="fixed inset-0 z-[200] flex" role="dialog" aria-label={config.dialogLabel}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto flex h-full w-full max-w-full flex-col bg-white shadow-2xl sm:w-[480px]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: config.badgeColor }}
            >
              {config.badgeLabel}
            </span>
            <span className="text-xs font-semibold tracking-wide text-gray-500">CHANGE HISTORY</span>
          </div>
          <div className="relative flex items-center gap-1 text-gray-400">
            <button
              className="rounded p-1 hover:bg-gray-100"
              title="Legend"
              aria-label="Legend"
              type="button"
              onClick={() => setShowLegend((v) => !v)}
            >
              <Info className="h-4 w-4" />
            </button>
            <button
              className={`rounded p-1 hover:bg-gray-100 ${pinned ? "text-gray-700" : ""}`}
              title={pinned ? "Unpin" : "Pin"}
              aria-label="Pin"
              type="button"
              onClick={() => setPinned((v) => !v)}
            >
              <Pin className="h-4 w-4" fill={pinned ? "currentColor" : "none"} />
            </button>
            <button
              className="rounded p-1 hover:bg-gray-100"
              title={copied ? "Copied!" : "Copy permalink"}
              aria-label="Copy permalink"
              type="button"
              onClick={copyPermalink}
            >
              <Copy className="h-4 w-4" />
            </button>
            <button className="rounded p-1 hover:bg-gray-100" title="Close" type="button" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
            {showLegend && <Legend onClose={() => setShowLegend(false)} />}
          </div>
        </div>

        {/* Title + period + status dot */}
        <div className="flex items-center gap-2 px-5 pt-3">
          <h2 className="truncate text-lg font-bold text-gray-900">{entity.name}</h2>
          {periodLabel && (
            <span className="shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {periodLabel}
            </span>
          )}
          {statusDot && (
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot.className}`}
              title={statusDot.label}
              aria-label={statusDot.label}
            />
          )}
        </div>

        {/* Meta row */}
        <div className="flex items-center justify-between px-5 py-2 text-xs text-gray-500">
          <span>
            {events.length} {events.length === 1 ? "entry" : "entries"}
            {lastEdit ? <> · last edit {relativeShort(lastEdit, now)}</> : null}
          </span>
          <div className="flex items-center gap-3">
            {expandableCount > 0 && (
              <button
                type="button"
                onClick={() => setExpandedAll((v) => !v)}
                className="rounded bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-gray-700"
              >
                {expandedAll ? "Collapse all" : "Expand all"}
                <span className="ml-1 opacity-70">{expandableCount} expandable</span>
              </button>
            )}
            <AvatarCluster actors={actors} />
          </div>
        </div>

        {/* Created banner */}
        {createEvent && (
          <div className="mx-5 mb-2 flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm">
            <span className="text-gray-700">
              Created {new Date(createEvent.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })} by{" "}
              <span className="font-semibold">{createEvent.actorName}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setBucket("all");
                setOpenCards((prev) => new Set(prev).add(createEvent.id));
              }}
              className="shrink-0 font-medium text-green-700 hover:underline"
            >
              View →
            </button>
          </div>
        )}

        {/* Search */}
        <div className="px-5 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search field, value, or actor…"
              className="w-full text-sm outline-none placeholder:text-gray-400"
              aria-label="Search history"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 px-5 pb-2">
          {TABS.map((t) => {
            const count = t.key === "all" ? counts.all : counts[t.key];
            const active = bucket === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setBucket(t.key)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${active ? "bg-gray-900 text-white" : "border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
              >
                {t.label} {count}
              </button>
            );
          })}
        </div>

        {/* Optional comment composer */}
        {config.renderComposer && <div className="px-5 pb-2">{config.renderComposer(entity.id)}</div>}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {isLoading && <p className="py-8 text-center text-sm text-gray-400">Loading history…</p>}
          {isError && <p className="py-8 text-center text-sm text-red-500">Failed to load history.</p>}
          {!isLoading && !isError && visible.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">No matching events.</p>
          )}

          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="flex items-center justify-between py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <span>{group.label}</span>
                <span>{group.events.length} {group.events.length === 1 ? "event" : "events"}</span>
              </div>
              <div className="space-y-2">
                {group.events.map((e) => (
                  <EventCard
                    key={e.id}
                    event={e}
                    entity={entity}
                    config={config}
                    weekLabels={weekLabels}
                    open={isOpen(e.id, e.action)}
                    onToggle={() => toggleCard(e.id)}
                    expandedAll={expandedAll}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          <span>Showing {visible.length} of {events.length}</span>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-1 font-medium text-gray-700 hover:text-gray-900"
          >
            <Download className="h-3.5 w-3.5" /> Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}

function AvatarCluster({ actors }: { actors: { userId: string; name: string; initials: string }[] }) {
  const shown = actors.slice(0, 3);
  return (
    <div className="flex items-center gap-1" title={actors.map((a) => a.name).join(", ")}>
      <div className="flex -space-x-2">
        {shown.map((a) => (
          <span
            key={a.userId}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white"
            style={{ backgroundColor: avatarColor(a.name || a.userId) }}
          >
            {a.initials}
          </span>
        ))}
      </div>
      <span className="text-xs text-gray-500">{actors.length} {actors.length === 1 ? "person" : "people"}</span>
    </div>
  );
}

function EventCard<T extends AuditEntityBase>({
  event,
  entity,
  config,
  weekLabels,
  open,
  onToggle,
  expandedAll,
}: {
  event: TimelineEvent;
  entity: T;
  config: AuditEntityConfig<T>;
  weekLabels: string[];
  open: boolean;
  onToggle: () => void;
  expandedAll: boolean;
}) {
  const meta = actionMeta(event.action);
  const time = formatTimestamp(event.createdAt, new Date());
  const snap = (event.snapshot ?? {}) as Record<string, unknown>;

  return (
    <div className="rounded-xl border border-gray-100 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${meta.dotClass}`} />
          <OperationPill action={event.action} operation={config.operationFor?.(event.action)} />
          {event.source === "system" && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">system</span>
          )}
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
            style={{ backgroundColor: avatarColor(event.actorName || event.actorUserId) }}
            title={event.actorName}
          >
            {initials(event.actorName)}
          </span>
        </div>
        <span className="text-xs text-gray-400">{time}</span>
      </div>

      <div className="mt-2">
        {event.action === "WEEKLY_UPDATE" && <WeeklyBody snap={snap} kind={config.weeklyKind ?? "numeric"} />}
        {event.action === "BULK_UPDATE" && <BulkBody snap={snap} open={open} onToggle={onToggle} />}
        {event.action === "CREATE" &&
          config.renderCreateCard({ entity, weekLabels, open, onToggle })}
        {event.action === "COMMENT" && (
          <CommentBody text={String(snap.content ?? event.reason ?? "")} />
        )}
        {(event.action === "DELETE" || event.action === "ARCHIVE") && (
          <div className="text-sm">
            <p className="text-gray-600">Deleted{snap.name ? ` "${String(snap.name)}"` : ""}.</p>
            {event.reason && <p className="mt-0.5 font-medium text-red-600">Reason: {event.reason}</p>}
          </div>
        )}
        {event.action === "RESTORE" && (
          <div className="text-sm">
            <p className="text-gray-600">Restored{snap.name ? ` "${String(snap.name)}"` : ""}.</p>
            {event.reason && <p className="mt-0.5 text-gray-500">Note: {event.reason}</p>}
          </div>
        )}
        {isUpdateLikeAction(event.action) && (
          <DiffBody event={event} config={config} expandedAll={expandedAll} weekLabels={weekLabels} />
        )}
      </div>
      {event.reason &&
        !["COMMENT", "DELETE", "ARCHIVE", "RESTORE"].includes(event.action) && (
          <p className="mt-2 text-[11px] text-gray-400">Reason: {event.reason}</p>
        )}
    </div>
  );
}

function CommentBody({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 160 || text.split("\n").length > 3;
  return (
    <div className="text-sm text-gray-700">
      <p className={expanded ? "whitespace-pre-wrap" : "line-clamp-3 whitespace-pre-wrap"}>{text}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs font-medium text-indigo-600 hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function DiffBody<T extends AuditEntityBase>({
  event,
  config,
  expandedAll,
  weekLabels,
}: {
  event: TimelineEvent;
  config: AuditEntityConfig<T>;
  expandedAll: boolean;
  weekLabels: string[];
}) {
  if (event.changes.length === 0) {
    // A backfilled (historical) edit kept its post-state snapshot but no field
    // diff — say so honestly instead of the misleading "No field changes".
    const hasSnapshot =
      event.snapshot != null &&
      typeof event.snapshot === "object" &&
      Object.keys(event.snapshot as object).length > 0;
    return (
      <p className="text-sm text-gray-500">
        {hasSnapshot
          ? "Edited — field-level details weren't recorded (historical entry)."
          : "No field changes recorded."}
      </p>
    );
  }
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {event.changes.length} field{event.changes.length === 1 ? "" : "s"} changed
      </p>
      <div className="space-y-1">
        {event.changes.map((c, i) => (
          <ChangeRow key={`${c.fieldName}-${i}`} change={c} config={config} expandedAll={expandedAll} weekLabels={weekLabels} />
        ))}
      </div>
    </div>
  );
}

function ScalarValue({ value, strike, display }: { value: unknown; strike?: boolean; display?: string }) {
  const text = display ?? formatValue(value);
  return (
    <span
      className={`max-w-[200px] truncate break-words ${strike ? "text-gray-400 line-through" : "font-medium text-gray-900"}`}
      title={text}
    >
      {text}
    </span>
  );
}

function ChangeRow<T extends AuditEntityBase>({
  change,
  config,
  expandedAll,
  weekLabels,
}: {
  change: TimelineChange;
  config: AuditEntityConfig<T>;
  expandedAll: boolean;
  weekLabels: string[];
}) {
  const [open, setOpen] = useState(false);
  const label = config.fieldLabel(change.fieldName);
  // A config-provided formatter (e.g. isActive → Active/Inactive, or a
  // teamMemberIds id → member name) overrides the default value display. Used
  // by BOTH the array (added/removed) and scalar paths, so migrated id-based
  // arrays render as names too.
  const fmt = (v: unknown): string => config.formatFieldValue?.(change.fieldName, v) ?? formatValue(v);

  // Array field (e.g. ownerIds, teamMemberIds) → added / removed summary.
  if (isArrayValue(change.oldValue) || isArrayValue(change.newValue)) {
    const { added, removed } = diffArrayValues(change.oldValue, change.newValue);
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500">{label}</span>
        {added.length > 0 && (
          <span className="text-green-600">+ {added.map(fmt).join(", ")}</span>
        )}
        {removed.length > 0 && (
          <span className="text-red-600">− {removed.map(fmt).join(", ")}</span>
        )}
        {added.length === 0 && removed.length === 0 && <span className="text-gray-400">reordered</span>}
      </div>
    );
  }

  // Object field (e.g. weeklyTargets) → collapsible per-key diff table.
  if (isStructuredChange(change.oldValue, change.newValue)) {
    const keyDiffs = diffObjectKeys(change.oldValue, change.newValue);
    const useWeeks = change.fieldName === "weeklyTargets" || change.fieldName === "weeklyOwnerTargets";
    const isOpen = expandedAll || open;
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 text-left text-sm"
        >
          <span className="text-gray-500">{label}</span>
          <span className="text-gray-400">· {keyDiffs.length} value{keyDiffs.length === 1 ? "" : "s"} changed</span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
        </button>
        {isOpen &&
          (keyDiffs.length === 0 ? (
            <p className="mt-1 text-xs text-gray-400">No per-key changes.</p>
          ) : (
            <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-gray-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="px-2 py-1">{useWeeks ? "Week" : "Field"}</th>
                    {useWeeks && <th className="px-2 py-1">Date Range</th>}
                    <th className="px-2 py-1">Old</th>
                    <th className="px-2 py-1">New</th>
                  </tr>
                </thead>
                <tbody>
                  {keyDiffs.map((k) => {
                    const wk = Number(k.key);
                    const dateRange = useWeeks && Number.isFinite(wk) ? weekLabels[wk - 1] : "";
                    return (
                      <tr key={k.key} className="border-t border-gray-50">
                        <td className="px-2 py-1 font-medium text-gray-700">
                          {useWeeks ? weekKeyLabel(k.key) : k.key}
                        </td>
                        {useWeeks && <td className="px-2 py-1 text-gray-500">{dateRange || "—"}</td>}
                        <td className="px-2 py-1 text-gray-400 line-through">{formatValue(k.oldValue)}</td>
                        <td className="px-2 py-1 font-medium text-gray-900">{formatValue(k.newValue)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
      </div>
    );
  }

  // Scalar field → inline old → new (wraps/truncates).
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <ScalarValue value={change.oldValue} display={fmt(change.oldValue)} strike />
      <span className="text-gray-400">→</span>
      <ScalarValue value={change.newValue} display={fmt(change.newValue)} />
    </div>
  );
}

function WeeklyBody({ snap, kind }: { snap: Record<string, unknown>; kind: "numeric" | "status" }) {
  if (kind === "status") {
    const status = snap.status != null ? String(snap.status) : "—";
    const prev = snap.previousStatus != null ? String(snap.previousStatus) : null;
    const notesOnly = snap.notesOnly === true;
    return (
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {notesOnly ? "Weekly note" : "Weekly status"} · Week {String(snap.weekNumber ?? "?")}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          {prev && prev !== status && (
            <>
              <span className="text-gray-400 line-through">{prev}</span>
              <span className="text-gray-400">→</span>
            </>
          )}
          <span className={notesOnly ? "text-gray-500" : "font-semibold text-gray-900"}>{status}</span>
        </div>
        {snap.notes ? <p className="mt-1 text-sm text-gray-600">Notes {String(snap.notes)}</p> : null}
      </div>
    );
  }

  const value = snap.value as number | null;
  const prior = snap.priorWeekValue as number | null;
  const delta = typeof value === "number" && typeof prior === "number" ? value - prior : null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        Weekly update · Week {String(snap.weekNumber ?? "?")}
      </p>
      <div className="mt-1 flex items-end gap-6">
        <div>
          <p className="text-[10px] uppercase text-gray-400">Value entered</p>
          <p className="text-2xl font-bold text-gray-900">{value ?? "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-400">Δ from prior</p>
          <p className={`text-sm font-semibold ${delta != null && delta >= 0 ? "text-green-600" : "text-red-600"}`}>
            {delta == null ? "—" : delta >= 0 ? `+${delta}` : `${delta}`}
          </p>
        </div>
      </div>
      {snap.notes ? <p className="mt-1 text-sm text-gray-600">Notes {String(snap.notes)}</p> : null}
    </div>
  );
}

function BulkBody({
  snap,
  open,
  onToggle,
}: {
  snap: Record<string, unknown>;
  open: boolean;
  onToggle: () => void;
}) {
  const rows = (snap.rows as Array<Record<string, unknown>>) ?? [];
  const weeks = (snap.weeks as number[]) ?? [];
  const range = weekRangeLabel(weeks);
  const summary = `${rows.length} weekly ${rows.length === 1 ? "value" : "values"} updated in one save`;
  const historical =
    rows.length > 0 &&
    rows.every(
      (r) =>
        (r.oldValue === null || r.oldValue === undefined) &&
        (r.newValue === null || r.newValue === undefined),
    );

  if (historical) {
    return (
      <div>
        <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
          <span className="rounded bg-purple-50 px-2 py-1 text-xs text-purple-700">
            Bulk weekly update · {range}
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
        </button>
        <p className="mt-1 text-xs text-gray-600">{summary}.</p>
        <p className="mt-1 text-[11px] text-gray-400">
          Older save — the individual before/after value for each week wasn&apos;t recorded at the time.
        </p>
        {open && weeks.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">Weeks updated: {weeks.join(", ")}</p>
        )}
      </div>
    );
  }

  const total = rows.reduce((s, r) => {
    const o = (r.oldValue as number) ?? 0;
    const n = (r.newValue as number) ?? 0;
    return s + (n - o);
  }, 0);
  return (
    <div>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between text-left">
        <span className="rounded bg-purple-50 px-2 py-1 text-xs text-purple-700">
          Bulk weekly update · {range}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-green-600">
          {total >= 0 ? `+${total}` : total}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      <p className="mt-1 text-xs text-gray-600">{summary}.</p>
      {open && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-gray-400">
              <th className="py-1">#</th>
              <th>Old → New</th>
              <th>Δ</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const o = (r.oldValue as number) ?? 0;
              const n = (r.newValue as number) ?? 0;
              const d = n - o;
              return (
                <tr key={i} className="border-t border-gray-50">
                  <td className="py-1 font-medium">{String(r.weekNumber ?? "")}</td>
                  <td>
                    <span className="text-gray-400 line-through">{formatValue(r.oldValue)}</span>
                    {" → "}
                    <span className="font-medium text-gray-900">{formatValue(r.newValue)}</span>
                  </td>
                  <td className={d >= 0 ? "text-green-600" : "text-red-600"}>{d >= 0 ? `+${d}` : d}</td>
                  <td className="text-gray-500">{r.note ? String(r.note) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function relativeShort(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return "today";
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}
