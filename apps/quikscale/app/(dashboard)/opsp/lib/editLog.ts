/**
 * Helpers for the OPSP "edit after finalize" change log.
 *
 * The editor mutates state through two funnels — `set(key, value)` and
 * `setArr(key, idx, value)` — so when an OPSP is finalized (and editable) we
 * derive a human-readable {field, label, old, new} descriptor for whatever
 * scalar actually changed, regardless of the field's shape (plain string,
 * string[], row-object grid, or a critical-number card).
 */

/** Top-level FormData key → section/field label shown in the note card + drawer. */
const SECTION_LABELS: Record<string, string> = {
  employees: "Employees",
  customers: "Customers",
  shareholders: "Shareholders",
  processItems: "Strengths / Core Competencies",
  weaknesses: "Weaknesses",
  coreValues: "Core Values / Beliefs",
  purpose: "Purpose",
  actions: "Actions (to live values)",
  profitPerX: "Profit / X",
  bhag: "BHAG",
  targetRows: "Targets (3–5 yrs)",
  sandbox: "Sandbox",
  keyThrusts: "Key Thrusts / Capabilities",
  brandPromiseKPIs: "Brand Promise KPIs",
  brandPromise: "Brand Promise",
  goalRows: "Goals (1 yr)",
  keyInitiatives: "Key Initiatives",
  criticalNumGoals: "Critical # (Goals)",
  balancingCritNumGoals: "Balancing Critical # (Goals)",
  makeBuy: "Make / Buy",
  sell: "Sell",
  recordKeeping: "Record Keeping",
  actionsQtr: "Actions (QTR)",
  rocks: "Rocks (Quarterly Priorities)",
  criticalNumProcess: "Critical # (Process)",
  balancingCritNumProcess: "Balancing Critical # (Process)",
  theme: "Theme",
  scoreboardDesign: "Scoreboard Design",
  celebration: "Celebration",
  reward: "Reward",
  kpiAccountability: "Accountability — KPIs",
  quarterlyPriorities: "Accountability — Quarterly Priorities",
  criticalNumAcct: "Critical # (Accountability)",
  balancingCritNumAcct: "Balancing Critical # (Accountability)",
  trends: "Trends",
};

/** Row sub-keys → label, for grid cells and card fields. */
const SUBKEY_LABELS: Record<string, string> = {
  category: "Category",
  projected: "Projected",
  desc: "Description",
  owner: "Owner",
  title: "Title",
  kpi: "KPI",
  goal: "Goal",
  priority: "Priority",
  dueDate: "Due date",
  y1: "Year 1", y2: "Year 2", y3: "Year 3", y4: "Year 4", y5: "Year 5",
  q1: "Q1", q2: "Q2", q3: "Q3", q4: "Q4",
  m1: "Month 1", m2: "Month 2", m3: "Month 3",
};

export function sectionLabel(key: string): string {
  return SECTION_LABELS[key] ?? humanize(key);
}

/**
 * Read a field's current value out of the form by dotted path
 * ("employees.0", "coreValues", "targetRows.2.projected"). Returns a display
 * string (empty when missing). Used to prefill the drawer's value editor.
 */
export function getFieldValue(form: Record<string, unknown>, path: string): string {
  let cur: unknown = form;
  for (const seg of path.split(".")) {
    if (cur == null) return "";
    cur = Array.isArray(cur)
      ? cur[Number(seg)]
      : (cur as Record<string, unknown>)[seg];
  }
  return toDisplay(cur);
}

/**
 * Immutably set a field's value by dotted path, cloning only along the path.
 * Sets the raw string value (computed grid cells are stored as strings; no
 * cascade/auto-fill is applied — a deliberate "raw" drawer edit).
 */
