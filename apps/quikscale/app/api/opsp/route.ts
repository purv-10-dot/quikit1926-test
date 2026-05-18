import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { opspUpsertSchema, opspFinalizeSchema } from "@/lib/schemas/opspSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { resolveFiscalYearStart } from "@/lib/api/fiscalYearStart";
const auth = withOrgAuthForResource("opsp.create", "OPSP.Create");

/**
 * Map a target (year, quarter) to its immediate predecessor.
 *   Q2/Q3/Q4 → same year, one quarter back
 *   Q1       → previous year's Q4 (this is a "fiscal year boundary" jump
 *              — see CROSS_YEAR_CLEAR_FIELDS below)
 * Returns null if the target isn't a recognised quarter literal.
 */
function priorQuarterOf(year: number, quarter: string): { year: number; quarter: string } | null {
  switch (quarter) {
    case "Q2": return { year, quarter: "Q1" };
    case "Q3": return { year, quarter: "Q2" };
    case "Q4": return { year, quarter: "Q3" };
    case "Q1": return { year: year - 1, quarter: "Q4" };
    default:   return null;
  }
}

/**
 * Fields cleared when inheriting *within the same fiscal year* (Q1→Q2,
 * Q2→Q3, Q3→Q4). Only the quarterly-specific surfaces start empty;
 * everything strategic (People, Targets, Goals, BHAG, Purpose, …) carries
 * forward unchanged.
 */
const QUARTERLY_FIELDS = [
  "actionsQtr",          // ACTIONS (QTR) rows
  "rocks",               // Rocks rows
  "quarterlyPriorities", // Your Quarterly Priorities rows
  "kpiAccountability",   // Your Accountability (KPIs) rows
] as const;

/**
 * Extra fields cleared when inheriting *across* a fiscal-year boundary
 * (Q4 year N → Q1 year N+1). Goals and Key Initiatives are annual data —
 * they belong to a specific 1-year horizon and reset every new FY. The
 * Targets (3-5 yr) horizon still carries forward; only the 1-yr surfaces
 * reset.
 */
const ANNUAL_FIELDS = [
  "goalRows",       // GOALS (1 YR.) rows
  "keyInitiatives", // Key Initiatives rows
] as const;

/**
 * Heuristic: a draft target record counts as a "stub" — i.e. opened but
 * never genuinely filled — if all the strategic rich-text fields are
 * blank-after-HTML-strip AND both Target/Goal arrays have no real entries.
 * In that case we treat it as "no record" and apply inheritance anyway,
 * so a user who accidentally created a Q2 stub by clicking around (and
 * autosave fired) still gets the prior-quarter prefill.
 */
function stripHtml(s: string | null | undefined): string {
  return (s ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
}

function hasContent(s: string | null | undefined): boolean {
  return stripHtml(s).length > 0;
}

function rowsHaveAnyContent(json: unknown, fields: readonly string[]): boolean {
  if (!Array.isArray(json)) return false;
  return json.some((r) => {
    if (!r || typeof r !== "object") return false;
    const obj = r as Record<string, unknown>;
    return fields.some((f) => typeof obj[f] === "string" && (obj[f] as string).trim().length > 0);
  });
}

function looksLikeStubDraft(data: {
  status: string;
  coreValues: string | null;
  purpose: string | null;
  bhag: string | null;
  brandPromise: string | null;
  profitPerX: string | null;
  targetRows: unknown;
  goalRows: unknown;
}): boolean {
  if (data.status !== "draft") return false;
  // If the user has typed even one strategic rich-text field, it's not a stub.
  if (hasContent(data.coreValues))   return false;
  if (hasContent(data.purpose))      return false;
  if (hasContent(data.bhag))         return false;
  if (hasContent(data.brandPromise)) return false;
  if (hasContent(data.profitPerX))   return false;
  // If they filled any Target / Goal row, it's not a stub.
  if (rowsHaveAnyContent(data.targetRows, ["category", "projected"])) return false;
  if (rowsHaveAnyContent(data.goalRows,   ["category", "projected"])) return false;
  return true;
}

/* ── GET: load OPSP data for current user + year + quarter ──
 *
 * When the target quarter has no record yet, look up the immediately prior
 * quarter; if THAT is `finalized` or `reviewed`, return its data with the
 * four quarterly-specific fields cleared. The synthesised payload is NOT
 * persisted server-side — the client's `skipNextSave` guard means autosave
 * only writes once the user actually edits something. So the prior data
 * is just the starting point for the new quarter, exactly like the user
 * asked: "bakhi sab Prefilled aana chaheya".
 */
export const GET = auth.view(async ({ orgId, userId }, req) => {
  const { searchParams } = req.nextUrl;
  const year    = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const quarter = searchParams.get("quarter") ?? "Q1";

  // Derived from configured Quarter Settings (Q1 start month), not the
  // stale Org.fiscalYearStart column — see lib/api/fiscalYearStart.ts.
  const fiscalYearStart = await resolveFiscalYearStart(orgId);

  const data = await db.oPSPData.findUnique({
    where: {
      orgId_userId_year_quarter: { orgId, userId, year, quarter },
    },
  });

  // If a real (non-stub) target record exists, return it as-is. Stubs fall
  // through to the inheritance path so a user who accidentally opened Q2
  // (autosave created an empty row) still gets the Q1 prefill on next load.
  if (data && !looksLikeStubDraft(data)) {
    return NextResponse.json({
      success: true,
      data,
      fiscalYearStart,
    });
  }

  // Try inheriting from the prior quarter.
  const prior = priorQuarterOf(year, quarter);
  if (prior) {
    const priorData = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId, year: prior.year, quarter: prior.quarter },
      },
    });
    if (priorData && (priorData.status === "finalized" || priorData.status === "reviewed")) {
      // Clone the prior record, strip identity/audit columns, reset status.
      const {
        id: _id,
        createdAt: _c, updatedAt: _u, createdBy: _cb, updatedBy: _ub,
        year: _y, quarter: _q, status: _s,
        ...carry
      } = priorData;
      void _id; void _c; void _u; void _cb; void _ub; void _y; void _q; void _s;

      // Year-boundary jump (Q4 → Q1 next FY) clears annual surfaces too —
      // Goals (1 YR.) and Key Initiatives reset because they belong to a
      // specific 1-year horizon.
      const isYearBoundary = quarter === "Q1";

      const inheritedData = {
        ...carry,
        year,
        quarter,
        status: "draft",
        // Always-clear quarterly-specific surfaces.
        actionsQtr: [],
        rocks: [],
        quarterlyPriorities: [],
        kpiAccountability: [],
        // Year-boundary extras.
        ...(isYearBoundary
          ? { goalRows: [], keyInitiatives: [] }
          : {}),
      };

      return NextResponse.json({
        success: true,
        data: inheritedData,
        inherited: {
          fromYear: prior.year,
          fromQuarter: prior.quarter,
          clearedFields: isYearBoundary
            ? [...QUARTERLY_FIELDS, ...ANNUAL_FIELDS]
            : QUARTERLY_FIELDS,
        },
        fiscalYearStart,
      });
    }
  }

  // No record, no eligible prior — fall back to existing default-form path.
  return NextResponse.json({
    success: true,
    data: null,
    fiscalYearStart,
  });
});

