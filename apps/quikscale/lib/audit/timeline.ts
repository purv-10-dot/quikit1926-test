/**
 * Pure presentation helpers for the Change History panel.
 *
 * No React, no I/O — so the grouping / bucketing / formatting logic is
 * unit-testable in isolation. `now` is always injected (never read from the
 * clock here) so tests are deterministic.
 */
import { actionBucket, type AuditFilterBucket } from "./actions";
import { kpiFieldLabel } from "./kpiFields";
import { valuesEqual } from "./diff";

export interface TimelineChange {
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface TimelineEvent {
  id: string;
  action: string;
  actorUserId: string;
  actorName: string;
  source: string;
  reason: string | null;
  snapshot: unknown;
  createdAt: string;
  teamId: string | null;
  changes: TimelineChange[];
}

export interface ActionMeta {
  /** Short uppercase label shown on the event badge. */
  label: string;
  /** Tailwind classes for the badge (semantic, fixed colors — not themed). */
  badgeClass: string;
  /** Tailwind class for the timeline dot. */
  dotClass: string;
}

/** Badge styling + label for each stored action. Semantic colors, not accent. */
export const ACTION_META: Record<string, ActionMeta> = {
  CREATE: { label: "CREATED", badgeClass: "bg-green-100 text-green-700", dotClass: "bg-green-500" },
  UPDATE: { label: "UPDATED", badgeClass: "bg-indigo-100 text-indigo-700", dotClass: "bg-indigo-500" },
  STATUS_CHANGE: { label: "STATUS", badgeClass: "bg-teal-100 text-teal-700", dotClass: "bg-teal-500" },
  OWNERSHIP_CHANGE: { label: "OWNERSHIP", badgeClass: "bg-violet-100 text-violet-700", dotClass: "bg-violet-500" },
  ASSIGNMENT_CHANGE: { label: "ASSIGNMENT", badgeClass: "bg-sky-100 text-sky-700", dotClass: "bg-sky-500" },
  PERMISSION_CHANGE: { label: "PERMISSION", badgeClass: "bg-fuchsia-100 text-fuchsia-700", dotClass: "bg-fuchsia-500" },
  WEEKLY_UPDATE: { label: "WEEKLY", badgeClass: "bg-amber-100 text-amber-700", dotClass: "bg-amber-500" },
  BULK_UPDATE: { label: "BULK", badgeClass: "bg-purple-100 text-purple-700", dotClass: "bg-purple-500" },
  DELETE: { label: "DELETED", badgeClass: "bg-red-100 text-red-600", dotClass: "bg-red-500" },
  ARCHIVE: { label: "ARCHIVED", badgeClass: "bg-red-100 text-red-600", dotClass: "bg-red-500" },
  RESTORE: { label: "RESTORED", badgeClass: "bg-emerald-100 text-emerald-700", dotClass: "bg-emerald-500" },
  COMMENT: { label: "COMMENT", badgeClass: "bg-slate-100 text-slate-600", dotClass: "bg-slate-400" },
};

export function actionMeta(action: string): ActionMeta {
  return (
    ACTION_META[action] ?? {
      label: action,
      badgeClass: "bg-gray-100 text-gray-600",
      dotClass: "bg-gray-400",
    }
  );
}

/**
 * Actions that are only meaningful when they carry field-level changes. A
 * generic field edit (and its sub-classifications) renders the diff list and
 * nothing else, so one with zero changes has no information to show.
 */
const UPDATE_LIKE_ACTIONS = [
  "UPDATE",
  "STATUS_CHANGE",
  "OWNERSHIP_CHANGE",
  "ASSIGNMENT_CHANGE",
  "PERMISSION_CHANGE",
] as const;

/** True for the generic-edit family of actions (UPDATE + its classifications). */
export function isUpdateLikeAction(action: string): boolean {
  return (UPDATE_LIKE_ACTIONS as readonly string[]).includes(action);
}

/** True when a snapshot carries no displayable content (null / {} / []). */
function snapshotIsEmpty(snapshot: unknown): boolean {
  if (snapshot === null || snapshot === undefined) return true;
  if (Array.isArray(snapshot)) return snapshot.length === 0;
  if (typeof snapshot === "object") return Object.keys(snapshot).length === 0;
  return false; // a primitive snapshot counts as content
}

/**
 * Whether an event is worth showing in the timeline.
 *
 * Filters out the "empty UPDATE" noise: legacy recompute logs (and any future
 * no-op edits) that backfilled as an UPDATE-family event with zero field
 * changes and no snapshot. Those render as "No field changes recorded" and add
 * nothing — one appeared per weekly save, doubling the timeline.
 *
 * Everything else (CREATE, DELETE, COMMENT, WEEKLY_UPDATE, BULK_UPDATE,
 * RESTORE) is always meaningful via its snapshot, so it's never pruned.
 */
export function isMeaningfulEvent(e: {
  action: string;
  changes?: readonly unknown[];
  snapshot?: unknown;
}): boolean {
  if (!isUpdateLikeAction(e.action)) return true;
  const hasChanges = (e.changes?.length ?? 0) > 0;
  return hasChanges || !snapshotIsEmpty(e.snapshot);
}

/** Drop the empty-UPDATE noise from a timeline (see {@link isMeaningfulEvent}). */
export function pruneEmptyEvents<
  T extends { action: string; changes?: readonly unknown[]; snapshot?: unknown },
>(events: T[]): T[] {
  return events.filter(isMeaningfulEvent);
}

/** Tab counts for All / Create / Update / Delete. */
export function bucketCounts(events: TimelineEvent[]): {
  all: number;
  create: number;
  update: number;
  delete: number;
} {
  const counts = { all: events.length, create: 0, update: 0, delete: 0 };
  for (const e of events) {
    counts[actionBucket(e.action)] += 1;
  }
  return counts;
}

/** Filter events by the active tab bucket ("all" returns everything). */
export function filterByBucket(
  events: TimelineEvent[],
  bucket: AuditFilterBucket | "all",
): TimelineEvent[] {
  if (bucket === "all") return events;
  return events.filter((e) => actionBucket(e.action) === bucket);
}

/** Case-insensitive search over actor, action label, field names, and values. */
/**
 * Recursively collect the searchable primitive strings out of an audit
 * snapshot (the `snapshot` blob holds the real content of WEEKLY_UPDATE /
 * BULK_UPDATE / CREATE / COMMENT / DELETE events — week numbers, values,
 * notes, statuses, names — none of which live in `changes`).
 *
 * `weekNumber` keys also emit a synthesized `"week N"` token so the visible
 * "… · Week 5" header is matchable by typing "week 5". Bounded depth keeps a
 * pathological/cyclic snapshot from hanging the filter.
 */
function collectSnapshotStrings(value: unknown, out: string[], depth = 0): void {
  if (value === null || value === undefined || depth > 6) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectSnapshotStrings(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/week/i.test(k) && (typeof v === "string" || typeof v === "number")) {
        out.push(`week ${v}`);
      }
      collectSnapshotStrings(v, out, depth + 1);
    }
  }
}

