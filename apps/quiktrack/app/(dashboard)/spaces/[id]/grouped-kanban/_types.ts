export interface GroupedBoardStatus {
  id: string;
  name: string;
  color: string | null;
  category: string;
  orderIndex: number;
}

export interface GroupedBoardTask {
  id: string;
  key: string;
  title: string;
  type: string;
  priority: string;
  statusId: string;
  sprintId: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  epicId: string | null;
  groupId: string | null;
  orderInGroup: number;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  eta: number | null;
  updatedAt: string;
}

export interface GroupedBoardGroup {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  order: number;
  isDefault: boolean;
  isCollapsed: boolean;
  taskCount: number;
  tasks: GroupedBoardTask[];
}

export interface GroupedBoardPayload {
  projectId: string;
  defaultGroupId: string;
  statuses: GroupedBoardStatus[];
  groups: GroupedBoardGroup[];
}

export interface BoardMemberLite {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    avatar?: string | null;
  } | null;
}

export interface SprintLite {
  id: string;
  name: string;
  status: string;
}

export interface GroupedBoardFilters {
  /**
   * `"all"` (default) = union of every ACTIVE sprint's tasks.
   * A specific sprint id = only that sprint (and only if it's ACTIVE; the
   * server returns zero rows otherwise). Backlog and non-active sprints
   * are NEVER shown on this board — Grouped Kanban is active-work only.
   */
  sprintId: string;
  assigneeId: string;
  priority: string;
  type: string;
  search: string;
  /** Serialized CustomFilter[] (JSON) — empty string when none. */
  customFilters: string;
}

export const EMPTY_FILTERS: GroupedBoardFilters = {
  sprintId: "all",
  assigneeId: "",
  priority: "",
  type: "",
  search: "",
  customFilters: "",
};
