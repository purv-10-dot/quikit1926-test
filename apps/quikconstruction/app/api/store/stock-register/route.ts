import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";

/**
 * Stock Register — computed on-the-fly from real transactional state
 * rather than the items master's seeded `currentStock`. Aggregates
 * per-item quantities across every stock-moving entity the system
 * currently tracks:
 *
 *   IN      = Σ GRN.acceptedQty                  (receipts from POs)
 *   OUT     = Σ MaterialIssue.lines.quantity     (consumption)
 *           + Σ GoodReturn.lines.returnQty       (vendor returns)
 *           + Σ StockTransfer.lines.dispatchQty  (outward transfers)
 *   ON ORDER = Σ POLine.pendingQty               (raised, not yet received)
 *
 * `balance = IN − OUT`. Same-item rows from multiple POs aggregate
 * automatically because grouping is by `itemId`.
 *
 * The register lists ONLY items that have appeared on at least one
 * stock-relevant document (PO line / GRN / MI / GR / ST) — the items
 * master is used purely as a name/UOM/group lookup, not as the row
 * source. This matches the user expectation that the register
 * mirrors what's in motion, not the entire catalogue.
 *
 * Value is derived from a quantity-weighted average of the GRN unit
 * rates actually booked against each item — falls back to the PO
 * unit rate (then to the item master's `standardRate`) when the item
 * has never been received.
 *
 * `projectId` and `locationId` query params scope the aggregate when
 * supplied.
 */

