import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { resolveOpspOwnerOrSelf } from "@/lib/api/opspOwner";
import { toErrorMessage } from "@/lib/api/errors";
import { getFiscalYear, getFiscalQuarter, resolveQuarterForDate } from "@/lib/utils/fiscal";
import { diffDays, addDays } from "@/lib/utils/quarterGen";
import { writeAuditLog } from "@/lib/api/auditLog";
import {
  parseExplicitThresholdDays,
  getSyntheticCalendarQuarterEnd,
  resolvePeriodLabel,
  startOfDayUTC,
  endOfDayUTC,
  buildFinalizeMessageModeB,
  buildOpspReviewReminderMessage,
} from "@/lib/utils/opspThreshold";

/**
 * GET /api/opsp/deadline
 *
 * Returns BOTH banner payloads for the current user's OPSP — see
 * OPSP_THRESHOLD_LOGIC.md for the full spec.
 *
 * Response shape:
 *   {
 *     success: true,
 *     finalize: { mode: "A"|"B", show: true, daysLeft, message, period, ... } | null,
 *     review:   { show: true, daysUntilQuarterEnd, isOverdue, message, period } | null,
 *     autoFinalized?: { message }
 *   }
 *
 * Mode A (Finalize): anchored on `OPSPData.createdAt`. Requires the
 * `opsp_threshold_days` FeatureFlag to be explicitly set. Lazy auto-finalize
 * when the deadline is breached.
 *
 * Mode B (Finalize): fallback when Mode A doesn't apply. Anchored on the
 * tenant's `QuarterSetting.endDate`. Default lead time of 5 days when no
 * threshold is configured. No auto-finalize — overdue message persists.
 *
 * Review: anchored on quarter end. `opsp_review_threshold_days` has NO default
 * (silence when not configured). Quarter-end resolved via strict
 * QuarterSetting lookup, then fiscal-year flex, then synthetic calendar
 * quarter as last-ditch fallback.
 *
 * Returns `{ success: true, finalize: null, review: null }` for unauthenticated
 * users (no 401) because the dashboard layout calls this unconditionally.
 */
