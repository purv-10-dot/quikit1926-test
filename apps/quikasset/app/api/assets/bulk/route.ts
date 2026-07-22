import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { MAX_BULK_QUANTITY, findIntraBatchDuplicate } from "@/lib/api/assetBulk";

const auth = withOrgAuthForResource("Asset");

const unitSchema = z.object({
  itemCode: z.string().trim().min(1, "Each unit needs an Item Code"),
  serialNumber: z.string().trim().min(1, "Each unit needs a Serial Number"),
});

// Shared fields = every asset field EXCEPT the per-unit itemCode/serialNumber.
const bulkSchema = z.object({
  shared: z.object({
    warehouse: z.string().nullable().optional(),
    assetType: z.string().optional(),
    baseCategoryId: z.string().min(1, "Asset Type is required"),
    categoryId: z.string().min(1, "Category is required"),
    itemName: z.string().min(1, "Item Name is required"),
    invoiceNumber: z.string().min(1, "Invoice Number is required"),
    price: z
      .number({ required_error: "Price is required", invalid_type_error: "Price is required" })
      .nonnegative("Price must be 0 or more"),
    purchaseDate: z.string().min(1, "Purchase Date is required"),
    location: z.string().min(1, "Location is required"),
    condition: z.string().min(1, "Condition is required"),
    warrantyEndDate: z.string().nullable().optional(),
    description: z.string().optional(),
  }),
  units: z.array(unitSchema).min(1, "At least one unit is required").max(MAX_BULK_QUANTITY, `At most ${MAX_BULK_QUANTITY} units per batch`),
});

/**
 * Atomic bulk create. Validates uniqueness (within the batch AND against existing
 * org assets) BEFORE writing, then creates every unit in a single transaction —
 * so a duplicate never leaves a half-created batch behind.
 */
export const POST = auth.create(async ({ orgId, userId, userEmail }, req) => {
  const parsed = bulkSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { shared, units } = parsed.data;

  // 1. Uniqueness within the batch.
  const dup = findIntraBatchDuplicate(units);
  if (dup) {
    const label = dup.field === "itemCode" ? "Item Code" : "Serial Number";
    return NextResponse.json(
      { success: false, error: `${label} "${dup.value}" is duplicated in units ${dup.rows.join(" & ")}.` },
      { status: 409 },
    );
  }

  // 2. Collision with existing org assets (itemCode + serialNumber are each unique per org).
  const codes = units.map((u) => u.itemCode.trim());
  const serials = units.map((u) => u.serialNumber.trim());
  const existing = await db.astAsset.findMany({
    where: { orgId, OR: [{ itemCode: { in: codes } }, { serialNumber: { in: serials } }] },
    select: { itemCode: true, serialNumber: true },
  });
  if (existing.length > 0) {
    const codeSet = new Set(codes);
    const serialSet = new Set(serials);
    const hitCode = existing.find((e) => codeSet.has(e.itemCode));
    const hitSerial = existing.find((e) => serialSet.has(e.serialNumber));
    const error = hitCode
      ? `Item Code "${hitCode.itemCode}" already exists in this organization.`
      : `Serial Number "${hitSerial!.serialNumber}" already exists in this organization.`;
    return NextResponse.json({ success: false, error }, { status: 409 });
  }

  // 3. Create every unit atomically (rolls back entirely on any failure).
  const assetType = shared.assetType?.trim() || "Fixed";
  const created = await db.$transaction(
    units.map((u) =>
      db.astAsset.create({
        data: {
          orgId,
          warehouse: shared.warehouse ?? null,
          assetType,
          baseCategoryId: shared.baseCategoryId,
          categoryId: shared.categoryId,
          itemName: shared.itemName,
          itemCode: u.itemCode.trim(),
          serialNumber: u.serialNumber.trim(),
          invoiceNumber: shared.invoiceNumber,
          price: shared.price,
          purchaseDate: shared.purchaseDate,
          location: shared.location,
          condition: shared.condition,
          warrantyEndDate: shared.warrantyEndDate ?? null,
          description: shared.description ?? "",
          assetStatus: "Available",
        },
        include: { baseCategory: true, category: true },
      }),
    ),
  );

  await audit({
    orgId,
    module: "Assets",
    action: "Assets Bulk Created",
    entityId: created[0]?.id ?? "bulk",
    entityName: `${shared.itemName} ×${created.length}`,
    details: `${created.length} units created`,
    actorId: userId,
    actorEmail: userEmail,
  });

  return NextResponse.json({ success: true, data: created }, { status: 201 });
});
