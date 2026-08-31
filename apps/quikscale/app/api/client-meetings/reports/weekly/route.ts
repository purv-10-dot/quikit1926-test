import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  findReport,
  saveReportEdit,
  scopeKeyFor,
  softDeleteReport,
} from "@/lib/reports/reportStore";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import {
  storedWeeklyReportSchema,
  buildMetricsSnapshot,
  type StoredWeeklyReport,
} from "@/lib/ai/weeklyHuddleCompose";
import { mergeWeeklyReportEdit } from "@/lib/reports/reportEditMerge";
import { validateWeeklyReport } from "@/lib/ai/weeklyReportValidation";
import { snapshotReportVersion } from "@/lib/reports/versions";
import { loadWeekContext, toWeekStart, weekEndFor } from "@/lib/services/weeklyHuddleData";
import { collectUnmappedSpeakers } from "@/lib/services/unmappedSpeakers";
import {
  computeWeeklyCacheState,
  evaluateWeeklyCache,
} from "@/lib/reports/weeklyCacheState";
import { parseDeleteBody, guardValidated } from "@/lib/reports/deleteGuard";
import { audit, requestContext } from "@/lib/audit";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/** This route only ever touches one kind of row in the shared report table. */
const KIND = "DH_WEEKLY" as const;

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

  const saved = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: weekStart }),
  );

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
      /**
       * The client's roster, for the unmapped-speaker tray's member picker.
       * Bounded by a client team's size (tens of rows), so it rides along with
       * the report rather than costing a second round trip.
       */
      roster: context.roster.map((m) => ({ id: m.id, name: m.name, email: m.email })),
      sources: context.sources,
      /**
       * Names the recordings used that resolved to nobody, each with the
       * matcher's own suggestion — the input to the unmapped-speaker tray.
       *
       * Derived from the LIVE context, deliberately not from the stored report:
       * it describes what needs fixing in the roster right now, and it must
       * keep answering that after an alias is saved (the row disappears) even
       * while the stored report still shows the old phantom row.
       */
      unmappedSpeakers: collectUnmappedSpeakers(context.days, context.roster),
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
    const saved = await findReport(
      orgId,
      KIND,
      scopeKeyFor({ kind: KIND, periodStart: context.weekStart }),
    );

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
 * THE PAYLOAD IS NOT TRUSTED
 * --------------------------
 * The body carries the whole document, but only the prose paths in
 * `mergeWeeklyReportEdit` are read from it; every computed field is taken from
 * the stored row. Before that merge existed this handler persisted the submitted
 * JSON wholesale, which meant a client could post any attendance percentage it
 * liked and the recomputed "metrics snapshot" would faithfully preserve the lie.
 * Numbers belong to `weeklyHuddleAggregate.ts`, and this route now enforces it.
 *
 * AN EDIT IS A VERSIONED, VALIDATED, AUDITED EVENT
 * ------------------------------------------------
 *   · Validation is re-run, so the consistency banner describes the document as
 *     it now reads rather than as it was generated.
 *   · A `MeetingReportVersion` snapshot is written, so an edit is recoverable
 *     and "what did this say before?" stays answerable. Best-effort, like the
 *     generate path: losing history must never fail the save.
 *   · Editing content clears an existing sign-off, matching the rule
 *     regeneration already follows — a reviewer signed off on the words they
 *     read, not on words written afterwards.
 *
 * A sign-off-only call (no prose changes) skips all three: nothing about the
 * document moved, so there is nothing to version, re-validate or clear.
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

  const existing = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: weekStart }),
  );
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No generated report for this week — generate it first." },
      { status: 404 },
    );
  }

  // Prose from the payload, everything computed from the stored row.
  //
  // The stored document is the BASE of the merge, so it has to be readable. When
  // it is not — a row written before a schema change, or one truncated by a bad
  // write — refuse the edit rather than fall back to trusting the payload: that
  // fallback is precisely the number-rewriting hole this merge exists to close.
  // Regenerating rebuilds the row from artefacts that are still intact.
  const storedParsed = storedWeeklyReportSchema.safeParse(existing.report);
  if (!storedParsed.success) {
    return NextResponse.json(
      {
        success: false,
        error:
          "The stored report is in an older format and cannot be edited safely. Regenerate it first, then edit.",
      },
      { status: 409 },
    );
  }
  const storedReport = storedParsed.data;
  const now = new Date();
  const { report: merged, changedFields } = mergeWeeklyReportEdit(storedReport, report, {
    userId,
    at: now,
  });

  // Re-validate only when the text actually moved. The validator needs the
  // roster, which costs a read; a sign-off click should not pay for it.
  let validation = existing.validation as unknown;
  if (changedFields.length) {
    const revalidated = await revalidateSafely(orgId, parsed.data.clientId, weekStart, merged);
    if (revalidated) validation = revalidated;
  }

  const counts = ((validation as { counts?: { errors?: number; warnings?: number } } | null)?.counts ??
    {}) as { errors?: number; warnings?: number };
  const metrics = buildMetricsSnapshot(merged, {
    counts: { errors: counts.errors ?? 0, warnings: counts.warnings ?? 0 },
  });

  const updated = await saveReportEdit(existing.id, {
    report: merged,
    metrics,
    validation,
    reportConfidence: merged.overallConfidence,
    // Content changed ⇒ the sign-off no longer covers what the document says.
    // An explicit `validated` in the same call still wins, so "edit and sign
    // off" remains one action.
    validated: changedFields.length && validated === undefined ? false : validated,
    userId,
  });

  if (changedFields.length) {
    // Best effort, in the spirit of the generate route: a lost snapshot or audit
    // row must not fail the save the user is waiting on.
    void snapshotReportVersion({
      orgId,
      clientId: parsed.data.clientId,
      reportKind: KIND,
      reportId: existing.id,
      report: merged,
      metrics,
      validation,
      generatedBy: userId,
    }).catch(() => undefined);

    void audit
      .log({
        entityType: "CLIENT_MEETING_REPORT",
        entityId: existing.id,
        action: "UPDATE",
        actor: { userId, orgId, teamId: null },
        snapshot: { kind: KIND, fields: changedFields },
        ...requestContext(req),
      })
      .catch(() => undefined);
  }

  return NextResponse.json({
    success: true,
    data: {
      report: merged,
      metrics,
      validation,
      changedFields,
      validatedAt: updated.validatedAt,
      validatedBy: updated.validatedBy,
    },
  });
});

