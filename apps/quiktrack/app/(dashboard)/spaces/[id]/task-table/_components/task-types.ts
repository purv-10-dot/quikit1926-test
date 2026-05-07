import type { LucideIcon } from "lucide-react";
import { Bug, BookOpen, CheckSquare, ListTree, Zap } from "lucide-react";

export type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";

export interface TaskIssue {
  id: string;
  key: string;
  title: string;
  type: IssueType;
  statusId: string;
  priority: string | null;
  parentId: string | null;
  epicId: string | null;
  sprintId: string | null;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
  eta: number | null;
  storyPoints: number | null;
  updatedAt: string;
  subtaskCount: number;
  /** own eta + sum of descendants' eta — computed server-side per page. */
  rolledUpEta: number;
}

export const TYPE_META: Record<IssueType, { Icon: LucideIcon; color: string; label: string }> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500", label: "Task" },
  BUG: { Icon: Bug, color: "text-red-500", label: "Bug" },
  STORY: { Icon: BookOpen, color: "text-green-500", label: "Story" },
  EPIC: { Icon: Zap, color: "text-purple-500", label: "Epic" },
  SUBTASK: { Icon: ListTree, color: "text-gray-500", label: "Subtask" },
};

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

export interface SprintLite {
  id: string;
  name: string;
}

export interface EpicLite {
  id: string;
  key: string;
  title: string;
}

export function shortId(id: string): string {
  return id.slice(-6).toUpperCase();
}

export function userInitials(u: UserLite): string {
  return (
    (u.firstName?.[0] ?? u.email[0] ?? "?").toUpperCase() +
    (u.lastName?.[0] ?? "").toUpperCase()
  );
}

export function userDisplayName(u: UserLite): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

export function fmtMdy(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}
