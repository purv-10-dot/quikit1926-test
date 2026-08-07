import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { leadLogSchema } from "@/lib/validators/activity";
import { logActivity } from "@/lib/services/activities/log-activity";
import { toListRow } from "@/lib/services/activities/to-list-row";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";
import { scheduleLeadScoreRecalc } from "@/lib/services/leads/lead-scoring/schedule";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "create");
    await assertModule(user, "leads", "view");

    const parsed = leadLogSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const dto = parsed.data;

    if (dto.ownerId && dto.ownerId !== user.userId) {
      await assertModule(user, "activities", "edit");
    }

    const lead = await prisma.qcfLead.findFirst({
      where: { id: dto.leadId, tenantId: user.tenantId },
      select: { id: true, accountId: true },
    });
    if (!lead) {
      return NextResponse.json(
        { success: false, error: "Lead not found" },
        { status: 404 },
      );
    }
    await assertAccountAccess(user, lead.accountId);

    if (dto.opportunityId) {
      const opp = await prisma.qcfOpportunity.findFirst({
        where: { id: dto.opportunityId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!opp) {
        return NextResponse.json(
          { success: false, error: "Opportunity not found" },
          { status: 404 },
        );
      }
    }

    const created = await logActivity({
      tenantId: user.tenantId,
      userId: user.userId,
      ownerId: dto.ownerId ?? user.userId,
      type: dto.activityCode,
      relatedKind: "Lead",
      relatedObjectId: dto.leadId,
      subject: dto.activityCode,
      outcome: dto.logOutcome,
      occurredAt: new Date(),
      activityCode: dto.activityCode,
      logOutcome: dto.logOutcome,
      detailNotes: dto.detailNotes,
      followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
      opportunityId: dto.opportunityId,
      leadId: dto.leadId,
    });

    scheduleLeadScoreRecalc(user.tenantId, dto.leadId);

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const row = await toListRow(user.tenantId, created, tz);
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
