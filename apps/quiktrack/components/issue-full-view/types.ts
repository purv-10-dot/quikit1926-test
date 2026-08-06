/**
 * Shared types for the full-page issue view. Kept in their own file so the
 * orchestrator + details panel both stay under the 300 LOC ceiling without
 * a circular import.
 */

import type { CustomFieldDTO } from "@/lib/services/customFields";
import type { FieldValue } from "@/lib/customFields/registry";

export type IssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";
export type Priority = "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST";

export interface IssueParent {
  id: string;
  key: string;
  title: string;
  type: IssueType;
}

export interface IssueEpic {
  id: string;
  key: string;
  title: string;
}

export interface IssueSubtask {
  id: string;
  key: string;
  title: string;
  priority?: Priority | null;
  assigneeId?: string | null;
  statusId?: string | null;
  status?: { id: string; name: string; category: string } | null;
}

export interface IssuePageData {
  id: string;
  key: string;
  title: string;
  description: string | null;
  type: IssueType;
  statusId: string;
  status?: {
    id: string;
    name: string;
    color: string;
    category: string;
  } | null;
  priority: Priority;
  assigneeId: string | null;
  parentId: string | null;
  parent?: IssueParent | null;
  epicId: string | null;
  epic?: IssueEpic | null;
  sprintId: string | null;
  startDate: string | null;
  dueDate: string | null;
  storyPoints: number | null;
  eta: number | null;
  reporterId: string | null;
  projectId: string;
  subtasks?: IssueSubtask[];
  timeLogs?: { id: string; hours: number }[];
  customFields?: CustomFieldDTO[];
  customFieldValues?: Record<string, FieldValue>;
}
