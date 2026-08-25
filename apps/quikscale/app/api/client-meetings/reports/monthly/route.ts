import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  findReport,
  scopeKeyFor,
  setValidated,
  softDeleteReport,
} from "@/lib/reports/reportStore";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { monthBounds } from "@/lib/reports/monthlyCompose";
import { parseDeleteBody, guardValidated } from "@/lib/reports/deleteGuard";
import { audit, requestContext } from "@/lib/audit";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/** This route only ever touches one kind of row in the shared report table. */
const KIND = "MONTHLY" as const;

const querySchema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be yyyy-mm"),
});

/**
 * GET /api/client-meetings/reports/monthly?clientId=…&period=yyyy-mm
 *
 * Returns the saved Monthly Report, or `report: null` when none exists.
 *
 * **ZERO model calls. ZERO transcript reads.** This is the read path the whole
 * architecture is built around: a month costs ~5k tokens to GENERATE once, and
 * nothing at all to view, however many times it is opened.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` section H.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const bounds = monthBounds(parsed.data.period);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid period" }, { status: 400 });
  }

  const client = await db.client.findFirst({
    where: { id: parsed.data.clientId, orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const saved = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: bounds.start }),
  );

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  return NextResponse.json({
    success: true,
    data: {
      client,
      period: parsed.data.period,
      report: saved?.report ?? null,
      metrics: saved?.metrics ?? null,
      validation: saved?.validation ?? null,
      confidence: saved?.reportConfidence ?? null,
      generatedAt: saved?.generatedAt ?? null,
      generatedBy: saved?.generatedBy ?? null,
      validatedAt: saved?.validatedAt ?? null,
      validatedBy: saved?.validatedBy ?? null,
      version: saved?.currentVersion ?? null,
      missingSources: saved?.missingSources ?? [],
      sourceReportIds: saved?.sourceReportIds ?? [],
      canEdit,
      canGenerate: canEdit,
    },
  });
});

/**
 * DELETE /api/client-meetings/reports/monthly?clientId=…&period=yyyy-mm
 *
 * Soft-delete the Monthly Report for one client-month.
 *
 * The weekly rollups and weekly meeting reports it trends are untouched — this
 * is the cheapest report in the system to rebuild (one ~5k-token call over
 * already-computed metrics), so deleting it discards a summary, never data.
 *
 * A signed-off report requires `confirmValidated: true`.
 *
 * PERMISSION — `ClientMeetings.Report: delete`.
 */
export const DELETE = auth.delete(async ({ orgId, userId }, req) => {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const bounds = monthBounds(parsed.data.period);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid period" }, { status: 400 });
  }

  const existing = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: bounds.start }),
  );
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No monthly report for this period." },
      { status: 404 },
    );
  }

  const { reason, confirmValidated } = await parseDeleteBody(req);
  const blocked = guardValidated(existing.validatedAt, confirmValidated, "This monthly report");
  if (blocked) return blocked;

  await softDeleteReport(existing.id, userId);

  await audit.log({
    entityType: "MEETING_REPORT",
    entityId: existing.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: {
      name: `Monthly report · ${parsed.data.period}`,
      reportType: "MONTHLY",
      clientId: parsed.data.clientId,
      period: parsed.data.period,
      version: existing.currentVersion,
      wasValidated: Boolean(existing.validatedAt),
    },
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, data: { id: existing.id } });
});

const validateSchema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be yyyy-mm"),
  validated: z.boolean(),
});

/**
 * PUT /api/client-meetings/reports/monthly
 *
 * Sign-off, and only sign-off. The report body is not editable through this
 * route: every figure in a monthly report is computed from the weekly
 * snapshots, so an edited number would no longer match the weeks it came from.
 * Regeneration is the way to change a monthly report.
 *
 * PERMISSION — `ClientMeetings.Report: update`, the same gate as generating.
 */
export const PUT = auth.update(async ({ orgId, userId }, req) => {
  const parsed = validateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const bounds = monthBounds(parsed.data.period);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid period" }, { status: 400 });
  }

  const saved = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: bounds.start }),
  );
  if (!saved) {
    return NextResponse.json(
      { success: false, error: "No generated report for this period — generate it first." },
      { status: 404 },
    );
  }

  const updated = await setValidated(saved.id, {
    validated: parsed.data.validated,
    userId,
  });

  return NextResponse.json({ success: true, data: updated });
});
