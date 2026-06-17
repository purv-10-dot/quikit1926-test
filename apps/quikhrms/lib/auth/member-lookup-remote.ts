/**
 * Client for the central member-status lookup endpoint
 * (`${QUIKIT_URL}/api/internal/members/lookup`).
 *
 * Used by central-sync to fold post-login central changes (membership removed,
 * role changed, app-access revoked) into the local Employee. FAILS OPEN: any
 * misconfiguration / network error / non-OK response returns `{ ok: false }`,
 * so a transient central outage never locks users out.
 *
 * Implemented locally (not in @quikit/auth) because the member-lookup endpoint
 * is HRMS-specific. Mirrors the internal-call convention of
 * @quikit/auth/verify-token-remote (`x-internal-secret` header).
 */

export interface CentralMemberStatus {
  /** The central user id this status is for. */
  userId?: string;
  /** Whether an OrgMember row exists for this user in the org. */
  found: boolean;
  /** Central membership status, e.g. "active" | "inactive" | "removed". */
  memberStatus: string;
  /** Whether the org/user currently has access to this app. */
  hasAppAccess: boolean;
  /** Platform super-admins are always live regardless of OrgMember rows. */
  isSuperAdmin: boolean;
  /** Central org role (e.g. "org_admin" | "member"); null when unknown. */
  memberRole: string | null;
}

export interface MemberLookupArgs {
  orgId: string;
  appSlug: string;
  userIds: string[];
}

export interface MemberLookupResult {
  ok: boolean;
  members?: CentralMemberStatus[];
}

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

export async function memberLookupRemote(
  args: MemberLookupArgs,
): Promise<MemberLookupResult> {
  if (!QUIKIT_URL || !INTERNAL_SECRET) return { ok: false };
  try {
    const res = await fetch(
      `${QUIKIT_URL.replace(/\/$/, "")}/api/internal/members/lookup`,
      {
        method: "POST",
        headers: {
          "x-internal-secret": INTERNAL_SECRET,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
      },
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { members?: unknown };
    const members = Array.isArray(data.members)
      ? data.members.map(normalizeMember)
      : [];
    return { ok: true, members };
  } catch {
    return { ok: false };
  }
}

function normalizeMember(raw: unknown): CentralMemberStatus {
  const m = (raw ?? {}) as Record<string, unknown>;
  return {
    userId: typeof m.userId === "string" ? m.userId : undefined,
    found: Boolean(m.found),
    memberStatus:
      typeof m.memberStatus === "string" ? m.memberStatus : "inactive",
    hasAppAccess: Boolean(m.hasAppAccess),
    isSuperAdmin: Boolean(m.isSuperAdmin),
    memberRole: typeof m.memberRole === "string" ? m.memberRole : null,
  };
}
