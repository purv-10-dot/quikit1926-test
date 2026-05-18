import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * OPSP Critical Review API — handles the new top-level "Critical Review" tab
 * on the review screen.
 *
 * Coexists with the existing primary/secondary review routes; uses the SAME
 * `OPSPReviewEntry` table with a new sentinel `horizon = "critical"`.
 *
 * Encoding (per the approved plan):
 *   - `horizon`   = "critical"
 *   - `rowIndex`  = bullet index 0..3 (Green / Light Green / Yellow / Red)
 *   - `period`    = "<module>:<cardType>" where
 *                     module    ∈ { "actions", "year", "people" }
 *                     cardType  ∈ { "critical", "balancing" }
 *   - `category`  = the CritCard title (denormalised; for audit)
 *   - `targetValue` = parsed numeric Projected when bullet is numeric
 *   - `achievedValue` = manager-entered numeric Achieved
 *   - `comment`     = manager's plain-text comment (NOT JSON-wrapped)
 *
 * Unique key (orgId, opspId, "critical", rowIndex, period) tops out at
 * 24 rows per OPSP (4 bullets × 3 modules × 2 cardTypes).
 */

/* ────────────────────────────── types ────────────────────────────── */

type Module = "actions" | "year" | "people";
type CardType = "critical" | "balancing";

interface CritCardShape {
  title: string;
  bullets: string[];
}

// Module → OPSPData column mapping (documentation):
//   actions → criticalNumProcess  / balancingCritNumProcess
//   year    → criticalNumGoals    / balancingCritNumGoals
//   people  → criticalNumAcct     / balancingCritNumAcct

const MODULES: Module[] = ["actions", "year", "people"];
const CARD_TYPES: CardType[] = ["critical", "balancing"];

/** Coerce an unknown JSON blob to a safe CritCard shape. */
function normalizeCritCard(raw: unknown): CritCardShape {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : "";
    const bullets = Array.isArray(o.bullets)
      ? o.bullets.map((b) => (typeof b === "string" ? b : ""))
      : [];
    // Always pad to exactly 4 bullets so the UI can render 4 rows.
    while (bullets.length < 4) bullets.push("");
    return { title, bullets: bullets.slice(0, 4) };
  }
  return { title: "", bullets: ["", "", "", ""] };
}

/* ─────────────────────────────── GET ─────────────────────────────── */

/**
 * GET /api/opsp/review/critical?year=&quarter=
 *
 * Returns all 6 CritCards (3 modules × 2 cardTypes) + saved review entries
 * for the (year, quarter) OPSP.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth;
    const blocked = await gateModuleApi("quikscale", "opsp.review", orgId);
    if (blocked) return blocked;

    const { searchParams } = req.nextUrl;
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const quarter = searchParams.get("quarter") ?? "Q1";

    const opsp = await db.oPSPData.findUnique({
      where: { orgId_userId_year_quarter: { orgId, userId, year, quarter } },
      select: {
        id: true,
        status: true,
        criticalNumProcess: true,
        balancingCritNumProcess: true,
        criticalNumGoals: true,
        balancingCritNumGoals: true,
        criticalNumAcct: true,
        balancingCritNumAcct: true,
      },
    });

    if (!opsp) {
      return NextResponse.json({
        success: true,
        data: {
          opspId: null,
          opspStatus: null,
          modules: emptyModules(),
          entries: {},
          year,
          quarter,
        },
      });
    }

    // Build the {module: {critical, balancing}} map by normalising each JSON column.
    const modules = {
      actions: {
        critical:  normalizeCritCard(opsp.criticalNumProcess),
        balancing: normalizeCritCard(opsp.balancingCritNumProcess),
      },
      year: {
        critical:  normalizeCritCard(opsp.criticalNumGoals),
        balancing: normalizeCritCard(opsp.balancingCritNumGoals),
      },
      people: {
        critical:  normalizeCritCard(opsp.criticalNumAcct),
        balancing: normalizeCritCard(opsp.balancingCritNumAcct),
      },
    };

    // Saved review rows for horizon="critical".
    const reviewRows = await db.oPSPReviewEntry.findMany({
      where: { orgId, opspId: opsp.id, horizon: "critical" },
      select: { rowIndex: true, period: true, achievedValue: true, comment: true },
    });

    const entries: Record<string, { achievedValue: number | null; comment: string | null }> = {};
    for (const r of reviewRows) {
      // period = "<module>:<cardType>" → join with rowIndex for the lookup key
      entries[`${r.period}:${r.rowIndex}`] = {
        achievedValue: r.achievedValue != null ? Number(r.achievedValue) : null,
        comment: r.comment ?? null,
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        opspId: opsp.id,
        opspStatus: opsp.status,
        modules,
        entries,
        year,
        quarter,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load critical review data";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function emptyModules() {
  const empty: CritCardShape = { title: "", bullets: ["", "", "", ""] };
  return {
    actions: { critical: empty, balancing: empty },
    year:    { critical: empty, balancing: empty },
    people:  { critical: empty, balancing: empty },
  };
}

/* ─────────────────────────────── POST ─────────────────────────────── */

