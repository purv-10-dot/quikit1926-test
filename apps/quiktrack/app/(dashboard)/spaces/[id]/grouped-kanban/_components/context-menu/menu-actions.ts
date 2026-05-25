import type { GroupedBoardTask } from "../../_types";

export interface MenuActionContext {
  task: GroupedBoardTask;
  defaultGroupId: string;
  isDefaultGroup: boolean;
  openDetail: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  moveToGroup: (taskId: string, toGroupId: string | null) => void;
  duplicateTask?: (taskId: string) => void;
  groups: { id: string; name: string; isDefault: boolean }[];
}

export interface MenuAction {
  id: string;
  label: string;
  shortcut?: string;
  danger?: boolean;
  when?: (ctx: MenuActionContext) => boolean;
  run?: (ctx: MenuActionContext) => void;
  submenu?: (ctx: MenuActionContext) => MenuAction[];
}

export const DEFAULT_TASK_ACTIONS: MenuAction[] = [
  {
    id: "open",
    label: "Open task",
    shortcut: "↵",
    run: ({ task, openDetail }) => openDetail(task.id),
  },
  {
    id: "group-move",
    label: "Move to group",
    submenu: ({ groups }) =>
      groups.map((g) => ({
        id: `move-${g.id}`,
        label: g.name,
        run: ({ task, moveToGroup, defaultGroupId }) =>
          moveToGroup(task.id, g.id === defaultGroupId ? null : g.id),
      })),
  },
  {
    id: "all-tasks",
    label: "All tasks",
    submenu: () => [
      {
        id: "select-all-in-group",
        label: "Select all in group",
        run: () => {
          window.dispatchEvent(new CustomEvent("qt:grouped:select-all-in-group"));
        },
      },
      {
        id: "select-all-board",
        label: "Select every task on board",
        run: () => {
          window.dispatchEvent(new CustomEvent("qt:grouped:select-all-board"));
        },
      },
    ],
  },
  {
    id: "duplicate",
    label: "Duplicate task",
    when: ({ duplicateTask }) => Boolean(duplicateTask),
    run: ({ task, duplicateTask }) => duplicateTask?.(task.id),
  },
  {
    id: "delete",
    label: "Delete task",
    shortcut: "Del",
    danger: true,
    run: ({ task, deleteTask }) => deleteTask(task.id),
  },
];

const registered: MenuAction[] = [];

export function registerTaskAction(action: MenuAction): void {
  registered.push(action);
}

export function getTaskActions(): MenuAction[] {
  return [...DEFAULT_TASK_ACTIONS, ...registered];
}
