// ─── Shared status constants ────────────────────────────────────────────────
// Single source of truth for all status labels, colors, and option lists.
// Import from here instead of re-defining per file.
//
// Canonical order (UI-facing):
//   1. Not Applicable
//   2. Not Yet Started
//   3. Behind Schedule
//   4. On Track
//   5. Completed
//   6. Clear  (empty string — used to reset a status)

// ── Priority / WWW / OPSP Review item status ────────────────────────────────

export type ItemStatus =
  | "not-applicable"
  | "not-yet-started"
  | "behind-schedule"
  | "on-track"
  | "completed";

/** Canonical order — every UI list must follow this. */
export const ITEM_STATUS_ORDER: ItemStatus[] = [
  "not-applicable",
  "not-yet-started",
  "behind-schedule",
  "on-track",
  "completed",
];

/** Badge-style colors (light bg, dark text) — for inline badges & list items */
export const STATUS_META: Record<ItemStatus, { label: string; bg: string; text: string; border: string }> = {
  "not-applicable":  { label: "Not Applicable",  bg: "bg-gray-100",   text: "text-gray-500",  border: "border-gray-200"  },
  "not-yet-started": { label: "Not Yet Started", bg: "bg-red-50",     text: "text-red-600",   border: "border-red-200"   },
  "behind-schedule": { label: "Behind Schedule", bg: "bg-amber-50",   text: "text-amber-600", border: "border-amber-200" },
  "on-track":        { label: "On Track",        bg: "bg-green-50",   text: "text-green-600", border: "border-green-200" },
  "completed":       { label: "Completed",       bg: "bg-blue-50",    text: "text-blue-600",  border: "border-blue-200"  },
};

/** Solid dot color — for table cells & small indicators */
export const STATUS_DOT: Record<ItemStatus, string> = {
  "not-applicable":  "bg-gray-400",
  "not-yet-started": "bg-red-500",
  "behind-schedule": "bg-amber-400",
  "on-track":        "bg-green-500",
  "completed":       "bg-blue-500",
};

/** Solid cell background + white text — for table cells that fill with color */
export const STATUS_CELL_BG: Record<ItemStatus, string> = {
  "not-applicable":  "bg-gray-400 text-white",
  "not-yet-started": "bg-red-500 text-white",
  "behind-schedule": "bg-amber-400 text-white",
  "on-track":        "bg-green-500 text-white",
  "completed":       "bg-blue-500 text-white",
};

/**
 * Resolve a status string to its label. Returns the raw value if unrecognised.
 */
export function statusLabel(status: string): string {
  return STATUS_META[status as ItemStatus]?.label ?? status;
}

/**
 * Resolve a status string to its solid cell color class.
 * Returns empty string for unrecognised / empty values.
 */
export function statusCellBg(status: string | null | undefined): string {
  if (!status) return "";
  return STATUS_CELL_BG[status as ItemStatus] ?? "";
}

/**
 * Resolve a status string to its dot color class.
 * Returns a neutral gray for unrecognised / empty values.
 */
export function statusDotColor(status: string | null | undefined): string {
  if (!status) return "bg-gray-100";
  return STATUS_DOT[status as ItemStatus] ?? "bg-gray-100";
}

// ── Option arrays (various shapes for different UI patterns) ────────────────

/** Filter dropdown — includes "All statuses" sentinel at the top */
export const STATUS_FILTER_OPTIONS: { value: ItemStatus | ""; label: string }[] = [
  { value: "",                label: "All statuses"    },
  ...ITEM_STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label })),
];

/** For backwards-compat: alias used in some older imports */
export const STATUS_OPTIONS = STATUS_FILTER_OPTIONS;

/** Edit form select — no "All statuses", just the 5 statuses (for <Select> component) */
export const STATUS_SELECT_OPTIONS: { value: string; label: string }[] =
  ITEM_STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label }));

/** Picker with color dots — used in table cell pickers (Priority weekly, WWW) + Clear */
export const STATUS_PICKER_OPTIONS: { value: string; label: string; color: string }[] = [
  ...ITEM_STATUS_ORDER.map((s) => ({ value: s, label: STATUS_META[s].label, color: STATUS_DOT[s] })),
  { value: "", label: "Clear", color: "bg-white border border-gray-300" },
];

/**
 * Pill-button picker — used in PriorityLogModal weekly tab.
 * Each option has selectedClass and baseClass for rich styling.
 */
export const STATUS_PILL_OPTIONS: {
  value: string;
  label: string;
  selectedClass: string;
  baseClass: string;
}[] = [
  { value: "not-applicable",  label: "Not Applicable",  selectedClass: "bg-gray-100 text-gray-600 border-gray-300 ring-2 ring-gray-300",     baseClass: "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"   },
  { value: "not-yet-started", label: "Not Yet Started", selectedClass: "bg-red-100 text-red-700 border-red-300 ring-2 ring-red-300",          baseClass: "bg-white text-gray-600 border-gray-200 hover:bg-red-50"    },
  { value: "behind-schedule", label: "Behind Schedule", selectedClass: "bg-amber-100 text-amber-700 border-amber-300 ring-2 ring-amber-300",  baseClass: "bg-white text-gray-600 border-gray-200 hover:bg-amber-50"  },
  { value: "on-track",        label: "On Track",        selectedClass: "bg-green-100 text-green-700 border-green-300 ring-2 ring-green-300",  baseClass: "bg-white text-gray-600 border-gray-200 hover:bg-green-50"  },
  { value: "completed",       label: "Completed",       selectedClass: "bg-accent-100 text-accent-700 border-accent-300 ring-2 ring-accent-300", baseClass: "bg-white text-gray-600 border-gray-200 hover:bg-accent-50" },
  { value: "",                label: "Clear",            selectedClass: "bg-gray-100 text-gray-500 border-gray-300 ring-2 ring-gray-200",     baseClass: "bg-white text-gray-300 border-gray-200 hover:bg-gray-50"   },
];

// ── KPI status (separate domain — active/paused/completed) ──────────────────

export type KPIStatus = "active" | "paused" | "completed";

export const KPI_STATUS_META: Record<KPIStatus, { label: string; bg: string; text: string }> = {
  active:    { label: "Active",    bg: "bg-green-50",  text: "text-green-600"  },
  paused:    { label: "Paused",    bg: "bg-amber-50",  text: "text-amber-600"  },
  completed: { label: "Completed", bg: "bg-blue-50",   text: "text-blue-600"   },
};

export const KPI_STATUS_OPTIONS: { value: KPIStatus | ""; label: string }[] = [
  { value: "",          label: "All statuses" },
  { value: "active",    label: "Active"       },
  { value: "paused",    label: "Paused"       },
  { value: "completed", label: "Completed"    },
];
