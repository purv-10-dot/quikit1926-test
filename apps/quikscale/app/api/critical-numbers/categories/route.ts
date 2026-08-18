import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { validationError } from "@/lib/api/validationError";
import { createCategoryFromCriticalNumberSchema } from "@/lib/schemas/criticalNumberSchema";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * Inline "+ New Category" from the Critical Numbers create form.
 *
 * This WRITES to `CategoryMaster` — the one exception to "Critical Numbers
 * only reads CategoryMaster". It's an explicit, confirmed exception: a
 * category created here is a real OPSP Category Master row, gets the same
 * defaults OPSP's own create endpoint (`/api/categories`) would give it, and
 * shows up in OPSP's category list and audit log exactly as if an OPSP user
 * had created it. Nothing about how OPSP reads or displays CategoryMaster
 * changes.
 *
 * Gated on `criticalNumbers`/`CriticalNumber`, not `opsp.categories` — a user
 * with Critical Numbers access but no OPSP access can still add a category
 * from here, same rationale as `/api/critical-numbers/options`.
 */
const auth = withOrgAuthForResource("criticalNumbers", "CriticalNumber");

// Kept in sync with app/api/categories/route.ts, [id]/route.ts and logs/route.ts.
const CATEGORY_AUDIT_ENTITY_ID = "category-mgmt";

/** measurementUnit -> CategoryMaster.dataType. 1:1 for the three it shares. */
const DATA_TYPE_MAP = {
  Number: "Number",
  Percentage: "Percentage",
  Currency: "Currency",
} as const;

/**
 * POST /api/critical-numbers/categories
 *
 * `categoryType` and `breakdownType` are omitted from the write rather than
 * hardcoded here, so the new row gets the SAME defaults
 * (`Cumulative` / `Automatic`) straight from the Prisma column — if OPSP's
 * own default ever changes, this follows without a second place to update.
 *
 * No `currency` is collected on this form, so Currency categories are created
 * with `currency: null` — a valid, if incomplete, OPSP category; matches what
 * OPSP's own create form allows before a currency is chosen.
 */
export const POST = auth.create(async ({ orgId, userId }, req) => {
  const parsed = createCategoryFromCriticalNumberSchema.safeParse(await req.json());
  if (!parsed.success) return validationError(parsed);
  const { name, measurementUnit } = parsed.data;

  const trimmedName = name.trim();
  const dataType = DATA_TYPE_MAP[measurementUnit];

  try {
    const created = await db.categoryMaster.create({
      data: {
        orgId,
        name: trimmedName,
        nameKey: trimmedName.toLowerCase(),
        dataType,
        currency: null,
        createdBy: userId,
      },
      select: { id: true, name: true },
    });
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "CREATE",
      entityType: "Category",
      entityId: CATEGORY_AUDIT_ENTITY_ID,
      newValues: { name: created.name, dataType, currency: null },
      changes: ["name", "dataType", "currency"],
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (err: unknown) {
    // Same (orgId, nameKey, dataType, currency) unique index OPSP's own create
    // endpoint hits — surfaced with its wording so the two forms agree.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { success: false, error: "A category with this name and unit already exists." },
        { status: 409 },
      );
    }
    throw err;
  }
});