/**
 * Re-run the consistency check over an edited document.
 *
 * Returns null rather than throwing: a report that cannot be re-validated is
 * still a report the user is entitled to save, and the previous validation
 * result remains a truthful description of everything except the edited
 * sentences.
 */
async function revalidateSafely(
  orgId: string,
  clientId: string,
  weekStart: Date,
  report: StoredWeeklyReport,
): Promise<unknown | null> {
  try {
    const context = await loadWeekContext(orgId, clientId, weekStart);
    if (!context) return null;

    return validateWeeklyReport({
      roster: context.roster,
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEndFor(weekStart).toISOString().slice(0, 10),
      metrics: report.executive.metrics,
      attendance: report.attendance,
      heatMap: report.heatMap,
      blockers: report.stucks.all,
      unrecognized: report.heatMap.unrecognized,
      visibleSpeakers: report.heatMap.rows
        .filter((r) => r.memberId === null)
        .map((r) => r.participant),
      ai: {
        overallConfidence: report.overallConfidence,
        keyHighlights: report.executive.keyHighlights,
        recurringStucks: report.stucks.recurring,
        facilitatorObservations: report.facilitatorObservations,
        // §8 superseded the old flat suggestion list; the validator reads it
        // only for low-confidence INFO notes, which no edit can change.
        wwwSuggestions: report.wwwSuggestions ?? [],
      },
    });
  } catch (err) {
    console.error("[reports:weekly] re-validation after edit failed:", err);
    return null;
  }
}

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
  const existing = await findReport(
    orgId,
    KIND,
    scopeKeyFor({ kind: KIND, periodStart: weekStart }),
  );
  if (!existing) {
    return NextResponse.json(
      { success: false, error: "No weekly report for this week." },
      { status: 404 },
    );
  }

  const { reason, confirmValidated } = await parseDeleteBody(req);
  const blocked = guardValidated(existing.validatedAt, confirmValidated, "This weekly report");
  if (blocked) return blocked;

  await softDeleteReport(existing.id, userId);

  const weekLabel = weekStart.toISOString().slice(0, 10);
  await audit.log({
    entityType: "MEETING_REPORT",
    entityId: existing.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: {
      name: `Weekly rollup · week of ${weekLabel}`,
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
