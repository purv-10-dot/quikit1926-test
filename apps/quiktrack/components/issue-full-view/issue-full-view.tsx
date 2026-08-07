"use client";

import {
  Zap,
  CheckSquare,
  Bug,
  BookOpen,
  ListTree,
} from "lucide-react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";
import { LinkedWorkItems } from "@/components/linked-work-items";
import { IssueActivity } from "@/components/issue-activity";
import { IssueAttachments } from "@/components/issue-attachments";
import { DescriptionAttachments } from "@/components/description-attachments";
import { IssueViewSkeleton } from "@/components/skeleton";
import { IssueDetailsPanel } from "./issue-details-panel";
import { IssueHeaderSections } from "./issue-header-sections";
import { IssueDevelopment } from "./issue-development";
import { QuikTestResultsPanel } from "./quiktest-results-panel";
import type { IssuePageData, IssueType } from "./types";
import type { MentionItem } from "@/components/editor/mention";

interface Member {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
}

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
  const queryClient = useQueryClient();

  // Issue detail drives the view. We fetch the aggregate `/full` endpoint and,
  // inside the queryFn, seed the sibling caches (links / comments / history /
  // attachments) that the child panels read. Because the panels only mount
  // after this query resolves (the skeleton gate below), their `useApiData`
  // hooks hit warm cache instead of each firing their own request — so opening
  // a work item is one round-trip, not ~six. `refetchIssue` re-runs after a
  // PATCH, re-seeding everything so denorms (epic/parent/status) stay fresh.
  const {
    data: issue = null,
    isLoading,
    refetch: refetchIssue,
  } = useQuery<IssuePageData>({
    queryKey: ["quiktrack", "issue", issueId],
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/issues/${issueId}/full`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: {
          issue: IssuePageData;
          links: unknown[];
          comments: unknown[];
          history: unknown[];
          attachments: unknown[];
        };
      };
      if (!json.success || !json.data) throw new Error(json.error ?? "Request failed");
      const { issue, links, comments, history, attachments } = json.data;
      queryClient.setQueryData(["quiktrack", "issue-links", issueId], links);
      queryClient.setQueryData(["quiktrack", "issue-comments", issueId], comments);
      queryClient.setQueryData(["quiktrack", "issue-history", issueId], history);
      queryClient.setQueryData(["quiktrack", "issue-attachments", issueId], attachments);
      return issue;
    },
  });

  // Project name for the breadcrumb pill.
  const { data: projectName = "Project" } = useApiData<string>(
    ["quiktrack", "project-name", projectId],
    `/api/projects/${projectId}`,
    { select: (d) => (d as { name?: string } | null)?.name ?? "Project" },
  );

  // Project members — feed the @-mention list and the details panel (passed
  // down so the panel doesn't refetch the same list).
  const { data: members = [] } = useApiData<Member[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      select: (d) => {
        const payload = d as { members?: Member[] } | Member[] | null;
        return Array.isArray(payload) ? payload : payload?.members ?? [];
      },
    },
  );

  // Reflect the issue in the browser tab (Jira-style "[SCRUM-58] title"), and
  // restore the previous title when navigating away so other pages aren't left
  // showing a stale work-item name.
  useEffect(() => {
    if (!issue?.key) return;
    const previous = document.title;
    document.title = `[${issue.key}] ${issue.title}`;
    return () => {
      document.title = previous;
    };
  }, [issue?.key, issue?.title]);

  async function patch(data: Record<string, unknown>) {
    const res = await fetch(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => r.json());
    if (res?.success) {
      void refetchIssue();
      window.dispatchEvent(
        new CustomEvent("quiktrack:issue-updated", {
          detail: { projectId, issueId },
        }),
      );
    }
  }

  if (isLoading || !issue) {
    return <IssueViewSkeleton />;
  }

  const T = TYPE_META[issue.type] ?? TYPE_META.TASK;

  // People list for @-mentions in the comment editor.
  const memberMentions: MentionItem[] = members
    .filter((m) => m.user)
    .map((m) => ({
      id: m.userId,
      name:
        [m.user!.firstName, m.user!.lastName].filter(Boolean).join(" ").trim() ||
        m.user!.email,
      email: m.user!.email,
    }));

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
          mentions={memberMentions}
        />

        <LinkedWorkItems
          issueId={issue.id}
          projectId={projectId}
          onOpenIssue={(id) => {
            window.location.href = `/spaces/${projectId}/work/${id}`;
          }}
        />
        {/* QuikTest — tests covering this item, and results that raised it as a
            defect. Sits between Linked work items and Development, matching the
            TestRail-for-Jira panel placement. */}
        <QuikTestResultsPanel issueKey={issue.key} projectId={projectId} />
        <IssueDevelopment
          issueId={issue.id}
          issueKey={issue.key}
          onDevChanged={() => {
            // A dev action (e.g. create branch) can auto-transition the item via
            // a workflow trigger — refresh the item so its status pill updates,
            // and notify the board/backlog/etc.
            void refetchIssue();
            window.dispatchEvent(
              new CustomEvent("quiktrack:issue-updated", { detail: { projectId, issueId } }),
            );
          }}
        />
        {/* Separate "Attachments" section — mirrors the files embedded in the
            description as cards (same as shown inside Description), plus the
            migration-imported attachments below. */}
        <DescriptionAttachments html={issue.description} heading />
        <IssueAttachments issueId={issue.id} />
        <IssueActivity issueId={issue.id} projectId={projectId} mentions={memberMentions} />
      </div>

      {/* Right rail — sticks to the top of the scrolling viewport so it stays
          visible while the long left column scrolls. */}
      <div className="sticky top-0 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pt-6">
        <IssueDetailsPanel issue={issue} members={members} onPatch={patch} />
      </div>
    </div>
  );
}
