import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { resolveOpspOwnerOrSelf } from "@/lib/api/opspOwner";
import { toErrorMessage } from "@/lib/api/errors";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
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
    const fiscalQuarter = getFiscalQuarter();

    // OPSP is org-shared: the deadline/review banners track the org's canonical
    // plan, so every member sees the same finalize/review countdown.
    const ownerId = await resolveOpspOwnerOrSelf(orgId, session.user.id);

    // Parallelize the three reads — period lookups for the org's OPSP.
    const [opsp, flagRows, strictQuarterSetting] = await Promise.all([
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
      db.quarterSetting.findUnique({
        where: { orgId_fiscalYear_quarter: { orgId, fiscalYear, quarter: fiscalQuarter } },
        select: { startDate: true, endDate: true },
      }),
    ]);

    if (!opsp) {
      return NextResponse.json({ success: true, finalize: null, review: null });
    }

    const flags = new Map(flagRows.map((f) => [f.key, f]));
    const finalizeDays = parseExplicitThresholdDays(flags.get("opsp_threshold_days") ?? null);
    const reviewDays = parseExplicitThresholdDays(flags.get("opsp_review_threshold_days") ?? null);

    const period = resolvePeriodLabel(opsp.year, opsp.quarter);
    const now = new Date();

    /* ──────────────────── Finalize banner ──────────────────── */
    let finalize:
      | { mode: "A" | "B"; show: true; daysLeft: number; message: string; period: string;
          createdAt?: string; autoFinalizeDate?: string; thresholdDays?: number; opspStatus?: string }
      | null = null;

    // Mode A is preferred. Eligible when (i) the OPSP is in draft, (ii) createdAt
    // is present, and (iii) the finalize threshold is explicitly configured.
    if (opsp.status !== "finalized" && opsp.status !== "reviewed") {
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

    /* ──────────────────── Review banner ──────────────────── */
    let review:
      | { show: true; daysUntilQuarterEnd: number; isOverdue: boolean; message: string; period: string }
      | null = null;

    if (opsp.status !== "reviewed" && reviewDays !== null) {
      // Resolve quarter end via the lenient ladder:
      //   1. Strict (org, fiscalYear, fiscalQuarter) — already loaded
      //   2. Fiscal-year flex (org, opsp.year, opsp.quarter)
      //   3. Synthetic calendar quarter end on opsp.year
      let quarterEnd: Date | null = strictQuarterSetting
        ? endOfDayUTC(strictQuarterSetting.endDate)
        : null;

      if (!quarterEnd && (opsp.year !== fiscalYear || opsp.quarter !== fiscalQuarter)) {
        const flex = await db.quarterSetting.findUnique({
          where: { orgId_fiscalYear_quarter: { orgId, fiscalYear: opsp.year, quarter: opsp.quarter } },
          select: { endDate: true },
        });
        if (flex) quarterEnd = endOfDayUTC(flex.endDate);
      }
      if (!quarterEnd) {
        quarterEnd = getSyntheticCalendarQuarterEnd(opsp.year, opsp.quarter);
      }

      const result = buildOpspReviewReminderMessage({ now, quarterEnd, reviewDays, period });
      if (result) {
        review = {
          show: true,
          daysUntilQuarterEnd: result.daysUntilQuarterEnd,
          isOverdue: result.isOverdue,
          message: result.message,
          period,
        };
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
