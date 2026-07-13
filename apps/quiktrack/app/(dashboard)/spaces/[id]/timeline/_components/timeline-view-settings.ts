/** Customizable Timeline "View settings" (Jira-style). Persisted per user +
 *  project via /api/view-prefs (see useTimelineViewSettings). */
export interface TimelineViewSettings {
  /** Hide work items whose status is in the DONE category. */
  hideDone: boolean;
  /** Show the Status column in the left grid. */
  showStatus: boolean;
  /** Show the Assignee column in the left grid. */
  showAssignee: boolean;
  /** Show the Start date column in the left grid (Gantt-style). */
  showStart: boolean;
  /** Show the Due date column in the left grid (Gantt-style). */
  showEnd: boolean;
  /** Show a ⚠ warning marker for overdue / undated items. */
  showWarnings: boolean;
  /** Timeline bar color: match the item's status, or one custom color. */
  barColor: "status" | "custom";
  /** Hex used when barColor === "custom". */
  customColor: string;
}

export const DEFAULT_TIMELINE_SETTINGS: TimelineViewSettings = {
  hideDone: false,
  showStatus: true,
  showAssignee: true,
  showStart: false,
  showEnd: false,
  showWarnings: true,
  barColor: "status",
  customColor: "#2563eb",
};

export const STATUS_COL_WIDTH = 120;
export const ASSIGNEE_COL_WIDTH = 150;
export const START_COL_WIDTH = 116;
export const END_COL_WIDTH = 116;

/** Derived progress % for a bar's fill (QuikTrack issues have no native
 *  progress field): Done → 100, In progress → 50, otherwise 0. */
export function progressForCategory(category: string | undefined): number {
  if (category === "DONE") return 100;
  if (category === "IN_PROGRESS") return 50;
  return 0;
}

/** Minimal project status shape needed by the timeline (pill + bar color). */
export interface TimelineStatus {
  id: string;
  name: string;
  category: string;
  color?: string | null;
}

/** Status category → color, used for status pills and "match status" bar color
 *  when a per-status hex isn't available. */
export function categoryColor(category: string | undefined): string {
  switch (category) {
    case "DONE":
      return "#16a34a";
    case "IN_PROGRESS":
      return "#2563eb";
    default:
      return "#6b7280"; // TODO / BACKLOG / unknown
  }
}
