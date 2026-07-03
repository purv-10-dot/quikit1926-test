import { Prisma } from "@prisma/client";
import { round2 } from "@/lib/accounting/posting";

type Tx = Prisma.TransactionClient;

export type ItemRow = {
  id: string;
  name: string;
  track_inventory: boolean;
  quantity_on_hand: number;
  purchase_price: number; // last/standard cost — used as a fallback when no layers remain
  asset_account_id: string | null;
  expense_account_id: string | null;
};

const round4 = (value: number) => Math.round((value + Number.EPSILON) * 10000) / 10000;

/** Load the stock-tracking fields for a set of item ids. */
export async function loadItems(tx: Tx, orgId: string, itemIds: string[]): Promise<Map<string, ItemRow>> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return new Map();

  const rows = await tx.$queryRaw<
    Array<{ id: string; name: string; track_inventory: boolean; quantity_on_hand: string; purchase_price: string; asset_account_id: string | null; expense_account_id: string | null }>
  >`
    SELECT id, name, track_inventory, quantity_on_hand, purchase_price, asset_account_id, expense_account_id
    FROM items WHERE org_id = ${orgId}::uuid AND id::text IN (${Prisma.join(ids)})`;

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        track_inventory: Boolean(row.track_inventory),
        quantity_on_hand: Number(row.quantity_on_hand ?? 0),
        purchase_price: Number(row.purchase_price ?? 0),
        asset_account_id: row.asset_account_id,
        expense_account_id: row.expense_account_id
      }
    ])
  );
}

async function recordMovement(
  tx: Tx,
  orgId: string,
  params: { itemId: string; movementType: string; referenceType: string; referenceId: string; movementDate: string; qtyIn: number; qtyOut: number; unitCost: number; balanceQty: number; balanceValue: number }
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO stock_movements (org_id, item_id, movement_type, reference_type, reference_id, movement_date, qty_in, qty_out, unit_cost, balance_qty, balance_value)
    VALUES (
      ${orgId}::uuid, ${params.itemId}::uuid, ${params.movementType}, ${params.referenceType}, ${params.referenceId}::uuid, ${params.movementDate}::date,
      ${round4(params.qtyIn)}, ${round4(params.qtyOut)}, ${round4(params.unitCost)}, ${round4(params.balanceQty)}, ${round2(params.balanceValue)}
    )`;
}

/** Receive stock (purchase): create a FIFO cost layer and bump quantity. */
export async function recordPurchase(
  tx: Tx,
  orgId: string,
  item: ItemRow,
  quantity: number,
  unitCost: number,
  ref: { type: string; id: string; date: string }
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO stock_layers (org_id, item_id, ref_type, ref_id, unit_cost, quantity, remaining_qty, layer_date)
    VALUES (${orgId}::uuid, ${item.id}::uuid, ${ref.type}, ${ref.id}::uuid, ${round4(unitCost)}, ${round4(quantity)}, ${round4(quantity)}, ${ref.date}::date)`;

  const newQty = round4(item.quantity_on_hand + quantity);
  await tx.$executeRaw`
    UPDATE items SET quantity_on_hand = ${newQty}, purchase_price = ${round2(unitCost)}, updated_at = now()
    WHERE id = ${item.id}::uuid AND org_id = ${orgId}::uuid`;

  await recordMovement(tx, orgId, {
    itemId: item.id,
    movementType: "purchase",
    referenceType: ref.type,
    referenceId: ref.id,
    movementDate: ref.date,
    qtyIn: quantity,
    qtyOut: 0,
    unitCost,
    balanceQty: newQty,
    balanceValue: round2(newQty * unitCost)
  });

  item.quantity_on_hand = newQty;
  item.purchase_price = round2(unitCost);
}

/**
 * Issue stock (sale): consume FIFO cost layers oldest-first, recording each
 * consumption so it can be reversed. Returns the COGS amount. Throws if the
 * sale would drive quantity negative (negative-stock guard).
 */
