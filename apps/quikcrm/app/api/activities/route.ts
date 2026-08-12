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
  isStandaloneKind,
  STANDALONE_RELATED_ID,
} from "@/lib/services/activities/target-existence";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { buildActivityAclWhere } from "@/lib/services/activities/activity-acl";
import { logActivity } from "@/lib/services/activities/log-activity";
import { writeActivityFieldValues } from "@/lib/services/activity-types/write-field-values";
import { toListRow, toListRows } from "@/lib/services/activities/to-list-row";
import { resolveLeadIdFromActivity } from "@/lib/services/leads/lead-scoring/apply-score";
import { scheduleLeadScoreRecalc } from "@/lib/services/leads/lead-scoring/schedule";
import { EXCLUDE_LEAD_INIT_EVENTS_WHERE } from "@/lib/services/leads/log-lead-system-activities";

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
    // Timeline for a record that stores its activities as STANDALONE rows
    // (relatedKind "None") keyed by externalId — currently the Upwork module.
    // Such rows cannot be found by relatedObjectId (it is the "standalone"
    // sentinel), so they are addressed by their source system plus the
    // per-record externalId prefix the writer guarantees. Both params are
    // required together; either one alone is ignored, so this cannot widen an
    // existing query.
    const sourceSystem = searchParams.get("sourceSystem");
    const externalIdPrefix = searchParams.get("externalIdPrefix");
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("pageSize") ?? searchParams.get("limit") ?? "100", 10) || 100, 1),
      500,
    );
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10) || 1, 1);

    const baseAnd: Record<string, unknown>[] = [{ orgId: user.orgId }];
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
    } else if (sourceSystem && externalIdPrefix) {
      baseAnd.push({ sourceSystem, externalId: { startsWith: externalIdPrefix } });
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

    // Suppress internal lead-creation init events (Source/Owner/Stage/Status)
    // from the user-facing JSON list / timeline — applied AFTER the export branch
    // above so CSV/report exports still include every row (reporting unaffected).
    baseAnd.push(EXCLUDE_LEAD_INIT_EVENTS_WHERE);

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
    const rows = await toListRows(user.orgId, items, tz);
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

    // fieldValues without an activityTypeId is a client error: there are no
    // field definitions to validate/route against.
    if (dto.fieldValues && !dto.activityTypeId) {
      return NextResponse.json(
        { success: false, error: "fieldValues require an activityTypeId" },
        { status: 400 },
      );
    }

    // Standalone activities ("None") carry no real record id — normalize to the
    // sentinel so the NOT-NULL relatedObjectId column has a value that matches no
    // record (hence: shows in Global Activities, never on a record timeline).
    const relatedObjectId = isStandaloneKind(dto.relatedKind)
      ? STANDALONE_RELATED_ID
      : (dto.relatedObjectId as string);

    await assertActivityTargetExists(user.orgId, dto.relatedKind, relatedObjectId);
    const accountId = await getRelatedAccountId(
      user.orgId,
      dto.relatedKind,
      relatedObjectId,
    );
    await assertAccountAccess(user, accountId);

    const logInput: Parameters<typeof logActivity>[0] = {
      orgId: user.orgId,
      userId: user.userId,
      ownerId: dto.ownerId ?? user.userId,
      type: dto.type,
      relatedKind: dto.relatedKind,
      relatedObjectId,
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
    };

    let created;
    if (dto.activityTypeId) {
      // Option A: the route orchestrates one transaction so the activity row
      // and its custom-field value rows are written atomically. logActivity and
      // writeActivityFieldValues both run on the passed tx. A validation throw
      // (ActivityFieldValidationError, statusCode 400) propagates to the catch
      // below; errorResponse maps it to 400 while a genuine error stays 500.
      created = await prisma.$transaction(async (tx) => {
        const activity = await logActivity({ ...logInput, tx });
        await writeActivityFieldValues(tx, {
          orgId: user.orgId,
          activityId: activity.id,
          activityTypeId: dto.activityTypeId!,
          values: dto.fieldValues,
        });
        return activity;
      });
    } else {
      created = await logActivity(logInput);
    }

    const leadIdForScore = resolveLeadIdFromActivity({
      leadId: dto.leadId,
      relatedKind: dto.relatedKind,
      relatedObjectId,
    });
    if (leadIdForScore) scheduleLeadScoreRecalc(user.orgId, leadIdForScore);

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const row = await toListRow(user.orgId, created, tz);
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
