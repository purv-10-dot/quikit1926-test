import type {
  BoardMemberLite,
  GroupedBoardGroup,
  GroupedBoardStatus,
  GroupedBoardTask,
} from "../_types";

/**
 * Grouped Kanban supports two grouping axes:
 *  - `"manual"` — the user's own QtTaskGroup rows (the original behaviour). Tasks
 *    are bucketed by `groupId` server-side; dragging changes `groupId`.
 *  - a field mode (`status` | `priority` | `assignee` | `type`) — groups are
 *    *derived* on the client from a task field. There is no QtTaskGroup row
 *    behind these; dragging a task into a derived group mutates that field on
 *    the issue (see `decodeFieldPatch`).
 */
export type GroupByMode = "manual" | "status" | "priority" | "assignee" | "type" | "epic";

export const GROUP_BY_OPTIONS: { value: GroupByMode; label: string }[] = [
  { value: "manual", label: "Custom groups" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "type", label: "Type" },
  { value: "epic", label: "Epic" },
];

/** Epic groups share one purple accent (epics have no per-row color). */
const EPIC_COLOR = "#a855f7";

/** A linked epic, used to label epic-mode groups. */
export interface GroupedBoardEpicLite {
  id: string;
  key: string;
  title: string;
}

export function isFieldMode(mode: GroupByMode): boolean {
  return mode !== "manual";
}

/** Priority buckets in display order. Colors mirror the toolbar filter dots. */
const PRIORITY_BUCKETS: { value: string; label: string; color: string }[] = [
  { value: "HIGHEST", label: "Highest", color: "#dc2626" },
  { value: "HIGH", label: "High", color: "#ea580c" },
  { value: "MEDIUM", label: "Medium", color: "#d97706" },
  { value: "LOW", label: "Low", color: "#0284c7" },
  { value: "LOWEST", label: "Lowest", color: "#2563eb" },
];

/** Type buckets in display order. EPIC/SUBTASK never reach this board. */
const TYPE_BUCKETS: { value: string; label: string; color: string }[] = [
  { value: "TASK", label: "Task", color: "#3b82f6" },
  { value: "BUG", label: "Bug", color: "#ef4444" },
  { value: "STORY", label: "Story", color: "#10b981" },
];

const UNASSIGNED_VALUE = "";
const DELIM = "::";
const DEFAULT_COLOR = "#94a3b8";

/** Encode a virtual group id as `<mode>::<fieldValue>` (value may be empty). */
export function encodeVirtualGroupId(mode: GroupByMode, value: string): string {
  return `${mode}${DELIM}${value}`;
}

/**
 * Decode a virtual group id back into the issue patch that "moving" a task into
 * that group should apply. Returns null for manual mode or an unparseable id.
 */
export function decodeFieldPatch(
  virtualGroupId: string,
): Partial<GroupedBoardTask> | null {
  const idx = virtualGroupId.indexOf(DELIM);
  if (idx < 0) return null;
  const mode = virtualGroupId.slice(0, idx) as GroupByMode;
  const value = virtualGroupId.slice(idx + DELIM.length);
  switch (mode) {
    case "status":
      return value ? { statusId: value } : null;
    case "priority":
      return value ? { priority: value } : null;
    case "type":
      return value ? { type: value } : null;
    case "assignee":
      return { assigneeId: value === UNASSIGNED_VALUE ? null : value };
    case "epic":
      return { epicId: value === UNASSIGNED_VALUE ? null : value };
    default:
      return null;
  }
}

function memberLabel(m: BoardMemberLite["user"]): string {
  if (!m) return "Unknown";
  const full = [m.firstName, m.lastName].filter(Boolean).join(" ").trim();
  return full || m.email;
}

/** Deterministic dot color for an assignee, matching the toolbar's scheme. */
function assigneeColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

function makeGroup(
  mode: GroupByMode,
  value: string,
  name: string,
  color: string,
  order: number,
  tasks: GroupedBoardTask[],
): GroupedBoardGroup {
  return {
    id: encodeVirtualGroupId(mode, value),
    name,
    color: color || DEFAULT_COLOR,
    icon: null,
    order,
    isDefault: false,
    isCollapsed: false,
    taskCount: tasks.length,
    tasks: [...tasks].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

interface DeriveContext {
  statuses: GroupedBoardStatus[];
  members: BoardMemberLite[];
  epics: GroupedBoardEpicLite[];
}

/**
 * Build the virtual group list for a field mode. Status/priority/type show every
 * known bucket (board-like, even when empty); assignee shows only members who
 * own work plus an "Unassigned" bucket when needed. Unknown values found on
 * tasks (e.g. a legacy priority) are appended so no task is ever dropped.
 */
export function deriveFieldGroups(
  mode: GroupByMode,
  tasks: GroupedBoardTask[],
  { statuses, members, epics }: DeriveContext,
): GroupedBoardGroup[] {
  if (mode === "manual") return [];

  const bucketed = new Map<string, GroupedBoardTask[]>();
  const keyOf = (t: GroupedBoardTask): string => {
    switch (mode) {
      case "status":
        return t.statusId;
      case "priority":
        return t.priority;
      case "type":
        return t.type;
      case "assignee":
        return t.assigneeId ?? UNASSIGNED_VALUE;
      case "epic":
        return t.epicId ?? UNASSIGNED_VALUE;
      default:
        return UNASSIGNED_VALUE;
    }
  };
  for (const t of tasks) {
    const k = keyOf(t);
    const arr = bucketed.get(k);
    if (arr) arr.push(t);
    else bucketed.set(k, [t]);
  }

  const groups: GroupedBoardGroup[] = [];
  const seen = new Set<string>();

  if (mode === "status") {
    for (const s of statuses) {
      seen.add(s.id);
      groups.push(
        makeGroup(mode, s.id, s.name, s.color ?? DEFAULT_COLOR, groups.length, bucketed.get(s.id) ?? []),
      );
    }
  } else if (mode === "priority") {
    for (const b of PRIORITY_BUCKETS) {
      seen.add(b.value);
      groups.push(makeGroup(mode, b.value, b.label, b.color, groups.length, bucketed.get(b.value) ?? []));
    }
  } else if (mode === "type") {
    for (const b of TYPE_BUCKETS) {
      seen.add(b.value);
      groups.push(makeGroup(mode, b.value, b.label, b.color, groups.length, bucketed.get(b.value) ?? []));
    }
  } else if (mode === "assignee") {
    for (const m of members) {
      if (!m.user) continue;
      const id = m.user.id;
      if (!bucketed.has(id)) continue; // only surface members who own work
      seen.add(id);
      groups.push(
        makeGroup(mode, id, memberLabel(m.user), assigneeColor(id), groups.length, bucketed.get(id) ?? []),
      );
    }
  } else if (mode === "epic") {
    for (const e of epics) {
      if (!bucketed.has(e.id)) continue; // only surface epics that own work
      seen.add(e.id);
      groups.push(
        makeGroup(mode, e.id, `${e.key} · ${e.title}`, EPIC_COLOR, groups.length, bucketed.get(e.id) ?? []),
      );
    }
  }

  // Catch-all: any value present on tasks that wasn't covered above (e.g. an
  // assignee no longer on the board, a task with no epic, or an unexpected enum).
  for (const [value, list] of bucketed) {
    if (seen.has(value)) continue;
    let name: string;
    if (value === UNASSIGNED_VALUE) {
      name = mode === "epic" ? "No epic" : "Unassigned";
    } else {
      name = value || "—";
    }
    groups.push(makeGroup(mode, value, name, DEFAULT_COLOR, groups.length, list));
  }

  return groups;
}