export function applyFieldPath<T extends Record<string, unknown>>(
  form: T,
  path: string,
  value: string,
): T {
  const segs = path.split(".");
  const root: Record<string | number, unknown> = Array.isArray(form)
    ? ([...(form as unknown[])] as unknown as Record<string | number, unknown>)
    : ({ ...(form as Record<string, unknown>) } as Record<string | number, unknown>);
  let cur: Record<string | number, unknown> = root;
  for (let i = 0; i < segs.length - 1; i++) {
    const key: string | number = Array.isArray(cur) ? Number(segs[i]) : segs[i];
    const child = cur[key];
    const cloned: unknown = Array.isArray(child)
      ? [...child]
      : child && typeof child === "object"
        ? { ...(child as Record<string, unknown>) }
        : child ?? {};
    cur[key] = cloned;
    cur = cloned as Record<string | number, unknown>;
  }
  const lastKey: string | number = Array.isArray(cur)
    ? Number(segs[segs.length - 1])
    : segs[segs.length - 1];
  cur[lastKey] = value;
  return root as unknown as T;
}

function subLabel(key: string): string {
  return SUBKEY_LABELS[key] ?? humanize(key);
}

/** "balancingCritNumGoals" → "Balancing Crit Num Goals" (fallback only). */
function humanize(s: string): string {
  return s
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

export interface PendingEdit {
  field: string; // stable path key, e.g. "targetRows.2.projected"
  label: string; // display label, e.g. "Targets (3–5 yrs) #3 · Projected"
  oldValue: string;
  newValue: string;
}

/** Coerce any scalar to a short display string. */
function toDisplay(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Walk two values in parallel and return the FIRST scalar that differs, along
 * with its path (array indices as numbers, object keys as strings). Returns
 * null when nothing scalar changed (e.g. identical, or a no-op object spread).
 */
function firstScalarDiff(
  oldVal: unknown,
  newVal: unknown,
  path: (string | number)[] = [],
): { path: (string | number)[]; old: unknown; new: unknown } | null {
  if (Array.isArray(oldVal) || Array.isArray(newVal)) {
    const a = Array.isArray(oldVal) ? oldVal : [];
    const b = Array.isArray(newVal) ? newVal : [];
    const len = Math.max(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
        const d = firstScalarDiff(a[i], b[i], [...path, i]);
        if (d) return d;
      }
    }
    return null;
  }
  if (isPlainObject(oldVal) || isPlainObject(newVal)) {
    const a = isPlainObject(oldVal) ? oldVal : {};
    const b = isPlainObject(newVal) ? newVal : {};
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        const d = firstScalarDiff(a[k], b[k], [...path, k]);
        if (d) return d;
      }
    }
    return null;
  }
  // Treat the "nothing" representations (undefined / null / "") as equivalent,
  // so a transition *between* them is NOT a change. This stops "Add New" — which
  // appends a fully-empty row — from registering as an (undefined/"" → "") edit
  // and popping the finalized-edit "Change logged" card for an empty row. Real
  // edits still register: "" → "x" and "x" → "" both differ here.
  const emptyish = (v: unknown) => v === undefined || v === null || v === "";
  if (emptyish(oldVal) && emptyish(newVal)) return null;
  return oldVal !== newVal ? { path, old: oldVal, new: newVal } : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function composeLabel(key: string, path: (string | number)[]): string {
  const base = sectionLabel(key);
  const parts: string[] = [base];
  for (const seg of path) {
    if (typeof seg === "number") {
      // Special-case crit-card bullets → "Threshold N"
      parts[parts.length - 1] = parts[parts.length - 1]; // no-op, index handled below
      parts.push(`#${seg + 1}`);
    } else {
      parts.push(subLabel(seg));
    }
  }
  // Join: section, then " #n", then " · subkey"
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) {
    out += parts[i].startsWith("#") ? ` ${parts[i]}` : ` · ${parts[i]}`;
  }
  return out;
}

/** Describe a `set(key, value)` change (any field shape). null = no scalar change. */
export function describeSetChange(key: string, oldVal: unknown, newVal: unknown): PendingEdit | null {
  // Grid-row deletion: the new array is the old one with a single row removed.
  // The plain index-wise diff below would misread this as a field edit on the
  // row that shifted up (e.g. "#7 Category: Renewal → No of presentations"), so
  // detect it first and log a proper "Row removed" entry instead. This covers
  // every set()-driven delete path (inline grids + the fullscreen modals).
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const removed = findSingleRemovedIndex(oldVal, newVal);
    if (removed !== -1) {
      return describeRowDeletion(key, removed, oldVal[removed]);
    }
  }
  const diff = firstScalarDiff(oldVal, newVal);
  if (!diff) return null;
  return {
    field: [key, ...diff.path].join("."),
    label: composeLabel(key, diff.path),
    oldValue: toDisplay(diff.old),
    newValue: toDisplay(diff.new),
  };
}

