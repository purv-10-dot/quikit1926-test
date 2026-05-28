import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * OPSP Critical Hash Review API — handles the top-level "Critical Hash
 * Review" tab on the review screen.
 *
 * Coexists with the existing primary/secondary review routes; uses the SAME
 * `OPSPReviewEntry` table with a sentinel `horizon = "critical"`.
 *
 * Encoding:
 *   - `horizon`     = "critical"
 *   - `rowIndex`    = 0 (sentinel — there is ONE entry per card; the tier is
 *                     derived live by `resolveCritTier()` from the card's 4
 *                     projected values rather than persisted as separate rows)
 *   - `period`      = "<module>:<cardType>" where
 *                       module    ∈ { "actions", "year", "people" }
 *                       cardType  ∈ { "critical", "balancing" }
 *   - `category`    = the CritCard title (denormalised; for audit)
 *   - `targetValue` = unused (kept null — projections live on OPSPData)
 *   - `achievedValue` = manager-entered numeric Achieved
 *   - `comment`     = manager's plain-text comment (NOT JSON-wrapped)
 *
 * Unique key (orgId, opspId, "critical", rowIndex=0, period) tops out at
 * 6 rows per OPSP (3 modules × 2 cardTypes).
 */

/* ────────────────────────────── types ────────────────────────────── */

type Module = "actions" | "year" | "people";
type CardType = "critical" | "balancing";

interface CritCardShape {
  title: string;
  bullets: string[];
}

// Module → OPSPData column mapping:
//   year    → criticalNumGoals    / balancingCritNumGoals       (tab "Year")
//   actions → criticalNumProcess  / balancingCritNumProcess     (tab "Quarter")
//   people  → criticalNumAcct     / balancingCritNumAcct        (tab "Individual")

const MODULES: Module[] = ["actions", "year", "people"];
const CARD_TYPES: CardType[] = ["critical", "balancing"];

/** Coerce an unknown JSON blob to a safe CritCard shape. Bullets are always
 *  returned as strings (the UI parses them numerically via `toNum`). */
function normalizeCritCard(raw: unknown): CritCardShape {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title : "";
    const bullets = Array.isArray(o.bullets)
      ? o.bullets.map((b) =>
          b == null ? "" : typeof b === "string" ? b : String(b),
        )
      : [];
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

    const reviewRows = await db.oPSPReviewEntry.findMany({
      where: { orgId, opspId: opsp.id, horizon: "critical" },
      select: { period: true, achievedValue: true, comment: true },
    });

    const entries: Record<string, { achievedValue: number | null; comment: string | null }> = {};
    for (const r of reviewRows) {
      // period = "<module>:<cardType>" — one row per card.
      entries[r.period] = {
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
 *   category:      string,          (the CritCard title, for audit)
 *   achievedValue: number | null,
 *   comment:       string | null,
 * }
 *
 * Upserts a single OPSPReviewEntry per (module, cardType). Achieved +
 * Comment are saved together.
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

    // Snapshot pre-update state for the audit-log drawer to diff against.
    const prev = await db.oPSPReviewEntry.findUnique({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
          opspId: opsp.id,
          horizon: "critical",
          rowIndex: 0,
          period,
        },
      },
      select: { achievedValue: true, comment: true, category: true },
    });
    const oldSnapshot = {
      module: moduleKey,
      cardType,
      category: prev?.category ?? null,
      achievedValue: prev?.achievedValue != null ? Number(prev.achievedValue) : null,
      comment: prev?.comment ?? null,
    };
    const newSnapshot = {
      module: moduleKey,
      cardType,
      category,
      achievedValue,
      comment,
    };

    const saved = await db.oPSPReviewEntry.upsert({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
          opspId: opsp.id,
          horizon: "critical",
          rowIndex: 0,
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
        rowIndex: 0,
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
      entityType: "Review",
      entityId: opsp.id,
      oldValues: oldSnapshot,
      newValues: newSnapshot,
      changes: [`critical:${moduleKey}:${cardType}`],
      reason: `OPSP Critical (${moduleKey}:${cardType}): ${category}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        module: moduleKey,
        cardType,
        achievedValue: saved.achievedValue != null ? Number(saved.achievedValue) : null,
        comment: saved.comment ?? null,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save critical review";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
