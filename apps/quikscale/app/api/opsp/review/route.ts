import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { opspReviewSaveSchema } from "@/lib/schemas/opspReviewSchema";

/**
 * GET /api/opsp/review?year=2026&quarter=Q1&horizon=quarter
 *
 * Loads the OPSP source rows (actions/goals/targets) for the current user
 * and merges in any saved review entries (achieved values).
 *
 * Admin-only — all OPSP Review access requires admin role.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { tenantId, userId } = auth;

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

    // 1. Load the OPSP for this user + fiscal period
    const opsp = await db.oPSPData.findUnique({
      where: {
        tenantId_userId_year_quarter: { tenantId, userId, year, quarter },
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
      where: { tenantId, opspId: opsp.id, horizon },
      select: {
        rowIndex: true,
        period: true,
        targetValue: true,
        achievedValue: true,
        comment: true,
        updatedAt: true,
      },
    });

    // 4. Build a lookup: entries keyed by `${rowIndex}:${period}`
    const entryMap = new Map<string, (typeof entries)[0]>();
    for (const e of entries) {
      entryMap.set(`${e.rowIndex}:${e.period}`, e);
    }

    // 5. Merge source rows with review data
    const periodKeys = getPeriodKeys(horizon, opsp.targetYears);
    const rows = sourceRows.map((row, idx) => {
      const periods: Record<string, {
        target: number | null;
        achieved: number | null;
        comment: string | null;
      }> = {};

      for (const pKey of periodKeys) {
        const entry = entryMap.get(`${idx}:${pKey}`);
        // Target: use per-period value from OPSP, fall back to projected
        const planTarget = parseFloat(row[pKey] as string) || null;
        const projected = parseFloat(row.projected as string) || null;

        periods[pKey] = {
          target: entry?.targetValue ? Number(entry.targetValue) : (planTarget ?? projected),
          achieved: entry?.achievedValue != null ? Number(entry.achievedValue) : null,
          comment: entry?.comment ?? null,
        };
      }

      return {
        rowIndex: idx,
        category: (row.category as string) || "",
        projected: row.projected as string || "",
        periods,
      };
    });

    // 6. Get tenant fiscal config
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { fiscalYearStart: true },
    });

    // 7. Extract secondary rows (rocks / keyInitiatives / keyThrusts)
    const rawSecondaryRows = extractSecondaryRows(opsp, horizon);

    // 8. Resolve owner IDs to names for secondary rows
    const ownerIds = [...new Set(rawSecondaryRows.map((r) => r.owner).filter(Boolean))];
    const ownerUsers = ownerIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const ownerMap = new Map(ownerUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    // 9. Load saved secondary review entries (status + comment)
    const secondaryEntries = await db.oPSPReviewEntry.findMany({
      where: { tenantId, opspId: opsp.id, horizon, period: "secondary" },
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
        fiscalYearStart: tenant?.fiscalYearStart ?? 1,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load OPSP review";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/opsp/review
 *
 * Saves review entries for one category row (all periods at once).
 * Called when the user clicks "Save" in the review modal.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { tenantId, userId } = auth;

    const parsed = opspReviewSaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed, "Invalid review data");

    const { year, quarter, horizon, rowIndex, category, entries } = parsed.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    // 1. Verify OPSP exists
    const opsp = await db.oPSPData.findUnique({
      where: {
        tenantId_userId_year_quarter: { tenantId, userId, year: yearNum, quarter },
      },
      select: { id: true },
    });

    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    // 2. Upsert each entry
    const savedEntries = await Promise.all(
      entries.map((entry) =>
        db.oPSPReviewEntry.upsert({
          where: {
            tenantId_opspId_horizon_rowIndex_period: {
              tenantId,
              opspId: opsp.id,
              horizon,
              rowIndex,
              period: entry.period,
            },
          },
          update: {
            targetValue: entry.targetValue ?? undefined,
            achievedValue: entry.achievedValue ?? undefined,
            comment: entry.comment ?? undefined,
            updatedBy: userId,
          },
          create: {
            tenantId,
            opspId: opsp.id,
            userId,
            horizon,
            rowIndex,
            category,
            period: entry.period,
            targetValue: entry.targetValue ?? undefined,
            achievedValue: entry.achievedValue ?? undefined,
            comment: entry.comment ?? undefined,
            updatedBy: userId,
          },
        }),
      ),
    );

    // 3. Audit log
    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Review",
      entityId: opsp.id,
      changes: entries.map((e) => `${horizon}:${category}:${e.period}`),
      reason: `OPSP Review: ${horizon} ${category} row ${rowIndex}`,
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
}

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