/**
 * Build the lower-cased, space-joined haystack a query is matched against.
 * Includes the actor, the action in every form the user might type (badge
 * label "WEEKLY", normalized "weekly update", raw enum), the reason, each
 * change's human field label + old/new values, and the snapshot content.
 *
 * `fieldLabel` resolves a field name to its display label — defaults to the
 * KPI map for back-compat, but the panel passes the active entity's resolver
 * so Priority / WWW / Critical search their own labels.
 */
function eventHaystack(
  e: TimelineEvent,
  fieldLabel: (field: string) => string,
): string {
  const parts: string[] = [
    e.actorName,
    actionMeta(e.action).label,
    e.action.replace(/_/g, " "),
    e.action,
  ];
  if (e.reason) parts.push(e.reason);
  for (const c of e.changes) {
    parts.push(fieldLabel(c.fieldName));
    if (c.oldValue != null) parts.push(String(c.oldValue));
    if (c.newValue != null) parts.push(String(c.newValue));
  }
  collectSnapshotStrings(e.snapshot, parts);
  return parts.join(" ").toLowerCase();
}

/**
 * Filter the timeline to events matching `query`.
 *
 * The query is tokenized on whitespace; punctuation-only tokens (e.g. the "·"
 * separator the cards render) are dropped, and ALL remaining tokens must appear
 * somewhere in the event's haystack (AND search). This makes the visible text
 * searchable in pieces — "Weekly", "Weekly Update", and "Weekly update · Week
 * 5" all match the same WEEKLY_UPDATE event — instead of requiring one exact
 * contiguous substring.
 */
