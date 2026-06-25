/**
 * PATCH /api/settings/digest-recipients — toggle a user as a daily-digest recipient.
 *
 * Admin-gated (Phase 5 recipient feature, Stage 3). Body: { userId, enabled }.
 *   - Auth: requireApiUser (401) → requirePermission(user, "settings", "edit")
 *     (403 for non-admins; admin-bypass inside requirePermission). Same gate as
 *     /api/settings/company PATCH.
 *   - Toggling ON requires the target be digest-ELIGIBLE (isDigestEligible) — you
 *     cannot add a user the digest could never scope (400 if ineligible).
 *   - Toggling OFF does NOT check eligibility — removal/cleanup must always be
 *     allowed (e.g. a SalesManager who lost their team must be removable, not
 *     stuck as an un-removable recipient).
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

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

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
