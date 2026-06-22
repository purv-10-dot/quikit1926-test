import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { opspUpsertSchema, opspFinalizeSchema } from "@/lib/schemas/opspSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { resolveFiscalYearStart } from "@/lib/api/fiscalYearStart";
import { userCan, forbidden, isOrgAdmin } from "@/lib/api/permissions";
import { resolveOpspOwnerOrSelf, resolveResponsibleAdminName, resolveSectionUserId } from "@/lib/api/opspOwner";
const auth = withOrgAuthForResource("opsp.create", "OPSP.Create");

/**
 * The four per-user OPSP sections. The strategic OPSP stays org-shared in
 * OPSPData (canonical owner); these live in OPSPUserSection keyed by
 * (orgId, userId, year, quarter) so every user owns their own copy.
 */
const USER_SECTION_FIELDS = [
  "kpiAccountability",
  "quarterlyPriorities",
  "criticalNumAcct",
  "balancingCritNumAcct",
] as const;
type UserSectionFields = Pick<
  { [K in (typeof USER_SECTION_FIELDS)[number]]: unknown },
  (typeof USER_SECTION_FIELDS)[number]
>;

const EMPTY_SECTION: UserSectionFields = {
  kpiAccountability: [],
  quarterlyPriorities: [],
  criticalNumAcct: null,
  balancingCritNumAcct: null,
};

/**
 * Resolve the four per-user section fields for `sectionUserId` at (year,
 * quarter). When no row exists yet, inherit from the prior quarter IF the org's
 * OPSP for that prior quarter is finalized/reviewed (same org-wide gate the
 * strategic inheritance uses): the two genuinely-quarterly surfaces
 * (kpiAccountability, quarterlyPriorities) reset; the Critical numbers carry
 * forward. Otherwise the sections start empty.
 */
async function resolveUserSectionFields(
  orgId: string,
  ownerId: string,
  sectionUserId: string,
  year: number,
  quarter: string,
): Promise<UserSectionFields> {
  const current = await db.oPSPUserSection.findUnique({
    where: { orgId_userId_year_quarter: { orgId, userId: sectionUserId, year, quarter } },
  });
  if (current) {
    return {
      kpiAccountability: current.kpiAccountability ?? [],
      quarterlyPriorities: current.quarterlyPriorities ?? [],
      criticalNumAcct: current.criticalNumAcct ?? null,
      balancingCritNumAcct: current.balancingCritNumAcct ?? null,
    };
  }

  const prior = priorQuarterOf(year, quarter);
  if (prior) {
    // Org-wide gate: only inherit when the canonical OPSP for the prior quarter
    // is finalized/reviewed (mirrors the strategic inheritance path).
    const priorCanonical = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId: ownerId, year: prior.year, quarter: prior.quarter },
      },
      select: { status: true },
    });
    if (priorCanonical && (priorCanonical.status === "finalized" || priorCanonical.status === "reviewed")) {
      const priorSection = await db.oPSPUserSection.findUnique({
        where: {
          orgId_userId_year_quarter: { orgId, userId: sectionUserId, year: prior.year, quarter: prior.quarter },
        },
      });
      if (priorSection) {
        return {
          // Quarterly surfaces reset each quarter.
          kpiAccountability: [],
          quarterlyPriorities: [],
          // Critical numbers carry forward.
          criticalNumAcct: priorSection.criticalNumAcct ?? null,
          balancingCritNumAcct: priorSection.balancingCritNumAcct ?? null,
        };
      }
    }
  }
  return { ...EMPTY_SECTION };
}

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

/**
 * Walk an OPSP record's JSON columns and collect every `owner` id referenced
 * (rocks[].owner, and any other owner-bearing rows). Field-agnostic so it can't
 * miss a surface. The set is tiny (the handful of owners actually assigned).
 */
function collectOwnerIds(obj: unknown, acc: Set<string>): void {
  if (Array.isArray(obj)) {
    for (const x of obj) collectOwnerIds(x, acc);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      if (k === "owner" && typeof v === "string" && v) acc.add(v);
      else collectOwnerIds(v, acc);
    }
  }
}

/**
 * Resolve the owner ids present in `data` → "First Last" map. Returned
 * alongside the OPSP payload so the page can render owner names (picker
 * triggers, the OPSP document, the export) WITHOUT bulk-loading every org
 * user just for name resolution.
 */
