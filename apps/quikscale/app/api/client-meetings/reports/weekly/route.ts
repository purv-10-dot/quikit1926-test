import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { storedWeeklyReportSchema, buildMetricsSnapshot } from "@/lib/ai/weeklyHuddleCompose";
import { loadWeekContext, toWeekStart, weekEndFor } from "@/lib/services/weeklyHuddleData";
import {
  computeWeeklyCacheState,
  evaluateWeeklyCache,
} from "@/lib/reports/weeklyCacheState";
import { parseDeleteBody, guardValidated } from "@/lib/reports/deleteGuard";
import { audit, requestContext } from "@/lib/audit";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const querySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
});

function parseQuery(url: string) {
  const { searchParams } = new URL(url);
  return querySchema.safeParse({
    clientId: searchParams.get("clientId") ?? "",
    weekStart: searchParams.get("weekStart") ?? "",
  });
}

/**
 * GET /api/client-meetings/reports/weekly?clientId=…&weekStart=yyyy-mm-dd
 *
 * Returns the saved weekly report for a client-week (or `report: null`), plus
 * the per-day `sources` list so the page can render the huddle checklist and
 * show which days still need a daily report generated — one round trip for the
 * whole screen.
 *
 * `weekStart` is snapped to the Monday of its ISO week, so any date in the
 * week resolves to the same stored row.
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const parsed = parseQuery(req.url);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const weekStart = toWeekStart(new Date(`${parsed.data.weekStart}T00:00:00.000Z`));
  const context = await loadWeekContext(orgId, parsed.data.clientId, weekStart);
  if (!context) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const saved = await db.clientDailyHuddleWeeklyReport.findFirst({
    where: { orgId, clientId: parsed.data.clientId, weekStart, deletedAt: null },
  });

  const canEdit = await userCan(userId, orgId, "ClientMeetings.Report", "update");

  // Is the stored report still current? This compares the cache-key triple
  // against the live data — and does NOT regenerate. Auto-regenerating on a
  // read would re-bill on a page view and silently void a facilitator's
  // sign-off, which is exactly the behaviour the architecture forbids.
  //
  // BEST EFFORT. The fingerprint needs a few extra indexed reads, and if any of
  // them fail the report must still be readable: a staleness banner is a
  // convenience, and losing it is not a reason to deny someone the report they
  // came for. On failure the verdict is "unknown" — neither fresh nor stale —
  // so the UI shows no banner rather than a wrong one.
  const verdict = await evaluateCacheSafely(orgId, parsed.data.clientId, context);

  return NextResponse.json({
    success: true,
    data: {
      report: saved?.report ?? null,
      metrics: saved?.metrics ?? null,
      validation: saved?.validation ?? null,
      confidence: saved?.reportConfidence ?? null,
      generatedAt: saved?.generatedAt ?? null,
      generatedBy: saved?.generatedBy ?? null,
      validatedAt: saved?.validatedAt ?? null,
      validatedBy: saved?.validatedBy ?? null,
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEndFor(weekStart).toISOString().slice(0, 10),
      rosterSize: context.roster.length,
      sources: context.sources,
      canEdit,
      version: saved?.currentVersion ?? null,
      coveragePct: saved?.coveragePct ?? null,
      /**
       * Staleness, for the banner. The report is still SERVED — the user
       * decides whether to spend on a regeneration.
       *
       * `wouldClearSignOff` warns that regenerating discards a completed
       * review, so the UI can confirm before destroying it.
       */
      cache: verdict,
    },
  });
});

/**
 * Evaluate staleness without ever failing the read.
 *
 * `known: false` means the check itself could not run — distinct from "the
 * report is fresh". The UI must show no banner in that case rather than
 * asserting currency it has not verified.
 */
async function evaluateCacheSafely(
  orgId: string,
  clientId: string,
  context: Awaited<ReturnType<typeof loadWeekContext>>,
): Promise<{
  known: boolean;
  fresh: boolean;
  stale: boolean;
  reasons: string[];
  messages: string[];
  wouldClearSignOff: boolean;
}> {
  const unknown = {
    known: false,
    fresh: false,
    stale: false,
    reasons: [] as string[],
    messages: [] as string[],
    wouldClearSignOff: false,
  };
  if (!context) return unknown;

  try {
    const saved = await db.clientDailyHuddleWeeklyReport.findFirst({
      where: { orgId, clientId, weekStart: context.weekStart, deletedAt: null },
      select: {
        sourceFingerprint: true,
        promptVersion: true,
        schemaVersion: true,
        coveragePct: true,
        currentVersion: true,
        validatedAt: true,
      },
    });

    const state = await computeWeeklyCacheState(orgId, clientId, context);
    const verdict = evaluateWeeklyCache(saved ?? null, state);

    return {
      known: true,
      fresh: verdict.fresh,
      stale: verdict.stale,
      reasons: verdict.reasons,
      messages: verdict.messages,
      wouldClearSignOff: verdict.wouldClearSignOff,
    };
  } catch (err) {
    console.error(
      "[reports:weekly] staleness check failed; serving the report without it:",
      err instanceof Error ? err.message : err,
    );
    return unknown;
  }
}

const putSchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  report: storedWeeklyReportSchema,
  /** Sign-off toggle. Absent leaves the current state untouched. */
  validated: z.boolean().optional(),
});

/**
 * PUT /api/client-meetings/reports/weekly
 *
 * Persist an edited weekly report and/or its sign-off state. This is the edit
 * gate — requires `ClientMeetings.Report` update.
 *
 * The metrics snapshot is recomputed from the submitted report rather than
 * taken from the body, so a hand-edited report can never desync the flat
 * numbers the Monthly Report will trend. The stored `validation` result is
 * left as generated — re-running it belongs to the generate route, and a
 * reviewer's edits are exactly what sign-off is for.
 */
export const PUT = auth.update(async ({ orgId, userId }, req) => {
  const body = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid report" },
      { status: 400 },
    );
  }
  const { clientId, report, validated } = parsed.data;
  const weekStart = toWeekStart(new Date(`${parsed.data.weekStart}T00:00:00.000Z`));

  const existing = await db.clientDailyHuddleWeeklyReport.findFirst({
    where: { orgId, clientId, weekStart, deletedAt: null },
    select: { id: true, validation: true, validatedAt: true, validatedBy: true },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No generated report for this week — generate it first." },
      { status: 404 },
    );
  }

  const counts = ((existing.validation as { counts?: { errors?: number; warnings?: number } } | null)
    ?.counts ?? {}) as { errors?: number; warnings?: number };
  const metrics = buildMetricsSnapshot(report, {
    counts: { errors: counts.errors ?? 0, warnings: counts.warnings ?? 0 },
  });

  const now = new Date();
  const updated = await db.clientDailyHuddleWeeklyReport.update({
    where: { id: existing.id },
    data: {
      report: report as unknown as Prisma.InputJsonValue,
      metrics: metrics as unknown as Prisma.InputJsonValue,
      reportConfidence: report.overallConfidence,
      updatedAt: now,
      updatedBy: userId,
      ...(validated === undefined
        ? {}
        : validated
          ? { validatedAt: now, validatedBy: userId }
          : { validatedAt: null, validatedBy: null }),
    },
    select: { validatedAt: true, validatedBy: true },
  });

  return NextResponse.json({
    success: true,
    data: { report, metrics, validatedAt: updated.validatedAt, validatedBy: updated.validatedBy },
  });
});

/**
 * DELETE /api/client-meetings/reports/weekly?clientId=…&weekStart=yyyy-mm-dd
 *
 * Soft-delete the Daily Huddle Weekly Report for one client-week.
 *
 * The per-day daily reports the rollup was built from are NOT touched: they
 * belong to their transcripts, cost money to produce, and are what a
 * regeneration reuses. Deleting the rollup throws away only the composed
 * week-level document, so regenerating it costs one model call, not five.
 *
 * A signed-off week requires `confirmValidated: true` — see `deleteGuard`.
 *
 * PERMISSION — `ClientMeetings.Report: delete`.
 */
export const DELETE = auth.delete(async ({ orgId, userId }, req) => {
  const parsed = parseQuery(req.url);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 },
    );
  }

  const weekStart = toWeekStart(new Date(`${parsed.data.weekStart}T00:00:00.000Z`));
  const existing = await db.clientDailyHuddleWeeklyReport.findFirst({
    where: { orgId, clientId: parsed.data.clientId, weekStart, deletedAt: null },
    select: { id: true, validatedAt: true, currentVersion: true, client: { select: { name: true } } },
  });
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No weekly report for this week." },
      { status: 404 },
    );
  }

  const { reason, confirmValidated } = await parseDeleteBody(req);
  const blocked = guardValidated(existing.validatedAt, confirmValidated, "This weekly report");
  if (blocked) return blocked;

  await db.clientDailyHuddleWeeklyReport.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });

  const weekLabel = weekStart.toISOString().slice(0, 10);
  await audit.log({
    entityType: "MEETING_REPORT",
    entityId: existing.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: {
      name: `Weekly rollup · ${existing.client?.name ?? "—"} · week of ${weekLabel}`,
      reportType: "DH_WEEKLY",
      clientId: parsed.data.clientId,
      weekStart: weekLabel,
      version: existing.currentVersion,
      wasValidated: Boolean(existing.validatedAt),
    },
    ...requestContext(req),
  });

  return NextResponse.json({ success: true, data: { id: existing.id } });
});
