// ─── Shared status constants ────────────────────────────────────────────────
// Single source of truth for all status labels, colors, and option lists.
// Import from here instead of re-defining per file.

// ── Priority / WWW status ────────────────────────────────────────────────────

export type ItemStatus =
  | "not-applicable"
  | "not-yet-started"
  | "behind-schedule"
  | "on-track"
  | "completed";

export const STATUS_META: Record<ItemStatus, { label: string; bg: string; text: string; border: string }> = {
  "not-applicable":  { label: "Not Applicable",  bg: "bg-gray-100",   text: "text-gray-500",  border: "border-gray-200"  },
  "not-yet-started": { label: "Not Yet Started", bg: "bg-red-50",     text: "text-red-600",   border: "border-red-200"   },
  "behind-schedule": { label: "Behind Schedule", bg: "bg-amber-50",   text: "text-amber-600", border: "border-amber-200" },
  "on-track":        { label: "On Track",        bg: "bg-green-50",   text: "text-green-600", border: "border-green-200" },
  "completed":       { label: "Completed",       bg: "bg-blue-50",    text: "text-blue-600",  border: "border-blue-200"  },
};

/** Dot color used in tables / badges */
export const STATUS_DOT: Record<ItemStatus, string> = {
  "not-applicable":  "bg-gray-400",
  "not-yet-started": "bg-red-500",
  "behind-schedule": "bg-amber-400",
  "on-track":        "bg-green-500",
  "completed":       "bg-blue-500",
};

/** Options array for <select> / FilterPicker */
export const STATUS_OPTIONS: { value: ItemStatus | ""; label: string }[] = [
  { value: "",                label: "All statuses"    },
  { value: "not-applicable",  label: "Not Applicable"  },
  { value: "not-yet-started", label: "Not Yet Started" },
  { value: "behind-schedule", label: "Behind Schedule" },
  { value: "on-track",        label: "On Track"        },
  { value: "completed",       label: "Completed"       },
];

// ── KPI status ───────────────────────────────────────────────────────────────

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
