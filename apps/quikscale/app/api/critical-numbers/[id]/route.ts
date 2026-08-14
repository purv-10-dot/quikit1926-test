import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { validationError } from "@/lib/api/validationError";
import { updateCriticalNumberSchema } from "@/lib/schemas/criticalNumberSchema";
import {
  validateTeamInOrg,
  validateOwnerInTeam,
  validateTeamCap,
  validateCategoryInOrg,
  validateSubCategory,
} from "@/lib/api/criticalNumberValidation";

const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

const DETAIL_FIELDS = {
  id: true,
  title: true,
  teamId: true,
  ownerId: true,
  categoryId: true,
  subCategoryId: true,
  measurementUnit: true,
  unit: true,
  currency: true,
  targetScale: true,
  frequency: true,
  targetValue: true,
  currentValue: true,
  createdAt: true,
  updatedAt: true,
  team: { select: { id: true, name: true, color: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  category: { select: { id: true, name: true } },
  subCategory: { select: { id: true, name: true } },
} as const;

/**
 * GET /api/critical-numbers/[id]
 *
 * One record plus its full history (oldest first), so the detail view can draw
 * the gauge and the trend from a single round-trip.
 */
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const item = await db.criticalNumber.findFirst({
    where: { id: params.id, orgId },
    select: {
      ...DETAIL_FIELDS,
      updates: {
        select: { id: true, date: true, value: true, comment: true, createdAt: true, createdBy: true },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!item) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: item });
});

/**
 * PATCH /api/critical-numbers/[id]
 *
 * Edit the definition. `currentValue` is deliberately NOT accepted — it is
 * derived from the append-only history and only moves via
 * `POST /[id]/updates`.
 *
 * Every re-validation is conditional on the relevant field actually changing,
 * so a partial PATCH doesn't pay for checks it can't invalidate. One
 * exception: the currency-required-for-Currency check always runs (cheap,
 * no DB call) since it depends on the merged state, not a single field delta.
 */
export const PATCH = auth.update<{ id: string }>(
  async ({ orgId }, req, { params }) => {
    const existing = await db.criticalNumber.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true, teamId: true, ownerId: true, categoryId: true,
        subCategoryId: true, measurementUnit: true, currency: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const parsed = updateCriticalNumberSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    // Merge against the stored row so coherence is checked on the POST-edit
    // shape, not on whichever subset the client happened to send.
    const nextTeamId = input.teamId ?? existing.teamId;
    const nextOwnerId = input.ownerId ?? existing.ownerId;
    const nextCategoryId = input.categoryId ?? existing.categoryId;
    const nextMeasurementUnit = input.measurementUnit ?? existing.measurementUnit;
    // `subCategoryId` is nullable, so `undefined` (absent) and `null` (clear it)
    // mean different things and can't be collapsed with `??`.
    const nextSubCategoryId =
      input.subCategoryId !== undefined ? input.subCategoryId : existing.subCategoryId;
    // Same undefined-vs-null nuance as subCategoryId — needed here purely to
    // resolve the currency-required check below on the POST-edit state.
    const nextCurrency = input.currency !== undefined ? input.currency : existing.currency;

    const teamChanged = nextTeamId !== existing.teamId;
    const ownerChanged = nextOwnerId !== existing.ownerId;
    const categoryChanged = nextCategoryId !== existing.categoryId;
    const subChanged = nextSubCategoryId !== existing.subCategoryId;

    // The Zod refine only catches an explicit contradiction in the SAME
    // request; this catches the rest (e.g. measurementUnit flips to Currency
    // with currency omitted, and the existing row — force-nulled while it was
    // some other type — has none to fall back on).
    if (nextMeasurementUnit === "Currency" && !nextCurrency) {
      return NextResponse.json(
        { success: false, error: "Currency is required when Measurement Unit is Currency" },
        { status: 400 },
      );
    }

    if (teamChanged) {
      const bad = await validateTeamInOrg(orgId, nextTeamId);
      if (bad) return bad;
      // Moving to a new team consumes a slot there; exclude self so a no-op
      // save can't trip its own cap.
      const capped = await validateTeamCap(orgId, nextTeamId, params.id);
      if (capped) return capped;
    }
    if (teamChanged || ownerChanged) {
      const bad = await validateOwnerInTeam(orgId, nextTeamId, nextOwnerId);
      if (bad) return bad;
    }
    if (categoryChanged) {
      const bad = await validateCategoryInOrg(orgId, nextCategoryId);
      if (bad) return bad;
    }
    // Re-checked when EITHER side moves: changing the category can orphan a
    // sub-category that was previously valid.
    if (nextSubCategoryId && (subChanged || categoryChanged)) {
      const bad = await validateSubCategory(orgId, nextCategoryId, nextSubCategoryId);
      if (bad) return bad;
    }

    const updated = await db.criticalNumber.update({
      where: { id: params.id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        teamId: nextTeamId,
        ownerId: nextOwnerId,
        categoryId: nextCategoryId,
        subCategoryId: nextSubCategoryId,
        measurementUnit: nextMeasurementUnit,
        // Same force-null rule as create: the Unit Master label is Number-only.
        unit:
          nextMeasurementUnit === "Number"
            ? (input.unit !== undefined ? input.unit?.trim() || null : undefined)
            : null,
        // Mirrors `unit` above, but for the Currency-only fields.
        currency:
          nextMeasurementUnit === "Currency"
            ? (input.currency !== undefined ? input.currency?.trim() || null : undefined)
            : null,
        targetScale:
          nextMeasurementUnit === "Currency"
            ? (input.targetScale !== undefined ? input.targetScale?.trim() || null : undefined)
            : null,
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.targetValue !== undefined && { targetValue: input.targetValue }),
      },
      select: DETAIL_FIELDS,
    });

    return NextResponse.json({ success: true, data: updated });
  },
);

/**
 * DELETE /api/critical-numbers/[id]
 *
 * Hard delete — v1 has no trash/restore by design. The history rows go with it
 * via the FK's ON DELETE CASCADE, and the team's cap slot frees up immediately.
 */
export const DELETE = auth.delete<{ id: string }>(
  async ({ orgId }, _req, { params }) => {
    const existing = await db.criticalNumber.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    await db.criticalNumber.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, data: { id: params.id } });
  },
);
