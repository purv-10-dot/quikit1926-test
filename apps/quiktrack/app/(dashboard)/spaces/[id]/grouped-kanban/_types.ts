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

/**
 * Sentinel sprintId used when the project has NO active sprint. The grouped
 * board endpoint receives this string, finds zero matching rows, and
 * returns the group skeletons with empty `tasks[]`.
 */
export const NO_ACTIVE_SPRINT_SENTINEL = "__no_active_sprint__";

export interface GroupedBoardFilters {
  sprintId: string;
  assigneeId: string;
  priority: string;
  type: string;
  search: string;
}

export const EMPTY_FILTERS: GroupedBoardFilters = {
  sprintId: NO_ACTIVE_SPRINT_SENTINEL,
  assigneeId: "",
  priority: "",
  type: "",
  search: "",
};