async function resolveOwnerNames(orgId: string, data: unknown): Promise<Record<string, string>> {
  const ids = new Set<string>();
  collectOwnerIds(data, ids);
  if (ids.size === 0) return {};
  // Owner ids already come from THIS org's OPSP record, so resolve by id.
  void orgId;
  const users = await db.user.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const map: Record<string, string> = {};
  for (const u of users) map[u.id] = `${u.firstName} ${u.lastName}`.trim();
  return map;
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
  const targetUserId = searchParams.get("targetUserId");

  // Derived from configured Quarter Settings (Q1 start month), not the
  // stale Org.fiscalYearStart column — see lib/api/fiscalYearStart.ts.
  const fiscalYearStart = await resolveFiscalYearStart(orgId);

  // OPSP is org-shared: read the canonical owner's rows so every permitted user
  // sees the same strategic plan (not their own empty per-user copy).
  const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

  // The four sections (Accountability / Quarterly Priorities / Critical # /
  // Balanced Critical #) are PER-USER. An admin with OPSP.EditUser:update may
  // view/edit another user's sections via ?targetUserId.
  const sectionUserId = await resolveSectionUserId(orgId, userId, targetUserId);
  if (sectionUserId === null) {
    return forbidden("Editing another user's OPSP requires the 'Edit Any User's OPSP' permission.");
  }

  // Resilience: the per-user section layer is non-critical to the org-shared
  // strategic plan. If either lookup fails (e.g. migration not yet applied in
  // some environment), degrade gracefully — load the strategic OPSP with empty
  // sections rather than 500-ing the whole page to a blank form.
  const [sectionFields, responsibleAdminName] = await Promise.all([
    resolveUserSectionFields(orgId, ownerId, sectionUserId, year, quarter).catch(() => ({
      ...EMPTY_SECTION,
    })),
    resolveResponsibleAdminName(orgId).catch(() => null),
  ]);

  const data = await db.oPSPData.findUnique({
    where: {
      orgId_userId_year_quarter: { orgId, userId: ownerId, year, quarter },
    },
  });

  // If a real (non-stub) target record exists, return it — but overlay the
  // viewer's own per-user sections over the canonical owner's copy.
  if (data && !looksLikeStubDraft(data)) {
    return NextResponse.json({
      success: true,
      data: { ...data, ...sectionFields },
      ownerNames: await resolveOwnerNames(orgId, data),
      sectionUserId,
      responsibleAdminName,
      fiscalYearStart,
    });
  }

  // Try inheriting from the prior quarter.
  const prior = priorQuarterOf(year, quarter);
  if (prior) {
    const priorData = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId: ownerId, year: prior.year, quarter: prior.quarter },
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
        // Always-clear quarterly-specific surfaces (strategic side).
        actionsQtr: [],
        rocks: [],
        // Year-boundary extras.
        ...(isYearBoundary
          ? { goalRows: [], keyInitiatives: [] }
          : {}),
        // Per-user sections come from OPSPUserSection (their own inheritance),
        // not the canonical owner's carried-over strategic record.
        ...sectionFields,
      };

      return NextResponse.json({
        success: true,
        data: inheritedData,
        // Inherited payload clears all quarterly owner-bearing rows, so no
        // owners to resolve — but keep the field shape consistent.
        ownerNames: {},
        sectionUserId,
        responsibleAdminName,
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

  // No canonical record, no eligible prior — fall back to the default form, but
  // still surface the viewer's own per-user sections (they may have a row even
  // when the org's strategic plan doesn't exist for this period).
  const hasSection = USER_SECTION_FIELDS.some((f) => {
    const v = sectionFields[f];
    return Array.isArray(v) ? v.length > 0 : v != null;
  });
  return NextResponse.json({
    success: true,
    data: hasSection ? { year, quarter, status: "draft", ...sectionFields } : null,
    ownerNames: {},
    sectionUserId,
    responsibleAdminName,
    fiscalYearStart,
  });
});

