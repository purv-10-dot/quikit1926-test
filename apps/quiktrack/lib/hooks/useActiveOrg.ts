"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

/**
 * The organisation this QuikTrack session is currently working in.
 *
 * A session carries exactly ONE active org (the JWT `orgId` claim planted by
 * the launcher hand-off — see /api/session/switch-org), so there is nothing to
 * choose between here: this is a read of the current workspace, not a picker.
 * Switching orgs stays in the launcher, which owns that flow.
 *
 * Shares the react-query key the NoAccessGate already uses for
 * `/api/me/access`, so mounting this in the header costs no extra request —
 * it reads the same cache entry.
 */

export interface AccessSummary {
  isOrgAdmin: boolean;
  isAppAdmin: boolean;
  isAdmin: boolean;
  hasProjects: boolean;
  projectCount: number;
  canCreateProject: boolean;
  orgName: string | null;
  roleName: string | null;
  adminEmails: string[];
}

/** Shared cache key — must match the NoAccessGate's. */
export const ME_ACCESS_KEY = ["quiktrack", "me-access"] as const;

export interface ActiveOrg {
  name: string;
  /** Human-readable role in this org, e.g. "Org admin". Null when unknown. */
  role: string | null;
}

/** Title-cases a stored role slug ("space_creator" → "Space creator"). */
function humanizeRole(raw: string): string {
  const spaced = raw.replace(/[_-]+/g, " ").trim();
  if (!spaced) return "";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function useActiveOrg(): ActiveOrg | null {
  const { status } = useSession();
  const { data } = useQuery({
    queryKey: ME_ACCESS_KEY,
    queryFn: async () => {
      const r = await fetch("/api/me/access");
      if (!r.ok) return null;
      const j = await r.json();
      return (j.data as AccessSummary) ?? null;
    },
    enabled: status === "authenticated",
    staleTime: 60_000,
  });

  // No org name means the lookup hasn't landed (or failed) — callers render
  // nothing rather than a placeholder that implies the workspace is unknown.
  if (!data?.orgName) return null;

  return {
    name: data.orgName,
    role: data.isOrgAdmin
      ? "Org admin"
      : data.roleName
        ? humanizeRole(data.roleName)
        : null,
  };
}