/* ── PUT: upsert (autosave) ── */
export const PUT = auth.update(async ({ orgId, userId }, req) => {
  const parsed = opspUpsertSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed, "Invalid OPSP payload");
  const { year, quarter, ...fields } = parsed.data;
  const yearNum = typeof year === "number" ? year : parseInt(year);

  // Status is a state machine: draft → finalized → reviewed (later states
  // are stronger locks). Autosave must never DOWNGRADE the server-side
  // status. The client's editable form can transiently hold a weaker value
  // (e.g. the very first autosave of a freshly-opened reviewed OPSP), so we
  // re-fetch the current status and drop the incoming `status` field
  // whenever it would move the record backwards.
  const STATUS_RANK: Record<string, number> = { draft: 0, finalized: 1, reviewed: 2 };
  if (typeof (fields as { status?: unknown }).status === "string") {
    const current = await db.oPSPData.findUnique({
      where: { orgId_userId_year_quarter: { orgId, userId, year: yearNum, quarter } },
      select: { status: true },
    });
    const incoming = (fields as { status: string }).status;
    const currentRank = STATUS_RANK[current?.status ?? "draft"] ?? 0;
    const incomingRank = STATUS_RANK[incoming] ?? 0;
    if (incomingRank < currentRank) {
      delete (fields as { status?: string }).status;
    }
  }

  const data = await db.oPSPData.upsert({
    where: {
      orgId_userId_year_quarter: {
        orgId,
        userId,
        year: yearNum,
        quarter,
      },
    },
    update: {
      ...fields,
      updatedBy: userId,
    },
    create: {
      orgId,
      userId,
      year: yearNum,
      quarter,
      createdBy: userId,
      ...fields,
    },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "OPSPData",
    entityId: data.id,
    changes: Object.keys(fields),
  });

  return NextResponse.json({ success: true, data, savedAt: new Date().toISOString() });
});

/* ── POST: finalize ── */
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const parsedFinalize = opspFinalizeSchema.safeParse(await req.json());
  if (!parsedFinalize.success) return validationError(parsedFinalize, "Invalid OPSP payload");
  const { year, quarter } = parsedFinalize.data;
  const yearNum = typeof year === "number" ? year : parseInt(year);

  // Only flip draft → finalized. A "reviewed" OPSP is a stronger lock and must
  // not be downgraded back to "finalized" if Finalize is clicked again.
  const result = await db.oPSPData.updateMany({
    where: {
      orgId,
      userId,
      year: yearNum,
      quarter,
      status: "draft",
    },
    data: { status: "finalized", updatedBy: userId },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "OPSPData",
    entityId: `${orgId}:${userId}:${yearNum}:${quarter}`,
    changes: ["status:finalized"],
    reason: "OPSP finalized",
  });

  return NextResponse.json({ success: true, data: { count: result.count } }, { status: 201 });
});