export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: true, finalize: null, review: null });
    }

    const orgId = await getOrgId(session.user.id);
    if (!orgId) {
      return NextResponse.json({ success: true, finalize: null, review: null });
    }

    const fiscalYear = getFiscalYear();
    const now = new Date();

    // OPSP is org-shared: the deadline/review banners track the org's canonical
    // plan, so every member sees the same finalize/review countdown.
    const ownerId = await resolveOpspOwnerOrSelf(orgId, session.user.id);

    // Custom-Quarter aware "current quarter". A tenant's configured
    // QuarterSetting date ranges can push a quarter past its calendar-month
    // boundary (e.g. a custom 14-week Q1 ending in July), where the calendar
    // getFiscalQuarter() wrongly reports Q2. Resolve the quarter from those rows
    // first and fall back to the calendar quarter only when none are configured.
    // See resolveQuarterForDate.
    const quarterRows = await db.quarterSetting.findMany({
      where: { orgId, fiscalYear },
      select: { quarter: true, startDate: true, endDate: true },
    });
    const resolvedQuarter = resolveQuarterForDate(quarterRows, now);
    const fiscalQuarter = resolvedQuarter ?? getFiscalQuarter();
    // Reuse the matched row (avoids a second strict findUnique) when custom
    // quarters resolved the period; else fall back to the strict lookup below.
    const matchedRow = resolvedQuarter
      ? quarterRows.find((r) => r.quarter === resolvedQuarter) ?? null
      : null;

    // Parallelize the reads — period lookup for the org's OPSP + threshold flags.
    const [opsp, flagRows] = await Promise.all([
      db.oPSPData.findFirst({
        where: { orgId, userId: ownerId, year: fiscalYear, quarter: fiscalQuarter },
        select: { id: true, status: true, createdAt: true, year: true, quarter: true },
      }),
      db.featureFlag.findMany({
        where: {
          orgId,
          key: { in: ["opsp_threshold_days", "opsp_review_threshold_days"] },
        },
        select: { key: true, enabled: true, value: true },
      }),
    ]);

    // Quarter-end anchor (Mode B + review). Reuse the custom-quarter row matched
    // above; only hit the strict per-quarter lookup when no custom rows exist.
    const strictQuarterSetting = matchedRow
      ? { startDate: matchedRow.startDate, endDate: matchedRow.endDate }
      : quarterRows.length === 0
        ? await db.quarterSetting.findUnique({
            where: { orgId_fiscalYear_quarter: { orgId, fiscalYear, quarter: fiscalQuarter } },
            select: { startDate: true, endDate: true },
          })
        : null;

    const flags = new Map(flagRows.map((f) => [f.key, f]));
    const finalizeDays = parseExplicitThresholdDays(flags.get("opsp_threshold_days") ?? null);
    const reviewDays = parseExplicitThresholdDays(flags.get("opsp_review_threshold_days") ?? null);

    // NOTE: we no longer early-return when the current-quarter OPSP is missing.
    // The Finalize banner tracks the current quarter, but the Review reminder
    // tracks a (possibly PAST) finalized-but-unreviewed quarter — so even with no
    // current-quarter OPSP, a pending review must still surface.

    const period = opsp ? resolvePeriodLabel(opsp.year, opsp.quarter) : "current OPSP";

    /* ──────────────────── Finalize banner (current quarter) ──────────────────── */
    let finalize:
      | { mode: "A" | "B"; show: true; daysLeft: number; message: string; period: string;
          createdAt?: string; autoFinalizeDate?: string; thresholdDays?: number; opspStatus?: string }
      | null = null;

    // Mode A is preferred. Eligible when (i) the OPSP is in draft, (ii) createdAt
    // is present, and (iii) the finalize threshold is explicitly configured.
    if (opsp && opsp.status !== "finalized" && opsp.status !== "reviewed") {
      if (finalizeDays !== null && opsp.createdAt) {
        // ── Mode A ──
        const createdAt = startOfDayUTC(new Date(opsp.createdAt));
        const autoFinalizeDate = addDays(createdAt, finalizeDays);
        const today = startOfDayUTC(now);
        const daysLeft = diffDays(today, autoFinalizeDate);

        if (daysLeft <= 0) {
          // Lazy auto-finalize — Mode A's contract.
          await db.oPSPData.update({
            where: { id: opsp.id },
            data: { status: "finalized", updatedBy: "system:auto-finalize" },
          });
          await writeAuditLog({
            orgId,
            actorId: "system:auto-finalize",
            action: "UPDATE",
            entityType: "OPSPData",
            entityId: opsp.id,
            changes: ["status:finalized"],
            reason: `Auto-finalized: deadline breached (${finalizeDays}-day threshold exceeded)`,
          });
          // Auto-finalize wins the response. Skip the review banner — the OPSP
          // is now locked in `finalized`, not `reviewed`, but surfacing two
          // notifications on the same tick would be jarring.
          return NextResponse.json({
            success: true,
            finalize: null,
            review: null,
            autoFinalized: {
              message: "OPSP has been auto-finalized because the deadline was reached.",
            },
          });
        }

        finalize = {
          mode: "A",
          show: true,
          daysLeft,
          message: `Your OPSP will be auto-finalized in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Complete and review it before the deadline.`,
          period,
          createdAt: opsp.createdAt.toISOString(),
          autoFinalizeDate: autoFinalizeDate.toISOString(),
          thresholdDays: finalizeDays,
          opspStatus: opsp.status,
        };
      } else if (strictQuarterSetting) {
        // ── Mode B fallback — quarter-end anchored. ──
        const quarterEnd = endOfDayUTC(strictQuarterSetting.endDate);
        const daysOrDefault = finalizeDays ?? 5;
        const result = buildFinalizeMessageModeB({ now, quarterEnd, daysOrDefault, period });
        if (result) {
          finalize = {
            mode: "B",
            show: true,
            daysLeft: result.daysLeft,
            message: result.message,
            period,
            opspStatus: opsp.status,
          };
        }
      }
      // else: no Mode A inputs AND no quarter row → finalize stays null.
    }

    /* ──────────────────── Review banner / modal ──────────────────── */
    // The review reminder is NOT tied to the current quarter. You review a
    // quarter's OPSP *after* it's finalized, and that usually happens once you've
    // already moved into the NEXT quarter (the period gate only needs the prior
    // quarter finalized to unlock the next one). So the review target is the
    // OLDEST finalized-but-unreviewed OPSP — the most overdue pending review —
    // independent of whichever quarter is current.
    //
    //   • Still within `reviewDays` of that quarter's end → countdown banner.
    //   • Quarter already ended (overdue) → the client escalates to a blocking
    //     modal. Reminder persists until the review is submitted (status
    //     transitions off "finalized" to "reviewed").
    let review:
      | { show: true; daysUntilQuarterEnd: number; isOverdue: boolean; message: string; period: string }
      | null = null;

    if (reviewDays !== null) {
      const reviewOpsp = await db.oPSPData.findFirst({
        where: { orgId, userId: ownerId, status: "finalized" },
        select: { year: true, quarter: true },
        orderBy: [{ year: "asc" }, { quarter: "asc" }],
      });

      if (reviewOpsp) {
        // Resolve the review quarter's end via the lenient ladder:
        //   1. Reuse the current-quarter row when the review target IS current.
        //   2. Strict (org, reviewOpsp.year, reviewOpsp.quarter) lookup.
        //   3. Synthetic calendar quarter end as last resort.
        let quarterEnd: Date | null =
          strictQuarterSetting &&
          reviewOpsp.year === fiscalYear &&
          reviewOpsp.quarter === fiscalQuarter
            ? endOfDayUTC(strictQuarterSetting.endDate)
            : null;

        if (!quarterEnd) {
          const qs = await db.quarterSetting.findUnique({
            where: {
              orgId_fiscalYear_quarter: {
                orgId,
                fiscalYear: reviewOpsp.year,
                quarter: reviewOpsp.quarter,
              },
            },
            select: { endDate: true },
          });
          if (qs) quarterEnd = endOfDayUTC(qs.endDate);
        }
        if (!quarterEnd) {
          quarterEnd = getSyntheticCalendarQuarterEnd(reviewOpsp.year, reviewOpsp.quarter);
        }

        const reviewPeriod = resolvePeriodLabel(reviewOpsp.year, reviewOpsp.quarter);
        const result = buildOpspReviewReminderMessage({ now, quarterEnd, reviewDays, period: reviewPeriod });
        if (result) {
          review = {
            show: true,
            daysUntilQuarterEnd: result.daysUntilQuarterEnd,
            isOverdue: result.isOverdue,
            message: result.message,
            period: reviewPeriod,
          };
        }
      }
    }

    return NextResponse.json({ success: true, finalize, review });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to check OPSP deadline") },
      { status: 500 },
    );
  }
}
