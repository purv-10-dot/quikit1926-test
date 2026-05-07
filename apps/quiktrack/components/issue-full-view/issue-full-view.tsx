"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Zap,
  CheckSquare,
  Bug,
  BookOpen,
  ListTree,
} from "lucide-react";
import { LinkedWorkItems } from "@/components/linked-work-items";
import { IssueActivity } from "@/components/issue-activity";
import { IssueViewSkeleton } from "@/components/skeleton";
import { IssueDetailsPanel } from "./issue-details-panel";
import { IssueHeaderSections } from "./issue-header-sections";
import type { IssuePageData, IssueType } from "./types";

const TYPE_META: Record<
  IssueType,
  { Icon: React.ElementType; color: string; label: string }
> = {
  TASK: { Icon: CheckSquare, color: "text-blue-500", label: "Task" },
  BUG: { Icon: Bug, color: "text-red-500", label: "Bug" },
  STORY: { Icon: BookOpen, color: "text-green-600", label: "Story" },
  EPIC: { Icon: Zap, color: "text-purple-500", label: "Epic" },
  SUBTASK: { Icon: ListTree, color: "text-blue-500", label: "Subtask" },
};

/**
 * Full-page issue view (used at /spaces/[id]/work/[issueId]). The bulk of
 * the layout lives in `IssueHeaderSections` (breadcrumb + Description +
 * Subtasks) and `IssueDetailsPanel` (right rail) so this orchestrator stays
 * small. Linked work items + Activity reuse the same components the modal
 * uses.
 */
export function IssueFullView({
  projectId,
  issueId,
}: {
  projectId: string;
  issueId: string;
}) {
  const [issue, setIssue] = useState<IssuePageData | null>(null);
  const [projectName, setProjectName] = useState<string>("Project");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/issues/${issueId}`).then((r) => r.json());
    if (res?.success) setIssue(res.data);
    setLoading(false);
  }, [issueId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Project name for the breadcrumb pill.
  useEffect(() => {
    void fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j?.success && j.data?.name) setProjectName(j.data.name);
      })
      .catch(() => undefined);
  }, [projectId]);

  async function patch(data: Record<string, unknown>) {
    const res = await fetch(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json());
    if (res?.success) {
      // Refetch so denorms (epic/parent/status object) reflect the new ids
      // — a local merge on `{ epicId }` would leave `issue.epic` stale.
      void refresh();
      window.dispatchEvent(
        new CustomEvent("quiktrack:issue-updated", {
          detail: { projectId, issueId },
        }),
      );
    }
  }

  if (loading || !issue) {
    return <IssueViewSkeleton />;
  }

  const T = TYPE_META[issue.type] ?? TYPE_META.TASK;

  return (
    <div className="grid grid-cols-[1fr_360px] gap-6 px-8 pb-6 mx-auto items-start">
      {/* Left column scrolls; the breadcrumb header inside it pins itself
          at the top of this column via `position: sticky`. */}
      <div className="min-w-0">
        <IssueHeaderSections
          issue={issue}
          projectId={projectId}
          projectName={projectName}
          typeIcon={T}
          onPatch={patch}
        />

        <LinkedWorkItems
          issueId={issue.id}
          projectId={projectId}
          onOpenIssue={(id) => {
            window.location.href = `/spaces/${projectId}/work/${id}`;
          }}
        />
        <IssueActivity issueId={issue.id} projectId={projectId} />
      </div>

      {/* Right rail — sticks to the top of the scrolling viewport so it stays
          visible while the long left column scrolls. */}
      <div className="sticky top-0 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pt-6">
        <IssueDetailsPanel issue={issue} onPatch={patch} />
      </div>
    </div>
  );
}
