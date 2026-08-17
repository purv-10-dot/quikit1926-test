"use client";

import { useCallback, useMemo } from "react";
import { useApiData } from "@/lib/hooks/useApiData";

/**
 * Project members, for every QuikTest picker that needs a person.
 *
 * Used by the runner's per-test assignee picker (QUIKTR-317) and by the run
 * OWNER picker on run creation. Those two are deliberately independent: a lead can
 * own a run while individual cases are assigned to different testers, and whoever
 * executes a test need not be its assignee.
 *
 * Lives at the `test/_components` level rather than under `runs/[runId]/` so both
 * surfaces share one cache entry instead of fetching members twice.
 */

export interface MemberOption {
  userId: string;
  name: string;
}

/** Shape returned by /api/projects/{id}/members. */
interface RawMember {
  userId: string;
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

/** Full name when known, else the email — never a blank chip. */
function memberDisplayName(m: RawMember): string {
  const u = m.user;
  if (!u) return "Unknown";
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.email;
}

export interface ProjectMembersApi {
  members: MemberOption[];
  /** Resolves a user id to a display name for a chip. */
  assigneeName: (userId: string) => string;
}

export function useProjectMembers(projectId: string): ProjectMembersApi {
  // Cached longer than run data: membership changes far less often than results.
  const { data } = useApiData<MemberOption[]>(
    ["quiktrack", "project-members", projectId],
    `/api/projects/${projectId}/members`,
    {
      staleTime: 5 * 60_000,
      select: (d) =>
        ((d as RawMember[] | null) ?? []).map((m) => ({
          userId: m.userId,
          name: memberDisplayName(m),
        })),
    },
  );

  const members = useMemo(() => data ?? [], [data]);
  const assigneeName = useCallback(
    (userId: string) => members.find((m) => m.userId === userId)?.name ?? "Unknown",
    [members],
  );

  return { members, assigneeName };
}
