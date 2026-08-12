import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule, maskHiddenLeadFields, filterRestrictedLeadFields } from "@/lib/auth/permissions";
import { accountScopeFilter, assertAccountAccess } from "@/lib/auth/account-acl";
import { ownerScopeFilter, isOwnerRestricted } from "@/lib/auth/owner-scope";
import { createLeadSchema, listLeadsQuerySchema } from "@/lib/validators/lead";
import { publishLeadEvent } from "@/lib/services/leads/realtime";
import { recordLeadChange } from "@/lib/services/leads/change-log";
import { createDefaultTaskForLead } from "@/lib/services/leads/auto-task";
import { listLeadFields } from "@/lib/services/fields/repo";
import { validateDynamicFields } from "@/lib/services/fields/validate";
import { findDuplicateLead } from "@/lib/services/leads/duplicate";
import {
  getPipelineConfig,
  validateLeadPipelineCascade,
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
import { notifyLeadAssigned } from "@/lib/notifications/lead-triggers";
import { normalizePhoneOrError } from "@/lib/services/shared/phone-normalize";
import { getWorkspacePhoneDefaultCountry } from "@/lib/services/workspace/phone-config";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listLeadsQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid query", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const q = parsed.data;
    const aclFilter = await accountScopeFilter(user);
    // Owner-based visibility: restricted roles see only leads they own.
    const ownerScope = await ownerScopeFilter(user);

    const where: Record<string, unknown> = { orgId: user.orgId };
    if (q.stage) where.stage = q.stage;
    if (q.status) where.status = q.status;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.isStarred !== undefined) where.isStarred = q.isStarred;
    if (q.q) {
      // Phone/mobile are stored E.164 (e.g. "+919876543210"); match on a
      // digits-only reduction of the query so "98765 43210" / "9876543210"
      // still hit. Text fields keep the raw-q insensitive contains.
      const digits = q.q.replace(/\D/g, "");
      const searchOr: Prisma.QceLeadWhereInput[] = [
        { name: { contains: q.q, mode: "insensitive" } },
        { email: { contains: q.q, mode: "insensitive" } },
        { company: { contains: q.q, mode: "insensitive" } },
        { jobTitle: { contains: q.q, mode: "insensitive" } },
        { cityName: { contains: q.q, mode: "insensitive" } },
        { industry: { contains: q.q, mode: "insensitive" } },
        { secondaryEmail: { contains: q.q, mode: "insensitive" } },
      ];
      if (digits.length > 0) {
        searchOr.push(
          { phone: { contains: digits, mode: "insensitive" } },
          { mobile: { contains: digits, mode: "insensitive" } },
        );
      }
      where.OR = searchOr;
    }
    // Build finalWhere first, then set deletedAt at its TOP LEVEL — the
    // soft-delete middleware only inspects the top-level keys of the where
    // object, so a nested deletedAt would be ignored and overridden.
    // Owner scope is AND-appended alongside the account ACL (both are
    // independent narrowing constraints). This finalWhere feeds BOTH the list
    // query/count AND the CSV export cursor below, so one change scopes both.
    const scopeClauses: Record<string, unknown>[] = [];
    if (aclFilter) scopeClauses.push(aclFilter);
    if (ownerScope) scopeClauses.push(ownerScope);
    const finalWhere: Record<string, unknown> =
      scopeClauses.length > 0 ? { AND: [where, ...scopeClauses] } : where;
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
        delegate: prisma.qceLead as unknown as PrismaListDelegate<LeadCsvRow>,
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
    const orderBy: Prisma.QceLeadOrderByWithRelationInput[] =
      q.sortBy === "id"
        ? [{ id: q.sortDir }]
        : [{ [q.sortBy]: q.sortDir } as Prisma.QceLeadOrderByWithRelationInput, { id: "desc" }];

    const [items, total] = await Promise.all([
      prisma.qceLead.findMany({
        where: finalWhere,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy,
      }),
      prisma.qceLead.count({ where: finalWhere }),
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
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const data = await filterRestrictedLeadFields(user, parsed.data);
    if (data.accountId) await assertAccountAccess(user, data.accountId);

    // Normalize phone/mobile to E.164 before the duplicate check + write, so
    // messy input ("7631957103") is stored consistently and dedupes correctly.
    // Reject genuinely-invalid numbers with the lead route's { error, errors } shape.
    if (data.phone !== undefined || data.mobile !== undefined) {
      const defaultCountry = await getWorkspacePhoneDefaultCountry(user.orgId);
      if (data.phone !== undefined) {
        const r = normalizePhoneOrError(data.phone, defaultCountry);
        if (!r.ok) {
          return NextResponse.json({ success: false, error: "Validation failed", errors: { phone: [r.message] } },
            { status: 400 },
          );
        }
        data.phone = r.value;
      }
      if (data.mobile !== undefined) {
        const r = normalizePhoneOrError(data.mobile, defaultCountry);
        if (!r.ok) {
          return NextResponse.json({ success: false, error: "Validation failed", errors: { mobile: [r.message] } },
            { status: 400 },
          );
        }
        data.mobile = r.value;
      }
    }

    // Duplicate-identity check (email + mobile/phone). Mirrors legacy Mongo unique constraints.
    const dup = await findDuplicateLead({
      orgId: user.orgId,
      email: data.email,
      mobile: data.mobile,
      phone: data.phone,
    });
    if (dup) {
      return NextResponse.json({ success: false, error: `A lead with this ${dup} already exists.`, errors: { [dup]: "Already in use" } },
        { status: 409 },
      );
    }

    // Pipeline cascade: source → stage → status → sub-status. Shared with the
    // PATCH and transition write paths via validateLeadPipelineCascade.
    const pipeline = await getPipelineConfig(user.orgId);
    const cascadeError = validateLeadPipelineCascade({
      pipeline,
      source: data.source,
      stage: data.stage,
      status: data.status,
      substatus: data.substatus,
      writing: { source: true, stage: true, status: true, substatus: true },
    });
    if (cascadeError) {
      return NextResponse.json({ success: false, error: cascadeError.message, errors: cascadeError.errors },
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
      return NextResponse.json({ success: false, error: "Validation failed", errors: dynErrors }, { status: 400 });
    }

    // The schema migration kept `ownerId`/`accountId` as plain scalar FKs
    // (no Prisma `owner`/`account` relation declared on QceLead — cross-schema
    // FK to public.User isn't wired). Use the Unchecked input form which
    // accepts the scalar columns directly.
    // Strip fields that exist in the Zod schema but not on QceLead.
    // They are collected for other purposes (e.g. contact creation on convert)
    // but passing them to prisma.qceLead.create() causes an "Unknown argument" error.
    // firstName/lastName/leadType/contactLinkedinUrl/requirementDetails are now
    // real nullable columns on QceLead (added 2026-07-08), so they flow through
    // to createData below. Only fields that are NOT columns on QceLead are
    // stripped here: originChannel (used for channel logic), technology (folded
    // into requirementDetails), topic, sourceDetails.
    const {
      ownerId,
      accountId,
      originChannel:        _originChannel,
      technology:           _technology,
      topic:                _topic,
      sourceDetails:        _sourceDetails,
      ...rest
    } = data;
    // filterRestrictedLeadFields returns Partial<T> so rest is "all optional"
    // structurally; cast through to the Unchecked input shape since Zod has
    // already validated the required fields on parsed.data.
    const useAutoScore = await shouldUseAutoLeadScore(
      user.orgId,
      parsed.data.score !== undefined,
    );
    const { score: _manualScore, ...restWithoutScore } = rest;
    // Owner-based visibility write-side: if a restricted creator doesn't set an
    // owner, default it to themselves — otherwise they'd create a lead they
    // can't see. Unrestricted users keep the existing behaviour (no forced owner).
    const effectiveOwnerId =
      ownerId ?? ((await isOwnerRestricted(user)) ? user.userId : undefined);
    const createData = {
      ...(useAutoScore ? restWithoutScore : rest),
      dynamicFields:
        Object.keys(dyn).length > 0 ? (dyn as Prisma.InputJsonValue) : undefined,
      orgId: user.orgId,
      ...(effectiveOwnerId ? { ownerId: effectiveOwnerId } : {}),
      ...(accountId ? { accountId } : {}),
      ...(!useAutoScore && parsed.data.score !== undefined ? { score: parsed.data.score } : {}),
    } as Prisma.QceLeadUncheckedCreateInput;
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
    // NOTE: the New-Lead workflow trigger (onLeadCreated) now fires inside
    // createCrmLead (service layer) so the import path fires rules too — it is
    // intentionally NOT called here to avoid a double-fire. (SPEC §1 / [P2.3])
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
    // NOTE: outbound LeadSquared enqueue now fires inside createCrmLead (before
    // any throwable post-processing), so it is intentionally NOT called here.
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
    // In-app + email notification when a lead is created already assigned to
    // someone other than the creator. Mirrors the PATCH owner-change path.
    if (lead.ownerId) {
      void notifyLeadAssigned({
        orgId: user.orgId,
        actorUserId: user.userId,
        actorName: user.name || user.email,
        leadId: lead.id,
        leadName: lead.name,
        newOwnerId: lead.ownerId,
      }).catch((err) => console.error("[notifications] lead assigned on create", err));
    }
    return NextResponse.json(lead, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
