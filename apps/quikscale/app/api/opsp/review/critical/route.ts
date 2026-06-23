import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { isOrgAdmin, forbidden } from "@/lib/api/permissions";
import { audit, requestContext } from "@/lib/audit";
import { resolveOpspOwnerOrSelf, resolveSectionUserId } from "@/lib/api/opspOwner";
import {
  criticalPeriod,
  CRITICAL_AUDIT_ENTITY_TYPE,
  MODULE_LABELS,
  CARD_LABELS,
} from "@/lib/audit/criticalFields";

// Gated on the standalone Critical-Review permission (view to read, update to
// save) + the opsp.review feature flag. Admins hold the grant via their role.
const critAuth = withOrgAuthForResource("opsp.review", "OPSP.Review.Critical");

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
export const GET = critAuth.view(async ({ orgId, userId }, req) => {
  try {
    const { searchParams } = req.nextUrl;
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
    const quarter = searchParams.get("quarter") ?? "Q1";
    const targetUserId = searchParams.get("targetUserId");

    // Year/Quarter (year/actions) modules are org-level strategic — admin-only.
    const isAdmin = await isOrgAdmin(userId, orgId);
    // Individual (people) is per-user: self, or another user with OPSP.EditUser.
    const subjectUserId = await resolveSectionUserId(orgId, userId, targetUserId);
    if (subjectUserId === null) {
      return forbidden("Viewing another user's critical review requires the 'Edit Any User's OPSP' permission.");
    }

    // Canonical owner anchors the org OPSP record (id/status + year/actions cards).
    const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

    const [opsp, subjectSection] = await Promise.all([
      db.oPSPData.findUnique({
        where: { orgId_userId_year_quarter: { orgId, userId: ownerId, year, quarter } },
        select: {
          id: true,
          status: true,
          criticalNumProcess: true,
          balancingCritNumProcess: true,
          criticalNumGoals: true,
          balancingCritNumGoals: true,
        },
      }),
      db.oPSPUserSection.findUnique({
        where: { orgId_userId_year_quarter: { orgId, userId: subjectUserId, year, quarter } },
        select: { criticalNumAcct: true, balancingCritNumAcct: true },
      }),
    ]);

    if (!opsp) {
      return NextResponse.json({
        success: true,
        data: { opspId: null, opspStatus: null, modules: emptyModules(), entries: {}, year, quarter },
      });
    }

    const empty: CritCardShape = { title: "", bullets: ["", "", "", ""] };
    const modules = {
      // Org-level strategic criticals — withheld from non-admins.
      actions: isAdmin
        ? { critical: normalizeCritCard(opsp.criticalNumProcess), balancing: normalizeCritCard(opsp.balancingCritNumProcess) }
        : { critical: empty, balancing: empty },
      year: isAdmin
        ? { critical: normalizeCritCard(opsp.criticalNumGoals), balancing: normalizeCritCard(opsp.balancingCritNumGoals) }
        : { critical: empty, balancing: empty },
      // Individual criticals come from the SUBJECT user's per-user section.
      people: {
        critical: normalizeCritCard(subjectSection?.criticalNumAcct),
        balancing: normalizeCritCard(subjectSection?.balancingCritNumAcct),
      },
    };

    const reviewRows = await db.oPSPReviewEntry.findMany({
      where: { orgId, opspId: opsp.id, horizon: "critical" },
      select: { period: true, achievedValue: true, comment: true },
    });

    // year/actions entries are keyed "<module>:<cardType>". `people` entries are
    // per-subject ("people:<cardType>:<subjectId>"); surface ONLY the active
    // subject's, re-keyed to "people:<cardType>" so the client lookup matches.
    const entries: Record<string, { achievedValue: number | null; comment: string | null }> = {};
    for (const r of reviewRows) {
      let key = r.period;
      if (r.period.startsWith("people:")) {
        const parts = r.period.split(":"); // people:<cardType>:<subjectId>
        if (parts[2] !== subjectUserId) continue; // another subject — skip
        key = `people:${parts[1]}`;
      }
      entries[key] = {
        achievedValue: r.achievedValue != null ? Number(r.achievedValue) : null,
        comment: r.comment ?? null,
      };
    }

    return NextResponse.json({
      success: true,
      data: { opspId: opsp.id, opspStatus: opsp.status, modules, entries, year, quarter, subjectUserId },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load critical review data";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

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
export const POST = critAuth.update(async ({ orgId, userId }, req) => {
  try {
    const body = await req.json();
    const year = typeof body.year === "number" ? body.year : parseInt(body.year);
    const quarter = String(body.quarter ?? "");
    const moduleKey = String(body.module ?? "");
    const cardType = String(body.cardType ?? "");
    const category = typeof body.category === "string" ? body.category : "";
    const targetUserId = body.targetUserId == null ? null : String(body.targetUserId);
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

    // Year/Quarter (year/actions) criticals are org-level — admin-only.
    const isAdmin = await isOrgAdmin(userId, orgId);
    if ((moduleKey === "year" || moduleKey === "actions") && !isAdmin) {
      return forbidden("Only an admin can review the org's Year/Quarter critical numbers.");
    }
    // Individual (people): self, or another user with OPSP.EditUser.
    const subjectUserId =
      moduleKey === "people"
        ? await resolveSectionUserId(orgId, userId, targetUserId)
        : userId;
    if (subjectUserId === null) {
      return forbidden("Editing another user's critical review requires the 'Edit Any User's OPSP' permission.");
    }

    // Critical-review entries attach to the canonical owner's OPSP record.
    const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

    const opsp = await db.oPSPData.findUnique({
      where: { orgId_userId_year_quarter: { orgId, userId: ownerId, year, quarter } },
      select: { id: true },
    });
    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    // Individual entries are keyed per-subject so each user owns their own row.
    const period = criticalPeriod(moduleKey, cardType, subjectUserId);

    // Snapshot pre-update state so the Change History panel can diff old → new.
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
    const isCreate = prev == null;
    // Only the three user-meaningful fields are diffed — Achieved, Comment, and
    // the card Title. Numeric Decimals coerce via Number() to match `after`.
    const before = isCreate
      ? null
      : {
          category: prev?.category ?? null,
          achievedValue: prev?.achievedValue != null ? Number(prev.achievedValue) : null,
          comment: prev?.comment ?? null,
        };
    const after = { category, achievedValue, comment };

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
        // The subject whose critical this reviews (self for year/actions).
        userId: subjectUserId,
        horizon: "critical",
        rowIndex: 0,
        category,
        period,
        achievedValue: achievedValue ?? undefined,
        comment: comment ?? undefined,
        updatedBy: userId,
      },
    });

    // Rich change-history event (same AuditEvent system as KPI/Priority/WWW).
    // Composite entityId scopes the timeline to this one card (per-subject for
    // Individual), so each card shows only its own history.
    const scopeLabel = `${MODULE_LABELS[moduleKey] ?? moduleKey} · ${CARD_LABELS[cardType] ?? cardType}`;
    await audit.log({
      entityType: CRITICAL_AUDIT_ENTITY_TYPE,
      entityId: `${opsp.id}:${period}`,
      action: isCreate ? "CREATE" : "UPDATE",
      actor: { userId, orgId },
      before,
      after,
      snapshot: { module: moduleKey, cardType, category, achievedValue, comment },
      reason: category ? `${scopeLabel} — ${category}` : scopeLabel,
      ...requestContext(req),
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
});