export function searchEvents(
  events: TimelineEvent[],
  query: string,
  fieldLabel: (field: string) => string = kpiFieldLabel,
): TimelineEvent[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    // Trim leading/trailing punctuation (drops a bare "·" separator) but keep
    // internal punctuation so "on-track" stays one token.
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  if (tokens.length === 0) return events;
  return events.filter((e) => {
    const haystack = eventHaystack(e, fieldLabel);
    return tokens.every((t) => haystack.includes(t));
  });
}

// Audit timestamps are stored in UTC; we display them in the VIEWER's local
// timezone (the browser default — no `timeZone` option). Day bucketing uses
// local calendar parts too, so "Today"/"Yesterday" boundaries line up with the
// viewer's local midnight rather than UTC midnight.
//
// The formatters are built ONCE at module load and reused for every row.
// Constructing an Intl.DateTimeFormat is the expensive part; `toLocaleString`
// rebuilds one on each call, so an audit drawer with many rows would pay that
// cost dozens of times per open. Reusing one instance avoids that.
const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Human day label: "Today" / "Yesterday" / "02 Apr 2026". `now` injected. */
export function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return DATE_FMT.format(d);
}

/**
 * Contextual card timestamp (AC-1.23): "HH:MM" for today, "yesterday HH:MM"
 * for yesterday, and "DD Mon YYYY HH:MM" for older days. `now` injected.
 */
export function formatTimestamp(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = TIME_FMT.format(d);
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays <= 0) return time;
  if (diffDays === 1) return `yesterday ${time}`;
  return `${DATE_FMT.format(d)} ${time}`;
}

export interface DayGroup {
  label: string;
  events: TimelineEvent[];
}

/** Group a newest-first event list into day buckets, preserving order. */
export function groupEventsByDay(events: TimelineEvent[], now: Date): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;
  for (const e of events) {
    const label = dayLabel(e.createdAt, now);
    if (!current || current.label !== label) {
      current = { label, events: [] };
      groups.push(current);
    }
    current.events.push(e);
  }
  return groups;
}

export interface ActorChip {
  userId: string;
  name: string;
  initials: string;
}

