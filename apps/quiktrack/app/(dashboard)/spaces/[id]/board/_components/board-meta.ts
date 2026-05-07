import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  CheckSquare,
  Bug,
  BookOpen,
  Zap,
  Link2,
  ChevronsUp,
  ChevronUp,
  ChevronsDown,
  ChevronDown,
  Equal,
} from "lucide-react";

export interface BoardStatus {
  id: string;
  name: string;
  color: string;
  category: "BACKLOG" | "TODO" | "IN_PROGRESS" | "DONE";
  isHidden: boolean;
}

export interface BoardIssue {
  id: string;
  key: string;
  title: string;
  type: "EPIC" | "TASK" | "STORY" | "BUG" | "SUBTASK" | string;
  statusId: string;
  priority: "HIGHEST" | "HIGH" | "MEDIUM" | "LOW" | "LOWEST" | string;
  assigneeId: string | null;
  parentId?: string | null;
  epicId?: string | null;
  dueDate?: string | null;
  subtaskCount?: number;
}

export interface EpicLite {
  id: string;
  key: string;
  title: string;
}

export const STATUS_ICON = (cat: BoardStatus["category"]) => {
  if (cat === "DONE") return CheckCircle2;
  if (cat === "IN_PROGRESS") return Loader2;
  return CircleDashed;
};

export const STATUS_ICON_CLASS = (cat: BoardStatus["category"]) => {
  if (cat === "DONE") return "text-green-600";
  if (cat === "IN_PROGRESS") return "text-blue-600";
  return "text-gray-500";
};

export const TYPE_META: Record<
  string,
  { Icon: React.ElementType; label: string; color: string }
> = {
  TASK: { Icon: CheckSquare, label: "Task", color: "text-blue-500" },
  BUG: { Icon: Bug, label: "Bug", color: "text-red-500" },
  STORY: { Icon: BookOpen, label: "Story", color: "text-green-600" },
  EPIC: { Icon: Zap, label: "Epic", color: "text-purple-500" },
  SUBTASK: { Icon: Link2, label: "Subtask", color: "text-blue-500" },
};

export function typeMeta(t: string | undefined) {
  return TYPE_META[t ?? "TASK"] ?? TYPE_META.TASK;
}

export const PRIORITY_META: Record<
  string,
  { Icon: React.ElementType; label: string; color: string }
> = {
  HIGHEST: { Icon: ChevronsUp, label: "Highest", color: "text-red-600" },
  HIGH: { Icon: ChevronUp, label: "High", color: "text-red-500" },
  MEDIUM: { Icon: Equal, label: "Medium", color: "text-amber-500" },
  LOW: { Icon: ChevronDown, label: "Low", color: "text-blue-500" },
  LOWEST: { Icon: ChevronsDown, label: "Lowest", color: "text-blue-400" },
};

export function priorityMeta(p: string | undefined) {
  return PRIORITY_META[p ?? "MEDIUM"] ?? PRIORITY_META.MEDIUM;
}

/**
 * Coloured badge used on KanbanTask / SubtaskCard. Mirrors the reference
 * implementation's getPriorityBadgeColor.
 */
export function priorityBadgeClass(priority: string | undefined): string {
  const p = (priority ?? "").toLowerCase();
  if (p === "highest" || p === "critical") {
    return "bg-yellow-100 border-yellow-300 text-yellow-800";
  }
  if (p === "high") return "bg-orange-100 border-orange-300 text-orange-800";
  if (p === "medium") return "bg-blue-100 border-blue-300 text-blue-800";
  if (p === "low" || p === "lowest") return "bg-gray-100 border-gray-300 text-gray-800";
  return "bg-gray-100 border-gray-300 text-gray-800";
}
