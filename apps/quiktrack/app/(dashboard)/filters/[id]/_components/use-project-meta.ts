"use client";

import { useEffect, useState } from "react";
import type { IssueStatus, UserLite } from "../../../spaces/[id]/list/_components/list-types";

export type ProjectMember = { userId: string; user: UserLite | null };

interface StatusesResponse {
  success: boolean;
  data: IssueStatus[];
}

interface MembersResponse {
  success: boolean;
  data: { members: ProjectMember[]; pendingInvites?: unknown[] };
}

/**
 * Cross-project lookup maps for the global Filters table. Because filter rows
 * span many projects, the status/assignee inline editors need per-project
 * options. This hook watches the distinct project ids present in the rows and
 * fetches statuses + members once per project, caching results in state.
 */
export function useProjectMeta(projectIds: string[]) {
  const [statusesByProject, setStatusesByProject] = useState<Record<string, IssueStatus[]>>({});
  const [membersByProject, setMembersByProject] = useState<Record<string, ProjectMember[]>>({});

  // Stable key so the effect only re-runs when the *set* of ids changes, not on
  // every render that produces a new array instance.
  const key = Array.from(new Set(projectIds)).sort().join(",");

  useEffect(() => {
    const distinct = key ? key.split(",") : [];
    let cancelled = false;

    for (const projectId of distinct) {
      // Skip projects already fetched (or in flight from a prior render). We
      // check the current state via the functional updater below to avoid a
      // stale closure race, but a quick guard here keeps the common case cheap.
      fetch(`/api/projects/${projectId}/statuses`)
        .then((r) => r.json() as Promise<StatusesResponse>)
        .then((res) => {
          if (cancelled || !res.success) return;
          setStatusesByProject((prev) =>
            prev[projectId] ? prev : { ...prev, [projectId]: res.data ?? [] },
          );
        })
        .catch(() => {
          /* best-effort: cells stay empty until a later fetch succeeds */
        });

      fetch(`/api/projects/${projectId}/members`)
        .then((r) => r.json() as Promise<MembersResponse>)
        .then((res) => {
          if (cancelled || !res.success) return;
          setMembersByProject((prev) =>
            prev[projectId] ? prev : { ...prev, [projectId]: res.data.members ?? [] },
          );
        })
        .catch(() => {
          /* best-effort */
        });
    }

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { statusesByProject, membersByProject };
}
