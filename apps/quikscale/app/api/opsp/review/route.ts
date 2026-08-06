import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { opspReviewSaveSchema } from "@/lib/schemas/opspReviewSchema";
import { getScales } from "@/lib/utils/currency";
import { resolveOpspOwnerOrSelf } from "@/lib/api/opspOwner";
import { resolveReviewTarget } from "@/lib/utils/opspReviewTarget";
import { userCan, forbidden } from "@/lib/api/permissions";

// OPSP Review is permission-gated (not admin-only): anyone with OPSP.Review can
// view; saving review entries requires update.
const reviewAuth = withOrgAuthForResource("opsp.review", "OPSP.Review");

/**
 * Server-side mirror of the client `resolveProjected` logic. OPSP stores
 * currency targets as "10 K" / "1.5 L" / etc. — naked parseFloat would drop
 * the suffix and produce 10 instead of 10000. This walks the same scale
 * abbreviations the OPSP modals use (K/M/B/L/Cr/Hundred Crore) and applies
 * the multiplier when the category is a Currency type.
 */
const SCALE_ABBR: Record<string, string> = {
  "": "-", Thousand: "K", Million: "M", Billion: "B",
  Lakh: "L", Crore: "Cr", "Hundred Crore": "HCr",
};

type CatMeta = {
  dataType: string;
  currency: string | null;
  categoryType: string;
};
type CatMetaMap = Map<string, CatMeta>;

