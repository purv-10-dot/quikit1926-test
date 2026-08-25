"use client";

import {
  Zap,
  CheckSquare,
  Bug,
  BookOpen,
  ListTree,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import {
  IssueAppsMenu,
  loadIssueApps,
  onIssueAppsChanged,
  saveIssueApps,
  type IssueApp,
} from "@/components/issue-apps-menu";
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

  // Project name + key for the breadcrumb pill. The key drives readable
  // breadcrumb links (/spaces/KEY/board) so navigating away from an issue never
  // exposes the project UUID in the URL.
  const { data: project } = useApiData<{ name?: string; projectKey?: string } | null>(
    ["quiktrack", "project-name", projectId],
    `/api/projects/${projectId}`,
    { select: (d) => d as { name?: string; projectKey?: string } | null },
  );
  const projectName = project?.name ?? "Project";
  // Fall back to the id so links still resolve (the /spaces route accepts both).
  const projectKey = project?.projectKey ?? projectId;

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

  // Same permission the edit drawer gates on. `perms.loading` counts as allowed so
  // the title does not flicker read-only on load; the API re-enforces it anyway.
  const perms = useMyProjectPermissions(projectId);
  const canUpdateIssue = perms.loading || perms.has("Issue", "update");

  // Attached apps (QuikTest), shared with the edit drawer's + menu. Read AFTER
  // mount — localStorage is unavailable during SSR, so seeding state from it
  // directly would hydrate with different markup than the server rendered.
  const [quikTestApps, setQuikTestApps] = useState<Set<IssueApp>>(new Set());
  useEffect(() => {
    const id = issue?.id;
    if (!id) return;
    setQuikTestApps(loadIssueApps(id));
    // Re-read when the drawer (mounted OVER this page) adds or hides the panel —
    // otherwise this page keeps showing the old state until a reload.
    return onIssueAppsChanged(id, () => setQuikTestApps(loadIssueApps(id)));
  }, [issue?.id]);

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

  const quikTestAdded = quikTestApps.has("quiktest");

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
          projectKey={projectKey}
          projectName={projectName}
          typeIcon={T}
          onPatch={patch}
          mentions={memberMentions}
          // Inline title editing (parity with the drawer). Gated on the same
          // permission the drawer uses; `perms.loading` counts as allowed so the
          // title does not flicker read-only on every page load.
          canUpdate={canUpdateIssue}
          // The apps `+` — same menu as the drawer, so a panel can be attached
          // without opening the drawer at all.
          appsMenu={
            <IssueAppsMenu
              issueId={issue.id}
              apps={quikTestApps}
              onChange={(next) => {
                setQuikTestApps(next);
                saveIssueApps(issue.id, next);
              }}
            />
          }
        />

        <LinkedWorkItems
          issueId={issue.id}
          projectId={projectId}
          onOpenIssue={(_id, key) => {
            // Keep the URL readable (/browse/KEY) instead of exposing UUIDs.
            window.location.href = `/browse/${key}`;
          }}
        />
        {/* QuikTest — tests covering this item, and results that raised it as a
            defect. Sits between Linked work items and Development, matching the
            TestRail-for-Jira panel placement.
            Collapsible here too, and gated on the SAME per-item "app added" choice
            the drawer's + menu writes — otherwise removing the app in the drawer
            would leave the panel still showing here. Defaults OPEN on the full page
            because there is room for it. */}
        {quikTestAdded ? (
          <QuikTestResultsPanel
            issueKey={issue.key}
            // Pass the readable key — the panel uses it only to build
            // /spaces/{x}/test links, and the route accepts key-or-id.
            projectId={projectKey}
            collapsible
            defaultOpen
            // Hiding DETACHES the app, so this page and the drawer's + menu always
            // agree — the panel returns via the Add button below.
            onHide={() => {
              const next = new Set(quikTestApps);
              next.delete("quiktest");
              setQuikTestApps(next);
              saveIssueApps(issue.id, next);
            }}
          />
        ) : null}
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
        <IssueDetailsPanel issue={issue} projectKey={projectKey} members={members} onPatch={patch} />
        {/* Development sits directly under Details (branches/commits/PRs +
            action links), the same place the issue drawer puts it — it belongs
            with the work item's metadata, not stranded mid-page in the content
            column between Linked work items and Attachments. */}
        <div className="mt-6">
          <IssueDevelopment issueId={issue.id} issueKey={issue.key} />
        </div>
      </div>
    </div>
  );
}
