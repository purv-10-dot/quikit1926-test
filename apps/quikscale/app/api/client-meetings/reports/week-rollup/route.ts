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
import { parseDeleteBody, guardValidated } from "@/lib/reports/deleteGuard";
import { audit, requestContext } from "@/lib/audit";
import {
  weekBounds,
  WEEK_ROLLUP_SCHEMA_VERSION,
  WEEK_ROLLUP_PROMPT_VERSION,
} from "@/lib/reports/weekRollupCompose";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/** This route only ever touches one kind of row in the shared report table. */
const KIND = "WEEK_ROLLUP" as const;

const querySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
});

const validateSchema = querySchema.extend({ validated: z.boolean() });

/**
 * GET /api/client-meetings/reports/week-rollup?clientId=…&weekStart=yyyy-mm-dd
 *
 * Returns the saved Week Rollup, or `report: null` when none exists.
 *
 * **ZERO model calls. ZERO transcript reads. ZERO fact reads.** Generating a
 * week costs one small analysis pass over stored digests; viewing it costs
 * nothing, however many times it is opened.
 *
 * Staleness is reported, never acted on — auto-regenerating on read is the
 * token bomb doc 17 §L exists to prevent, and it would silently invalidate a
 * sign-off.
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

  const bounds = weekBounds(parsed.data.weekStart);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid week" }, { status: 400 });
  }

  const client = await db.client.findFirst({
    where: { id: parsed.data.clientId, orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const saved = await findReport(orgId, KIND, scopeKeyFor({ kind: KIND, periodStart: bounds.start }));

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  const staleReasons: string[] = [];
  if (saved) {
    if (saved.promptVersion !== WEEK_ROLLUP_PROMPT_VERSION) {
      staleReasons.push("The analysis prompt has changed since this rollup was generated.");
    }
    if (saved.schemaVersion !== WEEK_ROLLUP_SCHEMA_VERSION) {
      staleReasons.push("The report format has changed since this rollup was generated.");
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      client,
      weekStart: parsed.data.weekStart,
      report: saved?.report ?? null,
      metrics: saved?.metrics ?? null,
      validation: saved?.validation ?? null,
      confidence: saved?.reportConfidence ?? null,
      missingSources: saved?.missingSources ?? [],
      sourceReportIds: saved?.sourceReportIds ?? [],
      generatedAt: saved?.generatedAt ?? null,
      generatedBy: saved?.generatedBy ?? null,
      validatedAt: saved?.validatedAt ?? null,
      validatedBy: saved?.validatedBy ?? null,
      version: saved?.currentVersion ?? null,
      stale: staleReasons.length > 0,
      staleReasons,
      canEdit,
      canGenerate: canEdit,
    },
  });
});

/**
 * PUT /api/client-meetings/reports/week-rollup
 *
 * Sign-off, and only sign-off. Every figure in a rollup is computed from the
 * reports beneath it, so an edited number would no longer match its sources —
 * regeneration is the way to change a rollup.
 */
export const PUT = auth.update(async ({ orgId, userId }, req) => {
  const parsed = validateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const bounds = weekBounds(parsed.data.weekStart);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid week" }, { status: 400 });
  }

  const saved = await findReport(orgId, KIND, scopeKeyFor({ kind: KIND, periodStart: bounds.start }));
  if (!saved) {
    return NextResponse.json(
      { success: false, error: "No generated rollup for this week — generate it first." },
      { status: 404 },
    );
  }

  const updated = await setValidated(saved.id, {
    validated: parsed.data.validated,
    userId,
  });

  return NextResponse.json({ success: true, data: updated });
});

/**
 * DELETE /api/client-meetings/reports/week-rollup?clientId=…&weekStart=…
 *
 * Soft-delete the rollup. The reports it was built from are untouched — this is
 * the cheapest artefact in the system to rebuild (one small call over digests
 * that already exist), so deleting it discards a summary, never data.
 *
 * A signed-off rollup requires `confirmValidated: true`.
 *
 * PERMISSION — `ClientMeetings.Report: delete`.
 */
export const DELETE = auth.delete(async ({ orgId, userId }, req) => {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const bounds = weekBounds(parsed.data.weekStart);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid week" }, { status: 400 });
  }

  const existing = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: bounds.start }),
  );
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No rollup for this week." },
      { status: 404 },
    );
  }

  const { reason, confirmValidated } = await parseDeleteBody(req);
  const blocked = guardValidated(existing.validatedAt, confirmValidated, "This week rollup");
  if (blocked) return blocked;

  await softDeleteReport(existing.id, userId);

  await audit.log({
    entityType: "MEETING_REPORT",
    entityId: existing.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: {
      name: `Week rollup · ${parsed.data.weekStart}`,
      reportType: "WEEK_ROLLUP",
      clientId: parsed.data.clientId,
      weekStart: parsed.data.weekStart,
      version: existing.currentVersion,
      wasValidated: Boolean(existing.validatedAt),
    },
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, data: { id: existing.id } });
});