/**
 * POST /api/opsp/review/critical
 *
 * Body: {
 *   year, quarter,
 *   module:        "actions" | "year" | "people",
 *   cardType:      "critical" | "balancing",
 *   bulletIndex:   0..3,
 *   category:      string,          (the CritCard title, for audit)
 *   achievedValue: number | null,
 *   comment:       string | null,
 * }
 *
 * Upserts a single OPSPReviewEntry. Achieved + Comment are saved together
 * (the client batches them per-row on input blur).
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth;
    const blocked = await gateModuleApi("quikscale", "opsp.review", orgId);
    if (blocked) return blocked;

    const body = await req.json();
    const year = typeof body.year === "number" ? body.year : parseInt(body.year);
    const quarter = String(body.quarter ?? "");
    const moduleKey = String(body.module ?? "");
    const cardType = String(body.cardType ?? "");
    const bulletIndex = Number(body.bulletIndex);
    const category = typeof body.category === "string" ? body.category : "";
    const achievedValue =
      body.achievedValue == null || body.achievedValue === ""
        ? null
        : Number(body.achievedValue);
    const comment =
      body.comment == null ? null : String(body.comment);

    // ── Validate enums + ranges ──
    if (!Number.isFinite(year)) {
      return NextResponse.json({ success: false, error: "Invalid year" }, { status: 400 });
    }
    if (!["Q1", "Q2", "Q3", "Q4"].includes(quarter)) {
      return NextResponse.json({ success: false, error: "Invalid quarter" }, { status: 400 });
    }
    if (!MODULES.includes(moduleKey as Module)) {
      return NextResponse.json({ success: false, error: "Invalid module" }, { status: 400 });
    }
    if (!CARD_TYPES.includes(cardType as CardType)) {
      return NextResponse.json({ success: false, error: "Invalid cardType" }, { status: 400 });
    }
    if (!Number.isInteger(bulletIndex) || bulletIndex < 0 || bulletIndex > 3) {
      return NextResponse.json({ success: false, error: "Invalid bulletIndex (must be 0..3)" }, { status: 400 });
    }
    if (achievedValue !== null && !Number.isFinite(achievedValue)) {
      return NextResponse.json({ success: false, error: "Invalid achievedValue" }, { status: 400 });
    }

    const opsp = await db.oPSPData.findUnique({
      where: { orgId_userId_year_quarter: { orgId, userId, year, quarter } },
      select: { id: true },
    });
    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    const period = `${moduleKey}:${cardType}`;

    const saved = await db.oPSPReviewEntry.upsert({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
          opspId: opsp.id,
          horizon: "critical",
          rowIndex: bulletIndex,
          period,
        },
      },
      update: {
        category,
        achievedValue: achievedValue ?? undefined,
        comment: comment ?? undefined,
        updatedBy: userId,
      },
      create: {
        orgId,
        opspId: opsp.id,
        userId,
        horizon: "critical",
        rowIndex: bulletIndex,
        category,
        period,
        achievedValue: achievedValue ?? undefined,
        comment: comment ?? undefined,
        updatedBy: userId,
      },
    });

    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      // "Review" entity type already covers the existing primary/secondary
      // review writes. Critical Review entries share that bucket; the
      // `changes` + `reason` fields below disambiguate.
      entityType: "Review",
      entityId: opsp.id,
      changes: [`critical:${moduleKey}:${cardType}:bullet${bulletIndex}`],
      reason: `OPSP Critical Review: ${moduleKey} ${cardType} bullet ${bulletIndex} (${category})`,
    });

    return NextResponse.json({
      success: true,
      data: {
        module: moduleKey,
        cardType,
        bulletIndex,
        achievedValue: saved.achievedValue != null ? Number(saved.achievedValue) : null,
        comment: saved.comment ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save critical review";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
