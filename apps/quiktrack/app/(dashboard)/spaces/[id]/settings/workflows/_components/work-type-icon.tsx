"use client";

import { Bug, BookOpen, Zap, CheckSquare, GitBranch, CircleDot } from "lucide-react";

/**
 * Renders an issue type's icon using the SAME icon/colour mapping the rest of
 * the app uses (see components/create-issue-modal.tsx TYPE_META). Matches by
 * type NAME, case-insensitive, so it works with the free-string type names in
 * QtIssueType. Falls back to a neutral dot for unknown/custom types.
 */
const META: Record<string, { Icon: React.ElementType; className: string }> = {
  task: { Icon: CheckSquare, className: "text-blue-500" },
  bug: { Icon: Bug, className: "text-red-500" },
  story: { Icon: BookOpen, className: "text-green-600" },
  epic: { Icon: Zap, className: "text-purple-500" },
  "sub-task": { Icon: GitBranch, className: "text-blue-400" },
  subtask: { Icon: GitBranch, className: "text-blue-400" },
};

export function WorkTypeIcon({ name, className = "" }: { name: string; className?: string }) {
  const key = name.trim().toLowerCase();
  const meta = META[key] ?? { Icon: CircleDot, className: "text-gray-400" };
  const Icon = meta.Icon;
  return <Icon className={`h-4 w-4 shrink-0 ${meta.className} ${className}`} aria-hidden />;
}
