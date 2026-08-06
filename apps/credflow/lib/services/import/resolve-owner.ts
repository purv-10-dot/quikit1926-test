/**
 * Resolve an imported lead's owner from an email address to a REAL user account.
 *
 * Import files (e.g. LeadSquared exports) carry the owner as free text — an
 * "Owner" name column and often an "Owner Email" column. Storing only the name
 * leaves the lead with NO real owner link (ownerId), so it never appears in that
 * user's "my leads" view and owner-based visibility can't scope it. This helper
 * turns the email into the linked user account, so an imported lead is owned
 * exactly like a manually-assigned one.
 *
 * Matching:
 *   - email compared case-insensitively, trimmed
 *   - scoped to the tenant's ACTIVE org members only (same OrgMember→User join
 *     used by GET /api/leads/owners and the users service)
 *   - VERIFIED contract (owner-scope.ts): CrmLead.ownerId === auth.User.id ===
 *     quikit.OrgMember.userId, so setting ownerId to the matched User.id is correct.
 *
 * Returns null when the email is blank or matches no active user — the caller
 * then falls back to the text owner name and reports the row as unmatched, so a
 * bad/absent email never silently assigns the wrong person.
 */
import { prisma } from "@/lib/db/prisma";

export interface ResolvedOwner {
  ownerId: string;
  ownerName: string;
}

/**
 * Look up an active tenant user by email. Returns { ownerId, ownerName } on a
 * match, or null when email is empty / no active member has that email.
 */
export async function resolveOwnerByEmail(
  tenantId: string,
  email: string | null | undefined,
): Promise<ResolvedOwner | null> {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return null;

  const member = await prisma.orgMember.findFirst({
    where: {
      orgId: tenantId,
      status: "active",
      user: { is: { email: { equals: normalized, mode: "insensitive" } } },
    },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  if (!member) return null;

  const ownerName =
    [member.user.firstName, member.user.lastName].filter(Boolean).join(" ").trim() ||
    member.user.email ||
    member.userId;

  return { ownerId: member.userId, ownerName };
}

/**
 * Build a case-insensitive email → { ownerId, ownerName } map for the whole
 * active team in ONE query. Import processes many rows; resolving per-row would
 * issue a query per lead. Callers build this map once, then look up each row's
 * owner email against it (keys are lowercased).
 */
export async function buildOwnerEmailIndex(
  tenantId: string,
): Promise<Map<string, ResolvedOwner>> {
  const members = await prisma.orgMember.findMany({
    where: { orgId: tenantId, status: "active" },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });

  const index = new Map<string, ResolvedOwner>();
  for (const m of members) {
    const email = (m.user.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const ownerName =
      [m.user.firstName, m.user.lastName].filter(Boolean).join(" ").trim() ||
      m.user.email ||
      m.userId;
    index.set(email, { ownerId: m.userId, ownerName });
  }
  return index;
}
