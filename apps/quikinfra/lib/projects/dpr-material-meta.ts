import { db } from "@/lib/db";

/**
 * DPR material entries persist only `itemId` + `uomId` (no relation), so the
 * list/detail routes batch-resolve item names + uom codes here to denormalize
 * them onto each material line. That lets the edit form's lazy material picker
 * show the selected item's name + UOM without loading the whole item master.
 */
export async function resolveMaterialMeta(
  orgId: string,
  itemIds: Array<string | null | undefined>,
  uomIds: Array<string | null | undefined>,
): Promise<{
  itemNameById: Map<string, string>;
  uomCodeById: Map<string, string>;
}> {
  const uniqItems = Array.from(
    new Set(itemIds.filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  const uniqUoms = Array.from(
    new Set(uomIds.filter((v): v is string => typeof v === "string" && v.length > 0)),
  );
  const [items, uoms] = await Promise.all([
    uniqItems.length
      ? db.cnItem.findMany({
          where: { id: { in: uniqItems }, orgId },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    uniqUoms.length
      ? db.cnUOM.findMany({
          where: { id: { in: uniqUoms }, orgId },
          select: { id: true, code: true },
        })
      : Promise.resolve([] as { id: string; code: string }[]),
  ]);
  return {
    itemNameById: new Map(items.map((i) => [i.id, i.name])),
    uomCodeById: new Map(uoms.map((u) => [u.id, u.code])),
  };
}
