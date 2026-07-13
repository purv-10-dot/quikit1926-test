import { db } from "@/lib/db";
import type { LineProcurement } from "./procurement-types";

/**
 * Resolves per-requirement PO + GRN fulfilment status by walking the
 * line-level chain that already exists in the schema:
 *
 *   PR line → Indent line (prLineId) → PO line (indentLineId) → GRN line (poLineId)
 *
 * `procurementByIndentLine` is the core (Indent detail uses it directly);
 * `procurementByPrLine` maps PR lines onto their indent lines first, then
 * aggregates the status back up. Every query is org-scoped through the
 * parent document relation.
 */

function emptyEntry(): LineProcurement {
  return {
    orderedQty: 0,
    receivedQty: 0,
    poStatus: "none",
    grnStatus: "none",
    poRefs: [],
    grnRefs: [],
  };
}

function deriveStatuses(e: LineProcurement): void {
  e.poStatus = e.poRefs.length > 0 ? "ordered" : "none";
  if (e.orderedQty > 0 && e.receivedQty >= e.orderedQty - 1e-6) {
    e.grnStatus = "received";
  } else if (e.receivedQty > 1e-6 || e.grnRefs.length > 0) {
    e.grnStatus = "partial";
  } else {
    e.grnStatus = "none";
  }
}

export async function procurementByIndentLine(
  orgId: string,
  indentLineIds: string[],
): Promise<Map<string, LineProcurement>> {
  const out = new Map<string, LineProcurement>();
  const ids = indentLineIds.filter(Boolean);
  if (ids.length === 0) return out;

  // PO lines that were raised against these indent lines.
  const poLines = await db.cnPurchaseOrderLine.findMany({
    where: { indentLineId: { in: ids }, po: { orgId } },
    select: {
      id: true,
      indentLineId: true,
      orderedQty: true,
      receivedQty: true,
      po: { select: { id: true, poNumber: true, status: true } },
    },
  });
  if (poLines.length === 0) return out;

  // Track which indent line each PO line belongs to so GRN rows (keyed
  // by poLineId) can be attributed back to the right requirement.
  const indentLineByPoLine = new Map<string, string>();
  for (const pl of poLines) {
    const key = pl.indentLineId;
    if (!key) continue;
    indentLineByPoLine.set(pl.id, key);
    const e = out.get(key) ?? emptyEntry();
    e.orderedQty += parseFloat(String(pl.orderedQty ?? 0)) || 0;
    e.receivedQty += parseFloat(String(pl.receivedQty ?? 0)) || 0;
    const po = pl.po;
    if (po && !e.poRefs.some((r) => r.id === po.id)) {
      e.poRefs.push({ id: po.id, poNumber: po.poNumber, status: po.status });
    }
    out.set(key, e);
  }

  // GRN lines against those PO lines — presence proves goods were
  // received (in full or in part); the qty split is already reflected
  // in the PO line's receivedQty above.
  const grnLines = await db.cnGRNLine.findMany({
    where: { poLineId: { in: poLines.map((l) => l.id) }, grn: { orgId } },
    select: {
      poLineId: true,
      grn: { select: { id: true, grnNumber: true, status: true } },
    },
  });
  for (const gl of grnLines) {
    const indentLineId = indentLineByPoLine.get(gl.poLineId);
    const grn = gl.grn;
    if (!indentLineId || !grn) continue;
    const e = out.get(indentLineId);
    if (!e) continue;
    if (!e.grnRefs.some((r) => r.id === grn.id)) {
      e.grnRefs.push({
        id: grn.id,
        grnNumber: grn.grnNumber,
        status: grn.status,
      });
    }
  }

  for (const e of out.values()) deriveStatuses(e);
  return out;
}

/**
 * PR-level aggregate for the requisitions LIST — one rolled-up status
 * per PR (has any PO been raised? has anything arrived?). Gathers all
 * PR lines for the given PRs, resolves each via `procurementByPrLine`,
 * then sums them back up to the parent PR.
 */
export async function procurementByPr(
  orgId: string,
  prIds: string[],
): Promise<Map<string, LineProcurement>> {
  const out = new Map<string, LineProcurement>();
  const ids = prIds.filter(Boolean);
  if (ids.length === 0) return out;

  const prLines = await db.cnPurchaseRequisitionLine.findMany({
    where: { prId: { in: ids }, pr: { orgId } },
    select: { id: true, prId: true },
  });
  if (prLines.length === 0) return out;

  const byPrLine = await procurementByPrLine(
    orgId,
    prLines.map((l) => l.id),
  );

  for (const pl of prLines) {
    const src = byPrLine.get(pl.id);
    if (!src) continue;
    const e = out.get(pl.prId) ?? emptyEntry();
    e.orderedQty += src.orderedQty;
    e.receivedQty += src.receivedQty;
    for (const r of src.poRefs) {
      if (!e.poRefs.some((x) => x.id === r.id)) e.poRefs.push(r);
    }
    for (const r of src.grnRefs) {
      if (!e.grnRefs.some((x) => x.id === r.id)) e.grnRefs.push(r);
    }
    out.set(pl.prId, e);
  }

  for (const e of out.values()) deriveStatuses(e);
  return out;
}

export async function procurementByPrLine(
  orgId: string,
  prLineIds: string[],
): Promise<Map<string, LineProcurement>> {
  const out = new Map<string, LineProcurement>();
  const ids = prLineIds.filter(Boolean);
  if (ids.length === 0) return out;

  // Indent lines raised for these PR lines.
  const indentLines = await db.cnPurchaseIndentLine.findMany({
    where: { prLineId: { in: ids }, indent: { orgId } },
    select: { id: true, prLineId: true },
  });
  if (indentLines.length === 0) return out;

  const byIndentLine = await procurementByIndentLine(
    orgId,
    indentLines.map((l) => l.id),
  );

  for (const il of indentLines) {
    if (!il.prLineId) continue;
    const src = byIndentLine.get(il.id);
    if (!src) continue;
    const e = out.get(il.prLineId) ?? emptyEntry();
    e.orderedQty += src.orderedQty;
    e.receivedQty += src.receivedQty;
    for (const r of src.poRefs) {
      if (!e.poRefs.some((x) => x.id === r.id)) e.poRefs.push(r);
    }
    for (const r of src.grnRefs) {
      if (!e.grnRefs.some((x) => x.id === r.id)) e.grnRefs.push(r);
    }
    out.set(il.prLineId, e);
  }

  for (const e of out.values()) deriveStatuses(e);
  return out;
}
