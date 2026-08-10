import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { smbOutreachSchema } from "@/lib/validators/activity";
import { validateSmbDispositionChain } from "@/lib/services/activities/smb-outreach-meta";
import { logActivity } from "@/lib/services/activities/log-activity";
import { toListRow } from "@/lib/services/activities/to-list-row";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "create");
    await assertModule(user, "leads", "view");

    const parsed = smbOutreachSchema.safeParse(await req.json().catch(() => null));
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

    if (
      !validateSmbDispositionChain(dto.disposition, dto.subDisposition, dto.subSubDisposition)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid disposition / sub-disposition / sub-sub-disposition combination",
        },
        { status: 400 },
      );
    }

    if (dto.ownerId && dto.ownerId !== user.userId) {
      await assertModule(user, "activities", "edit");
    }

    const lead = await prisma.crmLead.findFirst({
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

    const ownerId = dto.ownerId ?? user.userId;

    const subject = "SMB Outreach";
    const outcome = `${dto.channel} · ${dto.disposition} · ${dto.subDisposition}`.slice(0, 500);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const outreach: Prisma.InputJsonValue = {
      country: dto.country,
      followupPriority: dto.followupPriority,
      activityOwnerUserId: ownerId,
      disposition: dto.disposition,
      subDisposition: dto.subDisposition,
      subSubDisposition: dto.subSubDisposition,
      competitor: dto.competitor,
      competitorDetails: dto.competitorDetails ?? "",
      channel: dto.channel,
      currentSystemDetails: dto.currentSystemDetails ?? "",
      detailNotes: dto.detailNotes,
      scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    };

    const created = await prisma.$transaction(async (tx) => {
      const activity = await logActivity({
        tenantId: user.tenantId,
        userId: user.userId,
        ownerId,
        type: "SMB Outreach",
        relatedKind: "Lead",
        relatedObjectId: dto.leadId,
        subject,
        outcome,
        occurredAt: new Date(),
        outreach,
        leadId: dto.leadId,
        tx,
      });
      // Side-effect: patch the parent lead's country + followupPriority.
      // The reference does this unconditionally on every outreach save.
      await tx.crmLead.update({
        where: { id: dto.leadId },
        data: {
          country: dto.country,
          // Lead model doesn't always have followupPriority — store on
          // dynamicFields if absent. Keep the raw column write when it
          // exists so existing reports keep working.
          followupPriority: dto.followupPriority,
        },
      });
      return activity;
    });

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const row = await toListRow(user.tenantId, created, tz);
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
