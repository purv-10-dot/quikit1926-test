import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import {
  ACTIVITY_CSV_SELECT,
  activityCsvColumns,
  readTzFromCookieHeader,
  type ActivityCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";
import { createActivitySchema } from "@/lib/validators/activity";
import {
  assertActivityTargetExists,
  getRelatedAccountId,
} from "@/lib/services/activities/target-existence";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { buildActivityAclWhere } from "@/lib/services/activities/activity-acl";
import { logActivity } from "@/lib/services/activities/log-activity";
import { toListRow, toListRows } from "@/lib/services/activities/to-list-row";
import { resolveLeadIdFromActivity } from "@/lib/services/leads/lead-scoring/apply-score";
import { scheduleLeadScoreRecalc } from "@/lib/services/leads/lead-scoring/schedule";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "view");

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("leadId");
    const relatedKind = searchParams.get("relatedKind");
    const relatedObjectId = searchParams.get("relatedObjectId");
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "100", 10) || 100, 1),
      500,
    );
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);

    const baseAnd: Record<string, unknown>[] = [{ tenantId: user.tenantId }];
    if (relatedKind && relatedObjectId) {
      // For Opportunity reads, also OR over the direct `opportunityId` FK so
      // activities re-keyed to Contact during lead-convert (which carry
      // `opportunityId` populated on the row) still surface on the Opp timeline.
      if (relatedKind.toLowerCase() === "opportunity") {
        baseAnd.push({
          OR: [
            { relatedKind, relatedObjectId },
            { relatedKind: relatedKind.toLowerCase(), relatedObjectId },
            { opportunityId: relatedObjectId },
          ],
        });
      } else {
        baseAnd.push({
          OR: [
            { relatedKind, relatedObjectId },
            { relatedKind: relatedKind.toLowerCase(), relatedObjectId },
          ],
        });
      }
    } else if (leadId) {
      baseAnd.push({
        OR: [
          { leadId },
          { relatedKind: "lead", relatedObjectId: leadId },
          { relatedKind: "Lead", relatedObjectId: leadId },
        ],
      });
    }
    const acl = await buildActivityAclWhere(user);
    if (acl) baseAnd.push(acl);
    const where: Record<string, unknown> = { AND: baseAnd };

    const format = parseReportFormat(searchParams);
    if (format) {
      const tz = readTzFromCookieHeader(req.headers.get("cookie"));
      const cursor = createPrismaCursorIterator<ActivityCsvRow>({
        delegate: prisma.crmActivity as unknown as PrismaListDelegate<ActivityCsvRow>,
        where,
        select: ACTIVITY_CSV_SELECT,
      });
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: cursor,
        columns: activityCsvColumns(tz),
        filenameStem: "activities",
      });
    }

    // `id desc` tiebreaker → stable page boundaries when many activities share the same `occurredAt`.
    // Note: this route powers the timeline / detail-panel use case, so its pagination
    // defaults (page 1, 100 per page, max 500) are intentionally distinct from the
    // shared 10/25/50/100 list contract used by the list explorer (which calls
    // POST /api/activities/filter instead).
    const items = await prisma.crmActivity.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const rows = await toListRows(user.tenantId, items, tz);
    // Top-level `items` is kept for backwards compatibility with existing
    // consumers (LeadActivityTimeline, AccountDetailView). Newer callers
    // should read from `data.items`.
    return NextResponse.json({
      items: rows,
      success: true,
      data: { items: rows, page, pageSize },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "create");
    const parsed = createActivitySchema.safeParse(await req.json().catch(() => null));
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

    await assertActivityTargetExists(user.tenantId, dto.relatedKind, dto.relatedObjectId);
    const accountId = await getRelatedAccountId(
      user.tenantId,
      dto.relatedKind,
      dto.relatedObjectId,
    );
    await assertAccountAccess(user, accountId);

    const created = await logActivity({
      tenantId: user.tenantId,
      userId: user.userId,
      ownerId: dto.ownerId ?? user.userId,
      type: dto.type,
      relatedKind: dto.relatedKind,
      relatedObjectId: dto.relatedObjectId,
      subject: dto.subject ?? "",
      outcome: dto.outcome ?? "",
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      detailNotes: dto.detailNotes ?? undefined,
      followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
      leadId: dto.leadId ?? undefined,
      opportunityId: dto.opportunityId ?? undefined,
      externalId: dto.externalId ?? undefined,
      sourceSystem: dto.sourceSystem ?? undefined,
      outreach: dto.outreach as Parameters<typeof logActivity>[0]["outreach"],
    });

    const leadIdForScore = resolveLeadIdFromActivity({
      leadId: dto.leadId,
      relatedKind: dto.relatedKind,
      relatedObjectId: dto.relatedObjectId,
    });
    if (leadIdForScore) scheduleLeadScoreRecalc(user.tenantId, leadIdForScore);

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const row = await toListRow(user.tenantId, created, tz);
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