function resolveStoredValue(
  raw: string,
  catMeta: { dataType: string; currency: string | null } | undefined,
): number | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  if (catMeta?.dataType === "Currency") {
    const currency = catMeta.currency ?? "USD";
    const scales = getScales(currency);
    for (const s of scales) {
      const abbr = SCALE_ABBR[s.label];
      if (!abbr || abbr === "-") continue;
      const re = new RegExp(`^(.+?)\\s+${abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
      const m = trimmed.match(re);
      if (m) {
        const n = parseFloat(m[1].trim());
        return isNaN(n) ? null : n * s.multiplier;
      }
    }
  }
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

/**
 * GET /api/opsp/review?year=2026&quarter=Q1&horizon=quarter
 *
 * Loads the OPSP source rows (actions/goals/targets) for the current user
 * and merges in any saved review entries (achieved values).
 *
 * Gated on OPSP.Review:view — admins hold the grant; a non-admin granted
 * OPSP.Review can view the (org-shared) review data read-only.
 */
export const GET = reviewAuth.view(async ({ orgId, userId }, req) => {
  try {
    const { searchParams } = req.nextUrl;
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const quarter = searchParams.get("quarter") ?? "Q1";
    const horizon = searchParams.get("horizon") ?? "quarter";

    if (!["quarter", "yearly", "3to5year"].includes(horizon)) {
      return NextResponse.json(
        { success: false, error: "Invalid horizon. Must be quarter, yearly, or 3to5year" },
        { status: 400 },
      );
    }

    // OPSP is org-shared: resolve the canonical owner so Review reads the org's
    // single plan, not the acting admin's per-user copy.
    const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

    // 1. Load the org's OPSP for this fiscal period
    const opsp = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId: ownerId, year, quarter },
      },
    });

    if (!opsp) {
      return NextResponse.json({
        success: true,
        data: { opspId: null, opspStatus: null, rows: [], secondaryRows: [], year, quarter, horizon },
      });
    }

    // 2. Extract source rows based on horizon
    const sourceRows = extractSourceRows(opsp, horizon);

    // 3. Load all review entries for this OPSP + horizon
    const entries = await db.oPSPReviewEntry.findMany({
      where: { orgId, opspId: opsp.id, horizon },
      select: {
        rowIndex: true,
        period: true,
        category: true,
        targetValue: true,
        achievedValue: true,
        lastYearSamePeriod: true,
        comment: true,
        updatedAt: true,
      },
    });

    // 4. Build a lookup: entries keyed by `${rowIndex}:${period}`
    const entryMap = new Map<string, (typeof entries)[0]>();
    for (const e of entries) {
      entryMap.set(`${e.rowIndex}:${e.period}`, e);
    }

    // 5a. Build category meta lookup so currency scales (K/M/L/Cr…) get applied
    // and so the cascade can switch its aggregation per categoryType.
    const cats = await db.categoryMaster.findMany({
      where: { orgId },
      select: { name: true, dataType: true, currency: true, categoryType: true },
    });
    const catMetaMap: CatMetaMap = new Map();
    for (const c of cats)
      catMetaMap.set(c.name, {
        dataType: c.dataType,
        currency: c.currency,
        categoryType: c.categoryType,
      });

    // 5b. Merge source rows with review data
    const periodKeys = getPeriodKeys(horizon, opsp.targetYears);
    const rows = sourceRows.map((row, idx) => {
      const periods: Record<string, {
        target: number | null;
        achieved: number | null;
        gap: number | null;
        achievedPct: number | null;
        comment: string | null;
        autoPopulated?: boolean;
        // True when this category exists in the lower-horizon source data
        // (Quarterly Actions) for this specific period, whether or not it has
        // an achieved value yet. Set by `populateCascadeData` — stays
        // `undefined` (falsy) for the Quarter horizon and for any Yearly/3-5yr
        // category never configured in Quarterly at all, which is exactly the
        // signal the client uses to let those categories' Achieved be entered
        // directly instead of waiting on a rollup that will never arrive.
        hasLowerHorizonSource?: boolean;
        lastYearAchieved: number | null;
        // "auto"   — value came from a prior-year OPSPReviewEntry (drawer disables the field)
        // "manual" — value came from the current entry's lastYearSamePeriod (user-entered)
        // "none"   — no prior-year value AND no manual entry yet (drawer editable)
        lastYearSamePeriodSource: "auto" | "manual" | "none";
      }> = {};

      const sourceCategory = (row.category as string) || "";
      const meta = catMetaMap.get(row.category as string);
      // A Cumulative category whose per-period cells (q1..q4 / m1..m3 / y1..yN)
      // were never broken down (e.g. a manually-typed category — see
      // GoalsSection's "breakdownProjected returns null for manual categories,
      // leave the quarter cells alone" comment) has NO per-period target at
      // all. `resolveReviewTarget` then falls back to the row's single
      // `projected` (whole-period total) for EVERY period — fine on its own,
      // but `aggregateByType`'s Cumulative aggregation SUMS across periods, so
      // the same total gets counted once per period (e.g. a 70 target shown as
      // 70+70+70+70=280 across 4 quarters). Standalone/CumulativeTillEnd don't
      // need this: averaging recovers the original value, and "last filled"
      // just takes one of them — only the SUM aggregation double(quadruple)-
      // counts. Split the fallback evenly across periods so the sum recovers
      // the original `projected` total, mirroring the same flat n-way split
      // KPI targets already use when no per-week breakdown is configured
      // (see `computeQtd`'s `flat = totalTarget / weeksPerQuarter`).
      const categoryType = meta?.categoryType ?? "Cumulative";
      const periodCount = periodKeys.length || 1;
      for (const pKey of periodKeys) {
        const entry = entryMap.get(`${idx}:${pKey}`);
        // Category-aware guard: review entries are keyed by rowIndex only, so a
        // saved entry survives when the user changes that Action (QTR) row to a
        // DIFFERENT category. Achieved/Comment/Last-Year belong to the old KPI
        // and must NOT carry over — surface them only when the stored category
        // still matches the current source category. Target is always resolved
        // live from the plan below, so it reflects the new category regardless.
        // A blank stored category (legacy rows) is treated as a match so we
        // never wipe pre-existing data that predates category stamping.
        const isStaleEntry =
          !!entry &&
          !!entry.category &&
          entry.category.trim() !== "" &&
          entry.category !== sourceCategory;
        // Target: use per-period value from OPSP, fall back to projected.
        // Both are stored as scaled strings (e.g. "10 K") — resolve with category meta.
        const planTarget = resolveStoredValue(row[pKey] as string, meta);
        const projected = resolveStoredValue(row.projected as string, meta);
        // Cumulative-only: evenly split the whole-period `projected` fallback
        // across periods so the SUM lands back on the original total instead
        // of multiplying it by `periodCount` (see comment above the loop).
        const projectedFallback =
          categoryType === "Cumulative" && projected != null
            ? projected / periodCount
            : projected;

        periods[pKey] = {
          // Live OPSP target wins; the saved review snapshot is only a fallback
          // so a post-finalize edit isn't masked by a stale snapshot.
          target: resolveReviewTarget(
            planTarget,
            projectedFallback,
            entry?.targetValue != null ? Number(entry.targetValue) : null,
          ),
          achieved: !isStaleEntry && entry?.achievedValue != null ? Number(entry.achievedValue) : null,
          gap: null,
          achievedPct: null,
          comment: !isStaleEntry ? entry?.comment ?? null : null,
          // Populated by loadLastYearAchieved (auto) and the manual-override
          // pass below. `null` here means no source has filled it yet.
          lastYearAchieved: null,
          lastYearSamePeriodSource: "none",
        };
      }

      return {
        rowIndex: idx,
        category: (row.category as string) || "",
        projected: row.projected as string || "",
        // Surface categoryType so the client can render the "Category Type"
        // column and pick the right footer label (Cumulative / Exit / Average).
        categoryType: meta?.categoryType ?? "Cumulative",
        // Surface dataType + currency so the client can prefix Currency rows
        // with the right symbol ($1,000,000 / ₹10,00,000) in the review table.
        dataType: meta?.dataType ?? "Number",
        currency: meta?.currency ?? null,
        periods,
      };
    });

    // 6. Auto-populate achieved/gap/achievedPct from child horizons
    if (horizon === "yearly" || horizon === "3to5year") {
      await populateCascadeData(orgId, ownerId, year, rows, horizon, opsp.targetYears, catMetaMap);
    }

    // 6b. Attach Last Year Same Period — used by the client's "Year Growth"
    // column. For each row+period we look at the analogous period one year
    // prior. Rows that find a value are marked source = "auto" (drawer
    // disables the field). Rows with no auto value fall through to the
    // manual-override pass below.
    await loadLastYearAchieved(orgId, ownerId, year, quarter, horizon, rows, opsp.targetYears, catMetaMap);

    // 6c. Manual-override pass — for rows where no auto value was found,
    // surface the user-entered `lastYearSamePeriod` from the current
    // OPSPReviewEntry (if set). Auto always wins, so we only consult the
    // manual value when source is still "none".
    for (const row of rows) {
      for (const pKey of Object.keys(row.periods)) {
        const p = row.periods[pKey];
        if (p.lastYearSamePeriodSource === "auto") continue;
        const entry = entryMap.get(`${row.rowIndex}:${pKey}`);
        // Skip a stale entry whose stored category no longer matches this row's
        // current category (see the category-aware guard in the merge above).
        const isStaleEntry =
          !!entry &&
          !!entry.category &&
          entry.category.trim() !== "" &&
          entry.category !== row.category;
        if (!isStaleEntry && entry?.lastYearSamePeriod != null) {
          p.lastYearAchieved = Number(entry.lastYearSamePeriod);
          p.lastYearSamePeriodSource = "manual";
        }
      }
    }

    // 7. Get tenant fiscal config
    const org = await db.org.findUnique({
      where: { id: orgId },
      select: { fiscalYearStart: true },
    });

    // 8. Extract secondary rows (rocks / keyInitiatives / keyThrusts)
    const rawSecondaryRows = extractSecondaryRows(opsp, horizon);

    // 9. Resolve owner IDs to names for secondary rows
    const ownerIds = [...new Set(rawSecondaryRows.map((r) => r.owner).filter(Boolean))];
    const ownerUsers = ownerIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const ownerMap = new Map(ownerUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    // 10. Load saved secondary review entries (status + comment)
    const secondaryEntries = await db.oPSPReviewEntry.findMany({
      where: { orgId, opspId: opsp.id, horizon, period: "secondary" },
      select: { rowIndex: true, comment: true },
    });
    const secondaryEntryMap = new Map<number, { status: string | null; text: string }>();
    for (const e of secondaryEntries) {
      try {
        const parsed = JSON.parse(e.comment ?? "{}");
        secondaryEntryMap.set(e.rowIndex, { status: parsed.status ?? null, text: parsed.text ?? "" });
      } catch {
        secondaryEntryMap.set(e.rowIndex, { status: null, text: e.comment ?? "" });
      }
    }

    const secondaryRows = rawSecondaryRows.map((r, i) => {
      const saved = secondaryEntryMap.get(i);
      return {
        desc: r.desc,
        owner: r.owner,
        ownerName: ownerMap.get(r.owner) ?? r.owner,
        status: saved?.status ?? null,
        comment: saved?.text ?? "",
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        opspId: opsp.id,
        opspStatus: opsp.status,
        targetYears: opsp.targetYears,
        rows,
        secondaryRows,
        year,
        quarter,
        horizon,
        fiscalYearStart: org?.fiscalYearStart ?? 1,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load OPSP review";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/**
 * POST /api/opsp/review
 *
 * Saves review entries for one category row (all periods at once).
 * Called when the user clicks "Save" in the review modal. Requires
 * OPSP.Review:update.
 */
export const POST = reviewAuth.update(async ({ orgId, userId }, req) => {
  try {
    const parsed = opspReviewSaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed, "Invalid review data");

    const { year, quarter, horizon, rowIndex, category, entries } = parsed.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    // OPSP is org-shared: review entries attach to the canonical owner's OPSP
    // so every reviewer writes to the same plan. The entry's own `userId`
    // metadata + the audit `actorId` keep the acting reviewer below.
    const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

    // 1. Verify the org's OPSP exists for this period
    const opsp = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId: ownerId, year: yearNum, quarter },
      },
      select: { id: true, status: true },
    });

    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    // 1b. Once the review is SUBMITTED (`reviewed`), Review data locks for
    // everyone except OPSP.History.EditFinalize holders — server-side mirror
    // of the client `canEditReviewedData` predicate, so a direct API call
    // can't bypass the UI lock. Unlike the OPSP Form's own finalize-lock
    // (app/api/opsp/route.ts), EditFinalize DOES still grant access here —
    // Review data (actuals) may legitimately need a correction post-submission,
    // whereas the Form's plan data is meant to be immutable once reviewed.
    if (opsp.status === "reviewed") {
      const canEditAfterFinalize = await userCan(userId, orgId, "OPSP.History.EditFinalize", "update");
      if (!canEditAfterFinalize) {
        return forbidden("This OPSP's review has been submitted. Editing requires the 'Edit after Finalize' permission.");
      }
    }

    // 2a. Snapshot pre-update state for the audit log. We flatten to
    // per-cell keys (e.g. `m1.target`, `m1.achieved`) so the drawer renders
    // one diff row per changed cell instead of a JSON blob. Field labels for
    // these keys live in OPSP_FIELD_LABELS (lib/utils/auditLog.ts).
    const prevEntries = await db.oPSPReviewEntry.findMany({
      where: {
        orgId,
        opspId: opsp.id,
        horizon,
        rowIndex,
        period: { in: entries.map((e) => e.period) },
      },
      select: {
        period: true,
        targetValue: true,
        achievedValue: true,
        lastYearSamePeriod: true,
        comment: true,
      },
    });
    const prevByPeriod = Object.fromEntries(
      prevEntries.map((e) => [e.period, e]),
    );
    const oldSnapshot: Record<string, unknown> = {};
    const newSnapshot: Record<string, unknown> = {};
    for (const e of entries) {
      const p = prevByPeriod[e.period];
      // Only snapshot keys the caller is actually changing — `undefined`
      // means "keep existing value", so it shouldn't appear in the diff.
      if (e.targetValue !== undefined) {
        oldSnapshot[`${e.period}.target`] = p?.targetValue != null ? Number(p.targetValue) : null;
        newSnapshot[`${e.period}.target`] = e.targetValue ?? null;
      }
      if (e.achievedValue !== undefined) {
        oldSnapshot[`${e.period}.achieved`] = p?.achievedValue != null ? Number(p.achievedValue) : null;
        newSnapshot[`${e.period}.achieved`] = e.achievedValue ?? null;
      }
      if (e.lastYearSamePeriod !== undefined) {
        oldSnapshot[`${e.period}.lastYear`] = p?.lastYearSamePeriod != null ? Number(p.lastYearSamePeriod) : null;
        newSnapshot[`${e.period}.lastYear`] = e.lastYearSamePeriod ?? null;
      }
      if (e.comment !== undefined) {
        oldSnapshot[`${e.period}.comment`] = p?.comment ?? null;
        newSnapshot[`${e.period}.comment`] = e.comment ?? null;
      }
    }

    // 2b. Upsert each entry
    const savedEntries = await Promise.all(
      entries.map((entry) =>
        db.oPSPReviewEntry.upsert({
          where: {
            orgId_opspId_horizon_rowIndex_period: {
              orgId,
              opspId: opsp.id,
              horizon,
              rowIndex,
              period: entry.period,
            },
          },
          update: {
            // Refresh the stored category to the current one. Entries are keyed
            // by rowIndex only, so without this a row that changed category
            // would keep its old stored category and the GET category-aware
            // guard would then hide the values the user is saving right now.
            category,
            // `?? undefined` would silently drop an explicit `null` (i.e. a
            // user clearing the field). Prisma needs `null` passed through
            // to actually unset the column.
            targetValue: entry.targetValue === undefined ? undefined : entry.targetValue,
            achievedValue: entry.achievedValue === undefined ? undefined : entry.achievedValue,
            lastYearSamePeriod:
              entry.lastYearSamePeriod === undefined ? undefined : entry.lastYearSamePeriod,
            comment: entry.comment === undefined ? undefined : entry.comment,
            updatedBy: userId,
          },
          create: {
            orgId,
            opspId: opsp.id,
            userId,
            horizon,
            rowIndex,
            category,
            period: entry.period,
            targetValue: entry.targetValue ?? null,
            achievedValue: entry.achievedValue ?? null,
            lastYearSamePeriod: entry.lastYearSamePeriod ?? null,
            comment: entry.comment ?? null,
            updatedBy: userId,
          },
        }),
      ),
    );

    // 3. Audit log — includes old/new snapshots so the audit-log drawer can
    // render field-level diffs. Existing rows that pre-date this enrichment
    // still render correctly (fmtFriendlyAuditEntry handles missing values).
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Review",
      entityId: opsp.id,
      oldValues: oldSnapshot,
      newValues: newSnapshot,
      changes: entries.map((e) => `${horizon}:${category}:${e.period}`),
      reason: `OPSP Review (${horizon}|rowIndex=${rowIndex}): ${category}`,
    });

    return NextResponse.json({
      success: true,
      data: savedEntries.map((e) => ({
        period: e.period,
        targetValue: e.targetValue ? Number(e.targetValue) : null,
        achievedValue: e.achievedValue ? Number(e.achievedValue) : null,
        comment: e.comment,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save review data";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/* ── Helpers ── */

/**
 * Extract the source data rows from OPSPData based on the horizon.
 * Returns the JSON array (actionsQtr, goalRows, or targetRows).
 */
function extractSourceRows(
  opsp: { actionsQtr: unknown; goalRows: unknown; targetRows: unknown },
  horizon: string,
): Record<string, unknown>[] {
  let raw: unknown;
  if (horizon === "quarter") raw = opsp.actionsQtr;
  else if (horizon === "yearly") raw = opsp.goalRows;
  else raw = opsp.targetRows;

  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is Record<string, unknown> =>
      r != null && typeof r === "object" && typeof (r as Record<string, unknown>).category === "string",
  );
}

/**
 * Returns the period keys for a given horizon.
 */
function getPeriodKeys(horizon: string, targetYears: number = 5): string[] {
  if (horizon === "quarter") return ["m1", "m2", "m3"];
  if (horizon === "yearly") return ["q1", "q2", "q3", "q4"];
  // 3-5 year: return y1..yN based on targetYears
  return Array.from({ length: targetYears }, (_, i) => `y${i + 1}`);
}

/* ── Cascade: auto-populate achieved from child horizon ── */

/** Σ of all targets / achieveds. Used by plain Cumulative. */
function calculateCumulativeTotal(
  periods: { target: number; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  const filled = periods.filter((p) => p.achieved != null);
  const sumT = periods.reduce((a, b) => a + b.target, 0);
  const sumA = filled.reduce((a, b) => a + (b.achieved ?? 0), 0);
  return { target: sumT, achieved: sumA, hasAchieved: filled.length > 0 };
}

/**
 * For `CumulativeTillEnd`, each per-period value is ALREADY a running
 * cumulative total — e.g. m1=3 / m2=6 / m3=9 means "by end of M3 we expect 9",
 * not "we expect 3+6+9 = 18". Summing would double-count, so the Exit value is
 * simply the last period's target and the latest filled achieved (falling
 * back to earlier periods if the final period hasn't been reported yet).
 */
function calculateCumulativeTillEndExit(
  periods: { target: number; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  if (periods.length === 0) return { target: 0, achieved: 0, hasAchieved: false };
  const target = periods[periods.length - 1]?.target ?? 0;
  let achieved = 0;
  let hasAchieved = false;
  for (let i = periods.length - 1; i >= 0; i--) {
    if (periods[i].achieved != null) {
      achieved = periods[i].achieved!;
      hasAchieved = true;
      break;
    }
  }
  return { target, achieved, hasAchieved };
}

/** (Σ target) / N and (Σ achieved) / N — fixed denominator = period count. */
function calculateStandaloneAverage(
  periods: { target: number; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  const filled = periods.filter((p) => p.achieved != null);
  const n = periods.length || 1;
  const sumT = periods.reduce((a, b) => a + b.target, 0);
  const sumA = filled.reduce((a, b) => a + (b.achieved ?? 0), 0);
  return { target: sumT / n, achieved: sumA / n, hasAchieved: filled.length > 0 };
}

/**
 * Aggregate per-period (target, achieved) pairs into a single value per
 * `categoryType`:
 *
 *   Cumulative         → SUM (e.g. m1+m2+m3, Q1+Q2+Q3+Q4, Y1+Y2+…)
 *   CumulativeTillEnd  → LAST-FILLED (per-period values already running totals)
 *   Standalone         → AVERAGE (with fixed denominator = period count)
 *
 * Used by the Yearly + 3-5yr cascade and by `buildTableRows` on the client.
 */
function aggregateByType(
  categoryType: string,
  periods: { target: number; achieved: number | null }[],
): { target: number; achieved: number; hasAchieved: boolean } {
  if (categoryType === "Standalone") return calculateStandaloneAverage(periods);
  if (categoryType === "CumulativeTillEnd") return calculateCumulativeTillEndExit(periods);
  return calculateCumulativeTotal(periods);
}

/**
 * Compute the quarter "footer" (cumulative / exit / average) achieved for a
 * given category from a quarter's OPSP review entries.
 */
async function getQuarterCumulativeForCategory(
  orgId: string,
  opspId: string,
  category: string,
  sourceRows: Record<string, unknown>[],
  catMetaMap?: CatMetaMap,
): Promise<{ target: number; achieved: number; gap: number; achievedPct: number; hasAchieved: boolean; sourceFound: boolean }> {
  // Find the actionsQtr rowIndex matching this category
  const rowIdx = sourceRows.findIndex(
    (r) => (r.category as string)?.toLowerCase() === category.toLowerCase(),
  );
  // `sourceFound: false` means this category was never configured in Quarterly
  // Actions at all — distinct from "configured but no achieved value entered
  // yet" (hasAchieved: false with sourceFound: true). The caller uses this to
  // decide whether Achieved should stay a read-only rollup-in-waiting or be
  // directly enterable (a category with no Quarterly counterpart has nothing
  // to ever roll up from).
  if (rowIdx < 0) return { target: 0, achieved: 0, gap: 0, achievedPct: 0, hasAchieved: false, sourceFound: false };
  const meta = catMetaMap?.get(category);
  const categoryType = meta?.categoryType ?? "Cumulative";

  const entries = await db.oPSPReviewEntry.findMany({
    where: {
      orgId,
      opspId,
      horizon: "quarter",
      rowIndex: rowIdx,
      period: { in: ["m1", "m2", "m3"] },
    },
    select: { period: true, targetValue: true, achievedValue: true },
  });

  // Build per-period (target, achieved) pairs in m1..m3 order, then let
  // aggregateByType collapse them to a single footer value.
  const periods = (["m1", "m2", "m3"] as const).map((pKey) => {
    const sourceTarget = resolveStoredValue(sourceRows[rowIdx][pKey] as string, meta);
    const entry = entries.find((e) => e.period === pKey);
    return {
      // Live OPSP target wins; the saved review snapshot is only a fallback.
      target:
        resolveReviewTarget(
          sourceTarget,
          null,
          entry?.targetValue != null ? Number(entry.targetValue) : null,
        ) ?? 0,
      achieved: entry?.achievedValue != null ? Number(entry.achievedValue) : null,
    };
  });

  const agg = aggregateByType(categoryType, periods);
  const rawGap = agg.target - agg.achieved;
  const gap = rawGap < 0 ? 0 : parseFloat(rawGap.toFixed(4));
  const achievedPct = agg.target > 0 ? parseFloat(((agg.achieved / agg.target) * 100).toFixed(1)) : 0;

  return { target: agg.target, achieved: agg.achieved, gap, achievedPct, hasAchieved: agg.hasAchieved, sourceFound: true };
}

/**
 * Populate yearly rows with quarter cumulative data, or 3-5yr rows with
 * yearly cumulative data. Mutates the `rows` array in-place.
 *
 * `userId` here is the canonical OPSP owner (OPSP is org-shared) — every
 * source-data lookup reads the org's plan, not the acting reviewer's copy.
 */
async function populateCascadeData(
  orgId: string,
  userId: string,
  year: number,
  rows: { rowIndex: number; category: string; categoryType: string; projected: string; periods: Record<string, { target: number | null; achieved: number | null; gap: number | null; achievedPct: number | null; comment: string | null; autoPopulated?: boolean; hasLowerHorizonSource?: boolean; lastYearAchieved: number | null; lastYearSamePeriodSource: "auto" | "manual" | "none" }> }[],
  horizon: string,
  targetYears: number,
  catMetaMap?: CatMetaMap,
) {
  if (horizon === "yearly") {
    // For each quarter period (q1-q4), find the matching quarter OPSP and compute cumulative
    const quarters = ["Q1", "Q2", "Q3", "Q4"];
    const periodKeys = ["q1", "q2", "q3", "q4"];

    // Load all 4 quarter OPSPs for this user+year. Accept BOTH "finalized"
    // and "reviewed" — "reviewed" is a strictly later state (it implies the
    // quarter was already finalized), and excluding it caused the Yearly
    // Achieved column to silently empty out the moment a quarter's review
    // was submitted.
    const quarterOpsps = await db.oPSPData.findMany({
      where: {
        orgId,
        userId,
        year,
        quarter: { in: quarters },
        status: { in: ["finalized", "reviewed"] },
      },
      select: { id: true, quarter: true, actionsQtr: true },
    });

    const opspByQuarter = new Map(quarterOpsps.map((o) => [o.quarter, o]));

    for (const row of rows) {
      if (!row.category.trim()) continue;

      for (let qi = 0; qi < 4; qi++) {
        const qOpsp = opspByQuarter.get(quarters[qi]);
        if (!qOpsp) continue;

        const sourceRows = extractSourceRows(
          { actionsQtr: qOpsp.actionsQtr, goalRows: null, targetRows: null },
          "quarter",
        );

        const cum = await getQuarterCumulativeForCategory(
          orgId,
          qOpsp.id,
          row.category,
          sourceRows,
          catMetaMap,
        );

        // Record whether this category is even configured in this quarter's
        // Actions AT ALL — independent of whether an achieved value has been
        // entered yet. Unlike `autoPopulated` (only set when there's a real
        // value to show), this must be set whenever a quarter OPSP exists for
        // the period, so the client can tell "waiting on quarterly data" apart
        // from "never tracked quarterly, enter it here instead".
        const period = row.periods[periodKeys[qi]];
        if (period) period.hasLowerHorizonSource = cum.sourceFound;

        if (cum.hasAchieved && period) {
          period.achieved = cum.achieved;
          period.gap = cum.gap;
          period.achievedPct = cum.achievedPct;
          period.autoPopulated = true;
        }
      }
    }
  } else if (horizon === "3to5year") {
    // For each year period (y1..yN), aggregate the four quarter footers per
    // the row's categoryType. Cumulative → sum, CumulativeTillEnd → last,
    // Standalone → average.
    const years = Array.from({ length: targetYears }, (_, i) => year + i);
    const periodKeys = Array.from({ length: targetYears }, (_, i) => `y${i + 1}`);

    for (const row of rows) {
      if (!row.category.trim()) continue;

      for (let yi = 0; yi < years.length; yi++) {
        const targetYear = years[yi];
        const quarters = ["Q1", "Q2", "Q3", "Q4"];

        // Load all quarter OPSPs for this year. Same status broadening as
        // the yearly branch above — accept "reviewed" alongside "finalized".
        const quarterOpsps = await db.oPSPData.findMany({
          where: {
            orgId,
            userId,
            year: targetYear,
            quarter: { in: quarters },
            status: { in: ["finalized", "reviewed"] },
          },
          select: { id: true, quarter: true, actionsQtr: true },
        });

        // Compute the four quarterly footers (in quarter order) and let
        // aggregateByType collapse them per the row's categoryType.
        const opspByQ = new Map(quarterOpsps.map((o) => [o.quarter, o]));
        const quartersInOrder = await Promise.all(
          quarters.map(async (q) => {
            const qOpsp = opspByQ.get(q);
            if (!qOpsp) return { target: 0, achieved: null as number | null, sourceFound: false };
            const sourceRows = extractSourceRows(
              { actionsQtr: qOpsp.actionsQtr, goalRows: null, targetRows: null },
              "quarter",
            );
            const cum = await getQuarterCumulativeForCategory(
              orgId,
              qOpsp.id,
              row.category,
              sourceRows,
              catMetaMap,
            );
            return {
              target: cum.target,
              achieved: cum.hasAchieved ? cum.achieved : null,
              sourceFound: cum.sourceFound,
            };
          }),
        );

        // Same "configured vs never tracked" distinction as the yearly branch
        // — true when this category exists in Quarterly Actions for ANY of
        // the year's 4 quarters, even if that quarter hasn't been reviewed yet.
        const hasLowerHorizonSource = quartersInOrder.some((q) => q.sourceFound);
        const yearPeriod = row.periods[periodKeys[yi]];
        if (yearPeriod) yearPeriod.hasLowerHorizonSource = hasLowerHorizonSource;

        const agg = aggregateByType(row.categoryType, quartersInOrder);

        if (agg.hasAchieved) {
          const rawGap = agg.target - agg.achieved;
          const yearGap = rawGap < 0 ? 0 : parseFloat(rawGap.toFixed(4));
          const yearPct = agg.target > 0 ? parseFloat(((agg.achieved / agg.target) * 100).toFixed(1)) : 0;

          const period = row.periods[periodKeys[yi]];
          if (period) {
            period.achieved = agg.achieved;
            period.gap = yearGap;
            period.achievedPct = yearPct;
            period.autoPopulated = true;
          }
        }
      }
    }
  }
}

/**
 * Populate each row's `lastYearAchieved` per period by looking at the same
 * period one year prior. Falls back to 0 when no prior-year data exists
 * ("first quarter → 0" per spec).
 *
 *   - Quarter tab    → Y-1 same-quarter OPSP's m-cell achievedValue
 *   - Yearly tab     → for each q-cell, aggregate Y-1's matching quarter's
 *                      m1/m2/m3 per the row's categoryType
 *   - 3-5yr tab      → for each y(i), look at (year+i)-1 and aggregate that
 *                      year's four quarter footers per the row's categoryType
 *
 * `userId` here is the canonical OPSP owner (OPSP is org-shared).
 */
async function loadLastYearAchieved(
  orgId: string,
  userId: string,
  year: number,
  quarter: string,
  horizon: string,
  rows: { rowIndex: number; category: string; categoryType: string; periods: Record<string, { lastYearAchieved: number | null; lastYearSamePeriodSource: "auto" | "manual" | "none" }> }[],
  targetYears: number,
  catMetaMap?: CatMetaMap,
) {
  if (horizon === "quarter") {
    // Y-1 same-quarter OPSP, per-m-cell achievedValue.
    const prior = await db.oPSPData.findUnique({
      where: { orgId_userId_year_quarter: { orgId, userId, year: year - 1, quarter } },
      select: { id: true, actionsQtr: true },
    });
    if (!prior) return; // already defaults to 0
    const priorSource = extractSourceRows({ actionsQtr: prior.actionsQtr, goalRows: null, targetRows: null }, "quarter");
    const entries = await db.oPSPReviewEntry.findMany({
      where: { orgId, opspId: prior.id, horizon: "quarter" },
      select: { rowIndex: true, period: true, achievedValue: true },
    });
    for (const row of rows) {
      const priorIdx = priorSource.findIndex(
        (r) => (r.category as string)?.toLowerCase() === row.category.toLowerCase(),
      );
      if (priorIdx < 0) continue;
      for (const pKey of ["m1", "m2", "m3"]) {
        const e = entries.find((x) => x.rowIndex === priorIdx && x.period === pKey);
        if (e?.achievedValue != null && row.periods[pKey]) {
          row.periods[pKey].lastYearAchieved = Number(e.achievedValue);
          row.periods[pKey].lastYearSamePeriodSource = "auto";
        }
      }
    }
    return;
  }

  if (horizon === "yearly") {
    // For each q1..q4, aggregate Y-1's matching quarter (m1+m2+m3) per type.
    const quarters = ["Q1", "Q2", "Q3", "Q4"] as const;
    const qKeys = ["q1", "q2", "q3", "q4"] as const;
    const priorOpsps = await db.oPSPData.findMany({
      where: { orgId, userId, year: year - 1, quarter: { in: [...quarters] } },
      select: { id: true, quarter: true, actionsQtr: true },
    });
    const priorByQ = new Map(priorOpsps.map((o) => [o.quarter, o]));
    for (const row of rows) {
      for (let i = 0; i < quarters.length; i++) {
        const q = quarters[i];
        const opsp = priorByQ.get(q);
        if (!opsp) continue;
        const src = extractSourceRows({ actionsQtr: opsp.actionsQtr, goalRows: null, targetRows: null }, "quarter");
        const cum = await getQuarterCumulativeForCategory(orgId, opsp.id, row.category, src, catMetaMap);
        if (cum.hasAchieved && row.periods[qKeys[i]]) {
          row.periods[qKeys[i]].lastYearAchieved = cum.achieved;
          row.periods[qKeys[i]].lastYearSamePeriodSource = "auto";
        }
      }
    }
    return;
  }

  if (horizon === "3to5year") {
    // For each y(i) cell, aggregate prior-year's four quarter footers per type.
    const yKeys = Array.from({ length: targetYears }, (_, i) => `y${i + 1}`);
    for (let yi = 0; yi < targetYears; yi++) {
      const priorYear = year + yi - 1;
      const quarters = ["Q1", "Q2", "Q3", "Q4"];
      const opsps = await db.oPSPData.findMany({
        where: { orgId, userId, year: priorYear, quarter: { in: quarters } },
        select: { id: true, quarter: true, actionsQtr: true },
      });
      const opspByQ = new Map(opsps.map((o) => [o.quarter, o]));
      for (const row of rows) {
        const quartersInOrder = await Promise.all(
          quarters.map(async (q) => {
            const opsp = opspByQ.get(q);
            if (!opsp) return { target: 0, achieved: null as number | null };
            const src = extractSourceRows(
              { actionsQtr: opsp.actionsQtr, goalRows: null, targetRows: null },
              "quarter",
            );
            const cum = await getQuarterCumulativeForCategory(orgId, opsp.id, row.category, src, catMetaMap);
            return { target: cum.target, achieved: cum.hasAchieved ? cum.achieved : null };
          }),
        );
        const agg = aggregateByType(row.categoryType, quartersInOrder);
        if (agg.hasAchieved && row.periods[yKeys[yi]]) {
          row.periods[yKeys[yi]].lastYearAchieved = agg.achieved;
          row.periods[yKeys[yi]].lastYearSamePeriodSource = "auto";
        }
      }
    }
  }
}

/**
 * Extract the secondary data (rocks / keyInitiatives / keyThrusts)
 * from OPSPData based on the horizon.
 * Each returns [{desc, owner}] arrays.
 */
function extractSecondaryRows(
  opsp: { rocks: unknown; keyInitiatives: unknown; keyThrusts: unknown },
  horizon: string,
): { desc: string; owner: string }[] {
  let raw: unknown;
  if (horizon === "quarter") raw = opsp.rocks;
  else if (horizon === "yearly") raw = opsp.keyInitiatives;
  else raw = opsp.keyThrusts;

  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (r): r is { desc: string; owner: string } =>
      r != null && typeof r === "object" && typeof (r as Record<string, unknown>).desc === "string",
  );
}