/**
 * Suffix that marks a grid-row *removal* in the finalized-edit change log.
 * A row deletion shifts every later row up, so `describeSetChange`'s scalar
 * diff would misread it as a field edit on the shifted row (and then the
 * commit gate would validate that shifted row — blocking, e.g., a delete when
 * the shifted-up row has an empty Projected). Deletions are logged under this
 * distinct field instead so the gate can recognise and always allow them.
 */
const ROW_DELETED_SUFFIX = "__deleted";

/** True when `field` is a grid-row deletion marker (see `describeRowDeletion`). */
export function isRowDeletionField(field: string): boolean {
  return field.endsWith(`.${ROW_DELETED_SUFFIX}`);
}

/**
 * Preferred row fields, in priority order, used to name a deleted row in the
 * change log. Different OPSP grids key their "identity" on different columns
 * (category grids → `category`; Key Thrusts/Initiatives → `desc`; Rocks /
 * Quarterly Priorities → `priority`; Accountability → `kpi`), so we pick the
 * first non-empty one instead of assuming `category`.
 */
const ROW_LABEL_KEYS = [
  "category",
  "desc",
  "priority",
  "title",
  "kpi",
  "name",
  "owner",
] as const;

/** First non-empty representative string on a row object (see ROW_LABEL_KEYS). */
function representativeRowLabel(row: unknown): string {
  if (isPlainObject(row)) {
    for (const k of ROW_LABEL_KEYS) {
      const v = row[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

/**
 * Describe a grid-row removal (e.g. deleting an ACTIONS (QTR) or GOALS (1 yr)
 * row). Produces a `PendingEdit` under the `<key>.<index>.__deleted` field so it
 * reads as a "Row removed" entry in the change log and bypasses the per-row
 * validity gate that guards ordinary field edits. The row is named by its first
 * non-empty representative column so the log works for every grid shape.
 */
export function describeRowDeletion(
  key: string,
  index: number,
  row: unknown,
): PendingEdit {
  const label = representativeRowLabel(row);
  return {
    field: `${key}.${index}.${ROW_DELETED_SUFFIX}`,
    label: `${sectionLabel(key)} · ${label || "#" + (index + 1)} · Row removed`,
    oldValue: label || `Row ${index + 1}`,
    newValue: "(removed)",
  };
}

/**
 * When exactly one row was removed from an array, return its index; else -1.
 *
 * A single deletion leaves the surviving rows otherwise untouched, just shifted
 * up from the removed index. We find the first index that differs, then verify
 * that `old` with that index spliced out equals `new`. Anything messier (a
 * simultaneous edit + delete, a reorder) returns -1 so the caller falls back to
 * the ordinary index-wise scalar diff.
 */
function findSingleRemovedIndex(oldArr: unknown[], newArr: unknown[]): number {
  if (newArr.length !== oldArr.length - 1) return -1;
  let d = 0;
  while (d < newArr.length && JSON.stringify(oldArr[d]) === JSON.stringify(newArr[d])) {
    d++;
  }
  // d is the candidate removed index (== last index when the whole prefix matched).
  for (let i = d; i < newArr.length; i++) {
    if (JSON.stringify(oldArr[i + 1]) !== JSON.stringify(newArr[i])) return -1;
  }
  return d;
}

/** Describe a `setArr(key, idx, value)` change (string-array element). */
export function describeArrChange(
  key: string,
  idx: number,
  oldVal: unknown,
  newVal: unknown,
): PendingEdit | null {
  if (oldVal === newVal) return null;
  return {
    field: `${key}.${idx}`,
    label: `${sectionLabel(key)} #${idx + 1}`,
    oldValue: toDisplay(oldVal),
    newValue: toDisplay(newVal),
  };
}
