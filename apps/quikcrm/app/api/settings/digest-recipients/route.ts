/**
 * PATCH /api/settings/digest-recipients — toggle a user as a daily-digest recipient.
 *
 * ADMIN-ONLY (spec 2026-08-11). Body: { userId, enabled }.
 *   - Auth: requireApiUser (401) → requirePermission(user, "settings", "edit")
 *     → DIGEST_TOGGLE_ROLES (403). The explicit role check is REQUIRED and is
 *     not redundant with requirePermission: requirePermission passes for any
 *     role holding the `settings`/`edit` CRM grant, so a SalesManager whose CRM
 *     role was granted settings:edit would otherwise be able to toggle.
 *   - EXACTLY three roles may toggle: org_admin, Administrator, admin. Every
 *     other role is refused — including SalesManager / SalesUser /
 *     MarketingUser / FinanceUser / TeamManager AND the broader platform admin
 *     tiers app_admin / super_admin / owner.
 *   - Deliberately NOT using isCrmAdminUser here: that helper also admits
 *     app_admin / super_admin / owner, which this spec excludes. Keeping a
 *     local allow-list means a future edit to the shared helper cannot silently
 *     widen who can flip the digest toggle.
 *   - RECEIVING the digest is NOT role-restricted — every role is eligible
 *     (see lib/services/notifications/digest-eligibility.ts). The eligibility
 *     re-check on the ON path is retained so any future non-role reason still
 *     blocks a bad toggle, but it no longer rejects by role.
 *   - Toggling OFF does NOT check eligibility — removal/cleanup must always be
 *     allowed.
 *   - Write delegated to setDigestRecipient (toggle + auto-flip enabled + merge).
 *
 * Returns { success: true, data: { enabled, recipientUserIds } }.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { resolveCrmRole } from "@/lib/auth/role-resolution";
import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";
import { prisma } from "@/lib/db/prisma";
import { isDigestEligible } from "@/lib/services/notifications/digest-eligibility";
import { setDigestRecipient } from "@/lib/services/workspace/digest-config";

export const runtime = "nodejs";

const bodySchema = z.object({
  userId: z.string().min(1),
  enabled: z.boolean(),
});

/**
 * The ONLY roles allowed to change the Daily Digest toggle (spec 2026-08-11).
 * Compared case-insensitively so "Administrator" / "administrator" both match.
 * Intentionally EXCLUDES app_admin, super_admin and owner — do not widen this
 * set without an explicit spec change.
 */
const DIGEST_TOGGLE_ROLES = new Set(["org_admin", "administrator", "admin"]);

function canToggleDigest(role: string | undefined | null): boolean {
  if (!role) return false;
  return DIGEST_TOGGLE_ROLES.has(role.toLowerCase());
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    // Only org_admin / Administrator / admin may change the Daily Digest
    // toggle. Every other role — SalesManager / SalesUser / MarketingUser /
    // FinanceUser / TeamManager, and also app_admin / super_admin / owner —
    // can RECEIVE the digest when an admin turns their toggle on, but may
    // never flip it themselves.
    if (!canToggleDigest(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only administrators can change the Daily Digest toggle" },
        { status: 403 },
      );
    }

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { userId, enabled } = parsed.data;

    // Toggling ON: the target must be eligible (resolve their CRM role the same
    // way readSession does — appId-scoped UserAppAccess override — then check
    // eligibility). Toggling OFF skips this (cleanup must always be allowed).
    if (enabled) {
      const appId = await getQuikCrmAppId();
      const [member, access] = await Promise.all([
        prisma.orgMember.findUnique({
          where: { orgId_userId: { orgId: user.orgId, userId } },
          select: { role: true },
        }),
        appId
          ? prisma.userAppAccess.findFirst({
              where: { userId, orgId: user.orgId, appId },
              select: { role: true },
            })
          : Promise.resolve(null),
      ]);
      const role = resolveCrmRole({ membershipRole: member?.role, appAccessRole: access?.role ?? null });
      const elig = await isDigestEligible({ userId, orgId: user.orgId, role });
      if (!elig.eligible) {
        return NextResponse.json(
          { success: false, error: `User is not digest-eligible (${elig.reason ?? "ineligible"})` },
          { status: 400 },
        );
      }
    }

    const data = await setDigestRecipient(user.orgId, userId, enabled);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
