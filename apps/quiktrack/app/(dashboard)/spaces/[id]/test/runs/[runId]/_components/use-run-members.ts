"use client";

import { useCallback, useMemo } from "react";
import { useApiData } from "@/lib/hooks/useApiData";
import type { MemberOption } from "./assignee-picker";

/**
 * Project members for the runner's assignee picker (QUIKTR-317).
 *
 * Extracted from `runner-view.tsx` to keep that file under the 300-line ceiling
 * in apps/quiktrack/CLAUDE.md — the runner is the module's densest component and
 * accretes props quickly, so member plumbing lives here rather than inline.
 */

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

export interface RunMembersApi {
  members: MemberOption[];
  /** Resolves a user id to a display name for the list's assignee chip. */
  assigneeName: (userId: string) => string;
}

export function useRunMembers(projectId: string): RunMembersApi {
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
