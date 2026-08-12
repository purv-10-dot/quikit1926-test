import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";

/**
 * GET /api/habits/[id]/participation  (admin only — system admin role)
 *
 * Returns participation breakdown for a campaign:
 *   { total, submitted, pending, members: [{ id, name, email, hasSubmitted, submittedAt }] }
 *
 * Privacy: the admin sees WHO has submitted (and when), but NOT what they
 * answered. Individual scores remain pseudonymous — exposed only as the
 * aggregate via GET /api/habits/[id].
 */
export const GET = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    if (!(await isOrgAdmin(userId, orgId))) return forbidden();
    const campaign = await db.habitAssessment.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, isLegacy: true, participantUserIds: true },
    });
    if (!campaign || campaign.isLegacy) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Scope to the campaign's chosen participants. An EMPTY list means the
    // campaign was created org-wide (every campaign predating the column, and
    // any created without picking owners), so it falls back to all active
    // members — preserving the original behaviour for those rows.
    const participantIds = campaign.participantUserIds ?? [];
    const memberWhere =
      participantIds.length > 0
        ? { orgId, status: "active", userId: { in: participantIds } }
        : { orgId, status: "active" };

    const [members, responses] = await Promise.all([
      db.orgMember.findMany({
        where: memberWhere,
        select: {
          role: true,
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.habitAssessmentResponse.findMany({
        where: { habitAssessmentId: params.id },
        select: { respondentUserId: true, submittedAt: true, updatedAt: true },
      }),
    ]);

    const submittedMap = new Map(
      responses.map((r) => [r.respondentUserId, r.submittedAt]),
    );

    const rows = members
      .filter((m): m is typeof m & { user: NonNullable<typeof m.user> } => !!m.user)
      .map((m) => {
        const u = m.user;
        const submittedAt = submittedMap.get(u.id) ?? null;
        const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
        return {
          id: u.id,
          name,
          email: u.email,
          role: m.role,
          hasSubmitted: !!submittedAt,
          submittedAt: submittedAt ? submittedAt.toISOString() : null,
        };
      });

    const submitted = rows.filter((r) => r.hasSubmitted).length;

    return NextResponse.json({
      success: true,
      data: {
        total: rows.length,
        submitted,
        pending: rows.length - submitted,
        members: rows,
      },
    });
  },
  { moduleKey: "habits", fallbackErrorMessage: "Failed to load participation" },
);