/* ── PUT: upsert (autosave) ── */
export const PUT = auth.update(async ({ orgId, userId }, req) => {
  const parsed = opspUpsertSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed, "Invalid OPSP payload");
  const { year, quarter, ...rest } = parsed.data;
  const yearNum = typeof year === "number" ? year : parseInt(year);

  // Peel the routing/per-user keys off the strategic payload.
  const { targetUserId, ...fields } = rest as Record<string, unknown> & {
    targetUserId?: string | null;
  };

  // Per-user sections route to OPSPUserSection (the acting user's, or another
  // user's with OPSP.EditUser:update). Strategic fields stay org-shared.
  const sectionUserId = await resolveSectionUserId(orgId, userId, targetUserId);
  if (sectionUserId === null) {
    return forbidden("Editing another user's OPSP requires the 'Edit Any User's OPSP' permission.");
  }

  const sectionUpdate: Record<string, unknown> = {};
  for (const f of USER_SECTION_FIELDS) {
    if (f in fields) {
      sectionUpdate[f] = (fields as Record<string, unknown>)[f];
      delete (fields as Record<string, unknown>)[f];
    }
  }

  // OPSP is org-shared: strategic writes target the canonical owner's record so
  // every permitted editor mutates the SAME plan. Audit fields below keep the
  // acting user's id. Permission to write is already enforced by `auth.update`.
  const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

  // Read the current record once and use it for two checks below:
  //   (a) edit-after-finalize gate — block mutations to a finalized/reviewed
  //       record unless the caller holds `OPSP.History.EditFinalize:update`.
  //   (b) status downgrade guard — see comment below.
  const current = await db.oPSPData.findUnique({
    where: { orgId_userId_year_quarter: { orgId, userId: ownerId, year: yearNum, quarter } },
    select: { status: true },
  });
  const currentStatus = current?.status ?? "draft";

  // (a) Server-side mirror of the client `isLocked` predicate. Without this
  // a malicious client could call PUT directly and overwrite a locked OPSP.
  // Once the review is SUBMITTED (`reviewed`) the OPSP is locked for everyone —
  // even holders of `OPSP.History.EditFinalize:update` — because the review has
  // been finalized against it. A merely `finalized` OPSP stays editable for
  // users with that permission.
  if (currentStatus === "reviewed") {
    return forbidden(
      "This OPSP's review has been submitted and finalized — it can no longer be edited.",
    );
  }
  if (currentStatus === "finalized") {
    const canEditFinalized = await userCan(
      userId,
      orgId,
      "OPSP.History.EditFinalize",
      "update",
    );
    if (!canEditFinalized) {
      return forbidden(
        "This OPSP is finalized. Editing requires the 'Edit after Finalize' permission.",
      );
    }
  }

  // (b) Status is a state machine: draft → finalized → reviewed (later
  // states are stronger locks). Autosave must never DOWNGRADE the
  // server-side status. The client's editable form can transiently hold a
  // weaker value (e.g. the very first autosave of a freshly-opened reviewed
  // OPSP), so we drop the incoming `status` field whenever it would move
  // the record backwards.
  const STATUS_RANK: Record<string, number> = { draft: 0, finalized: 1, reviewed: 2 };
  if (typeof (fields as { status?: unknown }).status === "string") {
    const incoming = (fields as { status: string }).status;
    const currentRank = STATUS_RANK[currentStatus] ?? 0;
    const incomingRank = STATUS_RANK[incoming] ?? 0;
    if (incomingRank < currentRank) {
      delete (fields as { status?: string }).status;
    }
  }

  // ── Strategic fields → org-shared OPSPData (canonical owner). Written FIRST so
  //    a failure in the per-user section layer can never lose the shared plan.
  //    Only admins may edit the strategic plan; non-admins' autosave payloads
  //    carry read-only strategic fields we must ignore (the page disables them,
  //    but the server is the source of truth). ──
  const callerIsAdmin = await isOrgAdmin(userId, orgId);
  const strategicKeys = Object.keys(fields);
  let data: { id: string } | null = null;
  if (callerIsAdmin && strategicKeys.length > 0) {
    data = await db.oPSPData.upsert({
      where: {
        orgId_userId_year_quarter: { orgId, userId: ownerId, year: yearNum, quarter },
      },
      update: {
        ...fields,
        updatedBy: userId,
      },
      create: {
        orgId,
        userId: ownerId,
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
      changes: strategicKeys,
    });
  }

  // ── Per-user sections (Accountability / Quarterly Priorities / Critical # /
  //    Balanced Critical #) → OPSPUserSection for the resolved section user. ──
  if (Object.keys(sectionUpdate).length > 0) {
    const sectionRow = await db.oPSPUserSection.upsert({
      where: {
        orgId_userId_year_quarter: { orgId, userId: sectionUserId, year: yearNum, quarter },
      },
      update: { ...sectionUpdate, updatedBy: userId },
      create: {
        orgId,
        userId: sectionUserId,
        year: yearNum,
        quarter,
        createdBy: userId,
        ...sectionUpdate,
      },
    });
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "OPSPUserSection",
      entityId: sectionRow.id,
      changes: Object.keys(sectionUpdate),
    });
  }

  return NextResponse.json({ success: true, data, savedAt: new Date().toISOString() });
});

/* ── POST: finalize ── */
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const parsedFinalize = opspFinalizeSchema.safeParse(await req.json());
  if (!parsedFinalize.success) return validationError(parsedFinalize, "Invalid OPSP payload");
  const { year, quarter } = parsedFinalize.data;
  const yearNum = typeof year === "number" ? year : parseInt(year);

  // Finalize the org's shared OPSP (canonical owner's record), not the acting
  // user's per-user copy. Audit keeps the acting user via `actorId`.
  const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

  // Only flip draft → finalized. A "reviewed" OPSP is a stronger lock and must
  // not be downgraded back to "finalized" if Finalize is clicked again.
  const result = await db.oPSPData.updateMany({
    where: {
      orgId,
      userId: ownerId,
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
    entityId: `${orgId}:${ownerId}:${yearNum}:${quarter}`,
    changes: ["status:finalized"],
    reason: "OPSP finalized",
  });

  return NextResponse.json({ success: true, data: { count: result.count } }, { status: 201 });
});