export async function recordSale(
  tx: Tx,
  orgId: string,
  item: ItemRow,
  quantity: number,
  ref: { type: string; id: string; date: string }
): Promise<number> {
  if (round4(item.quantity_on_hand - quantity) < -0.0001) {
    throw new Error(`Insufficient stock for "${item.name}": ${item.quantity_on_hand} on hand, ${quantity} requested. Receive stock first.`);
  }

  const layers = await tx.$queryRaw<Array<{ id: string; remaining_qty: string; unit_cost: string }>>`
    SELECT id, remaining_qty, unit_cost FROM stock_layers
    WHERE org_id = ${orgId}::uuid AND item_id = ${item.id}::uuid AND remaining_qty > 0
    ORDER BY layer_date ASC, created_at ASC`;

  let need = round4(quantity);
  let cogs = 0;
  for (const layer of layers) {
    if (need <= 0) break;
    const available = Number(layer.remaining_qty);
    const take = round4(Math.min(available, need));
    const unitCost = Number(layer.unit_cost);
    cogs = round2(cogs + take * unitCost);
    need = round4(need - take);
    await tx.$executeRaw`UPDATE stock_layers SET remaining_qty = ${round4(available - take)} WHERE id = ${layer.id}::uuid`;
    await tx.$executeRaw`
      INSERT INTO stock_layer_consumptions (org_id, layer_id, ref_type, ref_id, quantity, unit_cost)
      VALUES (${orgId}::uuid, ${layer.id}::uuid, ${ref.type}, ${ref.id}::uuid, ${take}, ${round4(unitCost)})`;
  }
  // Shortfall (e.g. items stocked before FIFO had no layers): cost at last known price.
  if (need > 0.0001) {
    cogs = round2(cogs + need * item.purchase_price);
  }

  const newQty = round4(item.quantity_on_hand - quantity);
  await tx.$executeRaw`
    UPDATE items SET quantity_on_hand = ${newQty}, updated_at = now()
    WHERE id = ${item.id}::uuid AND org_id = ${orgId}::uuid`;

  await recordMovement(tx, orgId, {
    itemId: item.id,
    movementType: "sale",
    referenceType: ref.type,
    referenceId: ref.id,
    movementDate: ref.date,
    qtyIn: 0,
    qtyOut: quantity,
    unitCost: quantity > 0 ? round4(cogs / quantity) : 0,
    balanceQty: newQty,
    balanceValue: round2(newQty * item.purchase_price)
  });

  item.quantity_on_hand = newQty;
  return cogs;
}

/**
 * Undo a reference document's stock effect: restore layers it consumed, drop
 * layers it created, and reverse quantity movements. (FIFO history can drift if
 * a purchase layer was already consumed by another document — an accepted edge.)
 */
export async function reverseInventoryFor(tx: Tx, orgId: string, referenceType: string, referenceId: string): Promise<void> {
  // 1. Restore stock this ref consumed back into its layers.
  const consumptions = await tx.$queryRaw<Array<{ layer_id: string; quantity: string }>>`
    SELECT layer_id, quantity FROM stock_layer_consumptions
    WHERE org_id = ${orgId}::uuid AND ref_type = ${referenceType} AND ref_id = ${referenceId}::uuid`;
  for (const consumption of consumptions) {
    await tx.$executeRaw`
      UPDATE stock_layers SET remaining_qty = ROUND(remaining_qty + ${Number(consumption.quantity)}, 4) WHERE id = ${consumption.layer_id}::uuid`;
  }
  await tx.$executeRaw`
    DELETE FROM stock_layer_consumptions WHERE org_id = ${orgId}::uuid AND ref_type = ${referenceType} AND ref_id = ${referenceId}::uuid`;

  // 2. Drop layers this ref created (and any dangling consumptions of them).
  const layers = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM stock_layers WHERE org_id = ${orgId}::uuid AND ref_type = ${referenceType} AND ref_id = ${referenceId}::uuid`;
  for (const layer of layers) {
    await tx.$executeRaw`DELETE FROM stock_layer_consumptions WHERE layer_id = ${layer.id}::uuid`;
  }
  await tx.$executeRaw`
    DELETE FROM stock_layers WHERE org_id = ${orgId}::uuid AND ref_type = ${referenceType} AND ref_id = ${referenceId}::uuid`;

  // 3. Reverse the quantity movements.
  const rows = await tx.$queryRaw<Array<{ item_id: string; qty_in: string; qty_out: string }>>`
    SELECT item_id, qty_in, qty_out FROM stock_movements
    WHERE org_id = ${orgId}::uuid AND reference_type = ${referenceType} AND reference_id = ${referenceId}::uuid`;
  for (const row of rows) {
    await tx.$executeRaw`
      UPDATE items SET quantity_on_hand = ROUND(quantity_on_hand - ${Number(row.qty_in)} + ${Number(row.qty_out)}, 4), updated_at = now()
      WHERE id = ${row.item_id}::uuid AND org_id = ${orgId}::uuid`;
  }
  await tx.$executeRaw`
    DELETE FROM stock_movements WHERE org_id = ${orgId}::uuid AND reference_type = ${referenceType} AND reference_id = ${referenceId}::uuid`;
}
