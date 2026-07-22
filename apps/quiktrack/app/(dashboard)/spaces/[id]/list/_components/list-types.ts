import type { LucideIcon } from "lucide-react";
import { Bug, BookOpen, CheckSquare, Zap, ListTree } from "lucide-react";
import type { CustomFilter } from "@/lib/customFields/filterQuery";

export type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";
export type Priority = "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";

export interface IssueStatus {
  id: string;
  name: string;
  color: string;
  category: string;
}

export interface UserLite {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar: string | null;
}

export interface ListIssue {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  statusId: string;
  status: IssueStatus | null;
  priority: Priority | null;
  parentId: string | null;
  epicId: string | null;
  sprintId: string | null;
  sprint: { id: string; name: string } | null;
  assigneeId: string | null;
  assignee: UserLite | null;
  reporterId: string | null;
  reporter: UserLite | null;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  eta: number | null;
  createdAt: string;
  updatedAt: string;
  subtaskCount: number;
}

export const TYPE_META: Record<IssueType, { Icon: LucideIcon; color: string; label: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500", label: "Task" },
  BUG: { Icon: Bug, color: "text-red-500", label: "Bug" },
  STORY: { Icon: BookOpen, color: "text-green-500", label: "Story" },
  EPIC: { Icon: Zap, color: "text-purple-500", label: "Epic" },
  SUBTASK: { Icon: ListTree, color: "text-gray-500", label: "Subtask" },
};

export const PRIORITY_META: Record<Priority, { color: string; label: string }> = {
  HIGHEST: { color: "text-red-600", label: "Highest" },
  HIGH: { color: "text-orange-500", label: "High" },
  MEDIUM: { color: "text-yellow-500", label: "Medium" },
  LOW: { color: "text-blue-500", label: "Low" },
  LOWEST: { color: "text-gray-400", label: "Lowest" },
};

export type SortKey = "key" | "title" | "type" | "priority" | "statusId" | "assigneeId" | "dueDate" | "createdAt" | "updatedAt";

export interface ListFilters {
  search: string;
  statusId: string;
  type: string;
  priority: string;
  assigneeId: string;
  customFilters: CustomFilter[];
}

export const EMPTY_FILTERS: ListFilters = {
  search: "",
  statusId: "",
  type: "",
  priority: "",
  assigneeId: "",
  customFilters: [],
};

export function userLabel(u: UserLite | null): string {
  if (!u) return "Unassigned";
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}