interface StockRegisterRow {
  id: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  groupName: string;
  // Column keys the list page expects (totalIn / totalOut / balance)
  // — kept in sync with stock-register/page.tsx so renaming on either
  // side stays a single-file change.
  totalIn: number;
  totalOut: number;
  balance: number;
  /** Σ pending PO qty for this item — useful as a "what's on the
   *  way" hint before any GRN is posted. */
  onOrderQty: number;
  /** Σ (pendingQty × PO unit rate) for this item — money value of
   *  the open purchase commitment. Lets the user see what's bought-
   *  but-not-yet-received without it polluting `stockValue`, which
   *  intentionally tracks received-stock value only. */
  onOrderValue: number;
  // Aliases for callers that hit the API directly (e.g. dashboards).
  inQty: number;
  outQty: number;
  currentStock: number;
  minStockLevel: number;
  avgRate: number;
  standardRate: number;
  stockValue: number;
  isLowStock: boolean;
  projectName: string;
  locationName: string;
}

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";
  const lowStockOnly = searchParams.get("lowStockOnly") === "true";
  const projectId = searchParams.get("projectId") ?? "";
  const locationId = searchParams.get("locationId") ?? "";

  // ─── GRN receipts (INWARD) ─────────────────────────────────────
  // Real `goods_receipt_notes` + `grn_lines`. Only count rows
  // tied to the current tenant. Status filter keeps out drafts so
  // unposted receipts don't inflate balances; `submitted` /
  // `pending_approval` / `approved` all count as real receipts.
  let grnWhere = "";
  const grnParams: any[] = [];
  if (ctx) {
    grnWhere += ` AND g."tenantId" = $${grnParams.length + 1}`;
    grnParams.push(ctx.tenantId);
  }
  if (projectId) {
    grnWhere += ` AND g."projectId" = $${grnParams.length + 1}`;
    grnParams.push(projectId);
  }

  // We use `unsafe` template interpolation via $queryRawUnsafe so the
  // dynamic filters can build a single SQL string; all user-supplied
  // bits ride as bound params, never concatenated inline.
  const grnRows: any[] = await (db as any).$queryRawUnsafe(
    `SELECT l."itemId"                            AS "itemId",
            SUM(l."acceptedQty")                  AS "qtyIn",
            SUM(l."acceptedQty" * l."unitRate")   AS "valueIn"
     FROM app_quikconstruction."Grn_lines" l
     JOIN app_quikconstruction."Goods_receipt_notes" g ON g.id = l."grnId"
     WHERE g.status <> 'draft' AND g.status <> 'cancelled'
     ${grnWhere}
     GROUP BY l."itemId"`,
    ...grnParams,
  );

  const inByItem = new Map<string, { qty: number; value: number }>();
  for (const r of grnRows) {
    const itemId = r.itemId as string;
    const qty = Number(r.qtyIn?.toString?.() ?? r.qtyIn ?? 0);
    const value = Number(r.valueIn?.toString?.() ?? r.valueIn ?? 0);
    inByItem.set(itemId, { qty, value });
  }

  // ─── PO line aggregation (visibility + on-order qty) ────────────
  // Even before a GRN posts, we want every item that's on a live PO
  // to appear in the register so the user sees "I'm expecting 4 LTR
  // of HSD". Pull pending qty (orderedQty − receivedQty) and the
  // unit rate so we can fall back to the PO rate for items that
  // haven't been received yet (otherwise value would be ₹0).
  let poWhere = "";
  const poParams: any[] = [];
  if (ctx) {
    poWhere += ` AND po."tenantId" = $${poParams.length + 1}`;
    poParams.push(ctx.tenantId);
  }
  if (projectId) {
    poWhere += ` AND po."projectId" = $${poParams.length + 1}`;
    poParams.push(projectId);
  }
  const poRows: any[] = await (db as any).$queryRawUnsafe(
    `SELECT l."itemId"                                    AS "itemId",
            SUM(GREATEST(l."pendingQty", 0))              AS "pendingQty",
            SUM(l."orderedQty" * l."unitRate")            AS "poValue",
            SUM(l."orderedQty")                           AS "orderedQty"
     FROM app_quikconstruction."Purchase_order_lines" l
     JOIN app_quikconstruction."Purchase_orders" po ON po.id = l."poId"
     WHERE po.status NOT IN ('draft', 'cancelled', 'rejected')
     ${poWhere}
     GROUP BY l."itemId"`,
    ...poParams,
  );
  const poByItem = new Map<
    string,
    { pendingQty: number; orderedQty: number; avgRate: number }
  >();
  for (const r of poRows) {
    const itemId = r.itemId as string;
    const pendingQty = Number(r.pendingQty?.toString?.() ?? r.pendingQty ?? 0);
    const orderedQty = Number(r.orderedQty?.toString?.() ?? r.orderedQty ?? 0);
    const poValue = Number(r.poValue?.toString?.() ?? r.poValue ?? 0);
    const avgRate = orderedQty > 0 ? poValue / orderedQty : 0;
    poByItem.set(itemId, { pendingQty, orderedQty, avgRate });
  }

  // ─── OUTWARD: Material Issue + Good Return (Postgres, JSON lines)
  // Both store their lines in a JSONB `materials` column — pull rows
  // in bulk and aggregate in JS. Filter by tenant + (optional) project
  // so scoped views match the IN side.
  const miRowsQuery = `
    SELECT mi."projectId", mi.materials
    FROM app_quikconstruction."Material_issues" mi
    WHERE mi.status IN ('issued', 'approved', 'pending_approval', 'draft')
      ${ctx ? 'AND mi."tenantId" = $1' : ""}
  `;
  const miRows: any[] = ctx
    ? await (db as any).$queryRawUnsafe(miRowsQuery, ctx.tenantId)
    : await (db as any).$queryRawUnsafe(miRowsQuery);

  const outByItem = new Map<string, number>();
  const bumpOut = (itemId: string, qty: number) => {
    if (!itemId || !Number.isFinite(qty) || qty <= 0) return;
    outByItem.set(itemId, (outByItem.get(itemId) ?? 0) + qty);
  };
  for (const mi of miRows) {
    if (projectId && mi.projectId !== projectId) continue;
    const lines = Array.isArray(mi.materials) ? mi.materials : [];
    for (const line of lines) {
      if (locationId && line.sourceLocationId && line.sourceLocationId !== locationId)
        continue;
      bumpOut(
        String(line.itemId ?? ""),
        Number(line.quantity ?? line.issueQty ?? 0),
      );
    }
  }

  const grRowsQuery = `
    SELECT gr."projectId", gr.materials
    FROM app_quikconstruction."Good_returns" gr
    WHERE gr.status IN ('dispatched', 'approved', 'pending_approval', 'draft')
      ${ctx ? 'AND gr."tenantId" = $1' : ""}
  `;
  const grRows: any[] = ctx
    ? await (db as any).$queryRawUnsafe(grRowsQuery, ctx.tenantId)
    : await (db as any).$queryRawUnsafe(grRowsQuery);
  for (const gr of grRows) {
    if (projectId && gr.projectId !== projectId) continue;
    const lines = Array.isArray(gr.materials) ? gr.materials : [];
    for (const line of lines) {
      bumpOut(
        String(line.itemId ?? ""),
        Number(line.returnQty ?? line.quantity ?? 0),
      );
    }
  }

  // ─── Stock Transfers (module-scoped store) ─────────────────────
  // The transfer API still lives on a globalThis-backed array until
  // it graduates to a Prisma repo, so read from the same ref the
  // POST route writes to. Outward from the source project only.
  const transfers: any[] =
    ((globalThis as any).__qcStockTransfers as any[]) ?? [];
  for (const t of transfers) {
    if (ctx && t.tenantId !== ctx.tenantId) continue;
    if (projectId && t.sourceProjectId !== projectId) continue;
    if (locationId && t.fromLocationId !== locationId) continue;
    const lines = Array.isArray(t.lines) ? t.lines : [];
    for (const line of lines) {
      bumpOut(
        String(line.itemId ?? ""),
        Number(line.dispatchQty ?? line.quantity ?? 0),
      );
    }
  }

  // ─── Build rows from the UNION of seen item IDs ─────────────────
  // The register lists only items that have actually appeared on a
  // PO/GRN/MI/GR/ST. We hydrate each row's display fields (code,
  // name, UOM, group, min-stock) from the items master — the master
  // is a lookup, not the row source.
  //
  // Items master lives in Postgres (`items`) — POs reference real
  // CnItem rows, not the demo-store seed. We pull names from
  // Postgres, joined with `item_groups` for the group name and
  // `uoms` for the UOM code, then fall back to the demo-store
  // seed for any IDs Postgres doesn't know about (legacy data).
  const seenItemIds = new Set<string>();
  poByItem.forEach((_v, id) => seenItemIds.add(id));
  inByItem.forEach((_v, id) => seenItemIds.add(id));
  outByItem.forEach((_v, id) => seenItemIds.add(id));

  const seenIdList: string[] = [];
  seenItemIds.forEach((id) => seenIdList.push(id));

  const itemMetaById = new Map<string, any>();
  if (seenIdList.length > 0) {
    const dbItems: any[] = await (db as any).$queryRawUnsafe(
      `SELECT i.id, i.code, i.name,
              i."minStockLevel", i."standardRate",
              g.name AS "groupName",
              u.code AS "uomCode"
       FROM app_quikconstruction."Items" i
       LEFT JOIN app_quikconstruction."Item_groups" g ON g.id = i."groupId"
       LEFT JOIN app_quikconstruction."Uoms" u        ON u.id = i."uomId"
       WHERE i.id = ANY($1::text[])`,
      seenIdList,
    );
    for (const i of dbItems) {
      itemMetaById.set(i.id, {
        code: i.code,
        name: i.name,
        uomCode: i.uomCode ?? "",
        groupName: i.groupName ?? "",
        minStockLevel:
          i.minStockLevel === null || i.minStockLevel === undefined
            ? "0"
            : String(i.minStockLevel),
        standardRate:
          i.standardRate === null || i.standardRate === undefined
            ? "0"
            : String(i.standardRate),
      });
    }
  }
  // Items master is fully Postgres-backed — no seed fallback needed.

  const rows: StockRegisterRow[] = [];
  for (const itemId of seenIdList) {
    const meta = itemMetaById.get(itemId);
    const inRec = inByItem.get(itemId) ?? { qty: 0, value: 0 };
    const outQty = outByItem.get(itemId) ?? 0;
    const poRec = poByItem.get(itemId) ?? {
      pendingQty: 0,
      orderedQty: 0,
      avgRate: 0,
    };
    const balance = inRec.qty - outQty;
    // Rate fallback chain: weighted-avg of GRN receipts → PO unit
    // rate → item-master standard rate → 0. So an item that's only
    // on a PO (no GRN yet) still shows a meaningful value via the
    // PO's quoted rate.
    const standardRate = parseFloat(meta?.standardRate ?? "0");
    const avgRate =
      inRec.qty > 0
        ? inRec.value / inRec.qty
        : poRec.avgRate || standardRate;
    const stockValue = balance * avgRate;
    // Use the PO's own avg rate for the open-order valuation, falling
    // back to the item's standard rate when a row is on order via a
    // PO that somehow has no rate (shouldn't happen, defensive).
    const onOrderRate = poRec.avgRate || standardRate;
    const onOrderValue = poRec.pendingQty * onOrderRate;
    const minStock = parseFloat(meta?.minStockLevel ?? "0");
    rows.push({
      id: itemId,
      itemCode: meta?.code ?? itemId,
      itemName: meta?.name ?? itemId,
      uomCode: meta?.uomCode ?? "",
      groupName: meta?.groupName ?? "",
      totalIn: inRec.qty,
      totalOut: outQty,
      balance,
      onOrderQty: poRec.pendingQty,
      onOrderValue,
      inQty: inRec.qty,
      outQty,
      currentStock: balance,
      minStockLevel: minStock,
      avgRate,
      standardRate,
      stockValue,
      isLowStock: minStock > 0 && balance < minStock,
      // Project / location columns are empty on the tenant-wide
      // aggregate. The list page renders them as blank; the
      // pass-through filters can be added later when the UI exposes
      // them.
      projectName: "",
      locationName: "",
    });
  }

  let data = rows;
  if (search) {
    data = data.filter(
      (d) =>
        d.itemName.toLowerCase().includes(search) ||
        d.itemCode.toLowerCase().includes(search),
    );
  }
  if (lowStockOnly) data = data.filter((d) => d.isLowStock);

  const summary = {
    totalItems: data.length,
    totalValue: data.reduce((s, d) => s + d.stockValue, 0),
    onOrderValue: data.reduce((s, d) => s + d.onOrderValue, 0),
    lowStockCount: data.filter((d) => d.isLowStock).length,
  };

  return NextResponse.json({ data, total: data.length, summary });
}