/** Distinct actors across the timeline, for the avatar cluster. */
export function uniqueActors(events: TimelineEvent[]): ActorChip[] {
  const seen = new Map<string, ActorChip>();
  for (const e of events) {
    if (!seen.has(e.actorUserId)) {
      seen.set(e.actorUserId, {
        userId: e.actorUserId,
        name: e.actorName,
        initials: initialsOf(e.actorName),
      });
    }
  }
  return [...seen.values()];
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Deterministic accent color for an actor avatar, seeded by name. */
export function avatarColor(seed: string): string {
  const palette = [
    "#6366f1", "#0ea5e9", "#10b981", "#f59e0b",
    "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length]!;
}

/** Pretty-print a stored JSON value for display in a diff row. */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length ? value : "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** True for a plain object value (not array, not null). */
export function isObjectValue(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True for an array value. */
export function isArrayValue(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

/** Whether a change should render as a nested (object/array) sub-diff. */
export function isStructuredChange(oldValue: unknown, newValue: unknown): boolean {
  return (
    isObjectValue(oldValue) || isObjectValue(newValue) ||
    isArrayValue(oldValue) || isArrayValue(newValue)
  );
}

/** Stable id for a nested structured-diff row within an event's change list. */
export function nestedChangeId(eventId: string, changeIndex: number): string {
  return `${eventId}::${changeIndex}`;
}

/**
 * Enumerate every collapsible UNIT in a timeline as a flat list of stable ids —
 * the single source of truth for the Change History panel's expand/collapse:
 *
 *   - CREATE / BULK_UPDATE cards     → the event id
 *   - each structured (object/array) change inside an UPDATE-like event
 *                                     → `nestedChangeId(eventId, i)`
 *
 * "Expand all" sets the open set to exactly this list; "Collapse all" empties
 * it; `length` is the "N expandable" count. Keeping the enumeration here (pure,
 * deterministic) lets the component stay a thin renderer over one Set.
 */
export function expandableIds(events: TimelineEvent[]): string[] {
  const ids: string[] = [];
  for (const e of events) {
    if (e.action === "CREATE" || e.action === "BULK_UPDATE") {
      ids.push(e.id);
    } else if (isUpdateLikeAction(e.action)) {
      e.changes.forEach((c, i) => {
        // Only OBJECT diffs render a collapsible sub-table; array diffs render
        // as an inline added/removed summary (no toggle), so they aren't
        // expandable units — matching the ChangeRow render branches.
        if (isCollapsibleObjectChange(c.oldValue, c.newValue)) ids.push(nestedChangeId(e.id, i));
      });
    }
  }
  return ids;
}

/** A change that renders as a collapsible per-key object table (not an array). */
export function isCollapsibleObjectChange(oldValue: unknown, newValue: unknown): boolean {
  return (
    isStructuredChange(oldValue, newValue) &&
    !isArrayValue(oldValue) &&
    !isArrayValue(newValue)
  );
}

export interface KeyDiff {
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

/**
 * Per-key diff of two object values (e.g. weeklyTargets). Returns only the
 * keys whose value changed. Numeric keys are sorted numerically (so weeks come
 * out 1..13), everything else lexically.
 */
export function diffObjectKeys(oldValue: unknown, newValue: unknown): KeyDiff[] {
  const o = isObjectValue(oldValue) ? oldValue : {};
  const n = isObjectValue(newValue) ? newValue : {};
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
  keys.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const out: KeyDiff[] = [];
  for (const k of keys) {
    if (!valuesEqual(o[k], n[k])) {
      out.push({ key: k, oldValue: o[k] ?? null, newValue: n[k] ?? null });
    }
  }
  return out;
}

/** Added / removed entries between two array values (e.g. ownerIds). */
export function diffArrayValues(
  oldValue: unknown,
  newValue: unknown,
): { added: unknown[]; removed: unknown[] } {
  const o = isArrayValue(oldValue) ? oldValue : [];
  const n = isArrayValue(newValue) ? newValue : [];
  const oSet = new Set(o.map((x) => JSON.stringify(x)));
  const nSet = new Set(n.map((x) => JSON.stringify(x)));
  return {
    added: n.filter((x) => !oSet.has(JSON.stringify(x))),
    removed: o.filter((x) => !nSet.has(JSON.stringify(x))),
  };
}

/** Label a purely-numeric key as "W{n}" (for weekly maps); else return as-is. */
export function weekKeyLabel(key: string): string {
  return /^\d+$/.test(key) ? `W${key}` : key;
}

/**
 * Human label for the set of weeks touched by a bulk save:
 *   []        → "weekly values"
 *   [1]       → "week 1"          (not the buggy-looking "weeks 1–1")
 *   [2,3,4]   → "weeks 2–4"       (contiguous run)
 *   [2,5]     → "weeks 2, 5"      (gaps listed explicitly)
 */
export function weekRangeLabel(weeks: number[]): string {
  const sorted = [...new Set(weeks.filter((w) => Number.isFinite(w)))].sort((a, b) => a - b);
  if (sorted.length === 0) return "weekly values";
  if (sorted.length === 1) return `week ${sorted[0]}`;
  const contiguous = sorted.every((w, i) => i === 0 || w === sorted[i - 1]! + 1);
  return contiguous
    ? `weeks ${sorted[0]}–${sorted[sorted.length - 1]}`
    : `weeks ${sorted.join(", ")}`;
}

/** Serialize the timeline to a downloadable JSON string. */
export function exportEventsJSON(events: TimelineEvent[]): string {
  return JSON.stringify(events, null, 2);
}
