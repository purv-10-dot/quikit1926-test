import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule, maskHiddenLeadFields, filterRestrictedLeadFields } from "@/lib/auth/permissions";
import { accountScopeFilter, assertAccountAccess } from "@/lib/auth/account-acl";
import { createLeadSchema, listLeadsQuerySchema } from "@/lib/validators/lead";
import { onLeadCreated } from "@/lib/services/automation/triggers";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { recordLeadChange } from "@/lib/services/leads/change-log";
import { createDefaultTaskForLead } from "@/lib/services/leads/auto-task";
import { listLeadFields } from "@/lib/services/fields/repo";
import { validateDynamicFields } from "@/lib/services/fields/validate";
import { findDuplicateLead } from "@/lib/services/leads/duplicate";
import {
  getPipelineConfig,
  allowedStagesForSource,
  allowedStatusesForStage,
} from "@/lib/services/workspace/pipeline-config";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import { createCrmLead } from "@/lib/services/leads/create-record";
import {
  shouldUseAutoLeadScore,
  syncLeadScoreAfterChange,
} from "@/lib/services/leads/lead-scoring/integration";
import {
  inferLeadCreationChannel,
  isLeadCreationChannel,
} from "@/lib/services/leads/log-lead-system-activities";
import {
  LEAD_CSV_SELECT,
  leadCsvColumns,
  readTzFromCookieHeader,
  type LeadCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listLeadsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const q = parsed.data;
    const aclFilter = await accountScopeFilter(user);

    const where: Record<string, unknown> = { orgId: user.orgId };
    if (q.stage) where.stage = q.stage;
    if (q.status) where.status = q.status;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.isStarred !== undefined) where.isStarred = q.isStarred;
    if (q.q) {
      where.OR = [
        { name: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
        { company: { contains: q.q, mode: "insensitive" } },
      ];
    }
    // Build finalWhere first, then set deletedAt at its TOP LEVEL — the
    // soft-delete middleware only inspects the top-level keys of the where
    // object, so a nested deletedAt would be ignored and overridden.
    const finalWhere: Record<string, unknown> = aclFilter
      ? { AND: [where, aclFilter] }
      : where;
    const trashMode = searchParams.get("onlyDeleted") === "true";
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    if (trashMode) {
      finalWhere.deletedAt = { not: null };
    } else if (includeDeleted) {
      finalWhere.deletedAt = undefined;
    }

    const format = parseReportFormat(searchParams);
    if (format) {
      const tz = readTzFromCookieHeader(req.headers.get("cookie"));
      const cursor = createPrismaCursorIterator<LeadCsvRow>({
        delegate: prisma.crmLead as unknown as PrismaListDelegate<LeadCsvRow>,
        where: finalWhere,
        select: LEAD_CSV_SELECT,
      });
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: cursor,
        columns: leadCsvColumns(tz),
        filenameStem: "leads",
      });
    }

    // Always include `id desc` as a tiebreaker so pages are stable even when
    // many rows share the same primary sort value (e.g. createdAt to the second).
    const orderBy: Prisma.CrmLeadOrderByWithRelationInput[] =
      q.sortBy === "id"
        ? [{ id: q.sortDir }]
        : [{ [q.sortBy]: q.sortDir } as Prisma.CrmLeadOrderByWithRelationInput, { id: "desc" }];

    const [items, total] = await Promise.all([
      prisma.crmLead.findMany({
        where: finalWhere,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy,
      }),
      prisma.crmLead.count({ where: finalWhere }),
    ]);

    const masked = await Promise.all(items.map((l) => maskHiddenLeadFields(user, l)));
    const totalPages = Math.max(1, Math.ceil(total / q.pageSize));
    return NextResponse.json({
      items: masked,
      total,
      page: q.page,
      pageSize: q.pageSize,
      totalPages,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "create");

    const body = await req.json().catch(() => null);
    const parsed = createLeadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = await filterRestrictedLeadFields(user, parsed.data);
    if (data.accountId) await assertAccountAccess(user, data.accountId);

    // Duplicate-identity check (email + mobile/phone). Mirrors legacy Mongo unique constraints.
    const dup = await findDuplicateLead({
      orgId: user.orgId,
      email: data.email,
      mobile: data.mobile,
      phone: data.phone,
    });
    if (dup) {
      return NextResponse.json(
        { error: `A lead with this ${dup} already exists.`, errors: { [dup]: "Already in use" } },
        { status: 409 },
      );
    }

    // Pipeline dependent rules: source → stage and stage → status.
    const pipeline = await getPipelineConfig(user.orgId);
    if (data.stage && !pipeline.stages.includes(data.stage)) {
      return NextResponse.json(
        { error: "Invalid stage for this workspace.", errors: { stage: `Must be one of: ${pipeline.stages.join(", ")}` } },
        { status: 400 },
      );
    }
    if (data.status && !pipeline.statuses.includes(data.status)) {
      return NextResponse.json(
        { error: "Invalid status for this workspace.", errors: { status: `Must be one of: ${pipeline.statuses.join(", ")}` } },
        { status: 400 },
      );
    }
    const allowedStages = allowedStagesForSource(pipeline.dependentRules, data.source);
    if (allowedStages.length > 0 && data.stage && !allowedStages.includes(data.stage)) {
      return NextResponse.json(
        { error: "Stage is not allowed for this source.", errors: { stage: `Allowed for "${data.source}": ${allowedStages.join(", ")}` } },
        { status: 400 },
      );
    }
    const allowedStatuses = allowedStatusesForStage(pipeline.dependentRules, data.stage);
    if (allowedStatuses.length > 0 && data.status && !allowedStatuses.includes(data.status)) {
      return NextResponse.json(
        { error: "Status is not allowed for this stage.", errors: { status: `Allowed for "${data.stage}": ${allowedStatuses.join(", ")}` } },
        { status: 400 },
      );
    }

    // Validate + coerce dynamic fields against the org's field definitions
    const defs = await listLeadFields(user.orgId);
    const { values: dyn, errors: dynErrors } = validateDynamicFields({
      defs,
      input: data.dynamicFields as Record<string, unknown> | undefined,
      requireMissing: true,
    });
    if (Object.keys(dynErrors).length > 0) {
      return NextResponse.json({ error: "Validation failed", errors: dynErrors }, { status: 400 });
    }

    // The schema migration kept `ownerId`/`accountId` as plain scalar FKs
    // (no Prisma `owner`/`account` relation declared on CrmLead — cross-schema
    // FK to public.User isn't wired). Use the Unchecked input form which
    // accepts the scalar columns directly.
    const { ownerId, accountId, originChannel: _stripOriginChannel, ...rest } = data;
    // filterRestrictedLeadFields returns Partial<T> so rest is "all optional"
    // structurally; cast through to the Unchecked input shape since Zod has
    // already validated the required fields on parsed.data.
    const useAutoScore = await shouldUseAutoLeadScore(
      user.orgId,
      parsed.data.score !== undefined,
    );
    const { score: _manualScore, ...restWithoutScore } = rest;
    const createData = {
      ...(useAutoScore ? restWithoutScore : rest),
      dynamicFields:
        Object.keys(dyn).length > 0 ? (dyn as Prisma.InputJsonValue) : undefined,
      orgId: user.orgId,
      ...(ownerId ? { ownerId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(!useAutoScore && parsed.data.score !== undefined ? { score: parsed.data.score } : {}),
    } as Prisma.CrmLeadUncheckedCreateInput;
    const headerOrigin = req.headers.get("x-lead-origin")?.trim();
    const channel =
      headerOrigin && isLeadCreationChannel(headerOrigin)
        ? headerOrigin
        : parsed.data.originChannel && isLeadCreationChannel(parsed.data.originChannel)
          ? parsed.data.originChannel
          : inferLeadCreationChannel({
              leadSource: parsed.data.source,
              sourceSystem: parsed.data.sourceSystem,
            });

    let lead = await createCrmLead(createData, {
      creation: { channel, userId: user.userId },
    });
    if (useAutoScore) {
      const computedScore = await syncLeadScoreAfterChange(user.orgId, lead.id);
      if (computedScore !== undefined) {
        lead = { ...lead, score: computedScore };
      }
    }
    await recordLeadChange({
      orgId: user.orgId,
      userId: user.userId,
      leadId: lead.id,
      action: "CREATE",
      before: null,
      after: lead as unknown as Record<string, unknown>,
    });
    // Fire workflow trigger (BullMQ-async — non-blocking)
    void Promise.resolve(
      onLeadCreated(user.orgId, lead.id, lead.ownerName ?? user.name),
    ).catch((err) => console.error("[automation] onLeadCreated failed", err));
    // Auto-create default follow-up task (non-blocking, env-toggleable)
    void Promise.resolve(createDefaultTaskForLead(lead)).catch((err: unknown) =>
      console.error("[auto-task] dispatch failed", err),
    );
    void Promise.resolve(
      publishLeadEvent(user.orgId, {
        type: "created",
        leadId: lead.id,
        stage: lead.stage,
      }),
    ).catch(() => {});
    // ── Rules engine — lead created event ──
    void evaluateRulesForEvent({
      event: "created",
      entityType: "lead",
      entityId: lead.id,
      orgId: user.orgId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: lead as unknown as Record<string, unknown>,
      changedFields: [],
    }).catch((err) => console.error("[rules-engine] lead created failed", err));
    return NextResponse.json(lead, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
