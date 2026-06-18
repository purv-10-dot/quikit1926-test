/**
 * Purchase Engine — pure helpers for shaping MR / PO line records and
 * computing per-line GST.
 *
 * Historically these helpers looked up item / UOM / vendor / GST masters
 * from an in-memory demo store. Masters now live in Postgres and the
 * callers either pre-merge master data into each line BEFORE calling
 * (see `app/api/purchase/orders/route.ts` line composition) or rehydrate
 * the line via repository joins on read. The functions therefore treat
 * any unknown field on the input line as empty/zero rather than
 * synthesising it from the demo store.
 *
 * Doc-number generation, vendor blacklist checks, and stock-availability
 * lookups have moved to:
 *   - `src/lib/db/doc-number.ts`           (generateDocNumber, nextProjectScopedDocNumber)
 *   - `src/lib/masters/vendors-repository` (isVendorBlacklisted)
 *
 * Stock check is currently a no-op stub: the procurement chain does not
 * read live `cnItem.currentStock` here. If/when the requisitions flow
 * starts gating on real stock, route this through `cn_stock_balances`
 * inside the repository, not back into a sync helper.
 */

// ─── GST Computation ────────────────────────────────────────────────
//
// `item` is expected to carry `hsnCode` and (optionally) `gstRate` —
// the calling route should merge `cnItem` master data into each line
// before calling. `company` is an optional fallback for `project.state`.
interface GstItem {
  hsnCode?: string | null;
  igstRate?: number | string | null;
  gstRate?: number | string | null;
  isRcm?: boolean | string | null;
}
interface GstVendor {
  state?: string | null;
  gstType?: string | null;
  gstRegistrationType?: string | null;
}
interface GstParty {
  state?: string | null;
}
interface MRLineInput {
  itemId?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  qtyRequired?: number | string | null;
  quantity?: number | string | null;
  estimatedRate?: number | string | null;
  woRef?: string | null;
  boqItemRef?: string | null;
  priority?: string | null;
  specification?: string | null;
}
export interface POLineInput extends GstItem {
  lineId?: string | null;
  indentLineId?: string | null;
  itemId?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  uomCode?: string | null;
  uomId?: string | null;
  poQty?: number | string | null;
  qtyRequested?: number | string | null;
  quantity?: number | string | null;
  unitRate?: number | string | null;
  estimatedRate?: number | string | null;
  deliveryLocationId?: string | null;
}

export function computeGST(
  item: GstItem,
  vendor: GstVendor,
  project: GstParty | null,
  company: GstParty | null = null,
) {
  const hsnCode = item?.hsnCode ?? "";
  const igstRate = parseFloat(String(
    item?.igstRate ?? item?.gstRate ?? "0",
  ));
  const cgstRate = igstRate / 2;
  const sgstRate = igstRate / 2;

  const siteState = project?.state ?? company?.state ?? "";
  const vendorState = vendor?.state ?? "";
  const isInterState =
    siteState &&
    vendorState &&
    siteState.toLowerCase() !== vendorState.toLowerCase();

  const isRCM =
    (item?.isRcm === true || item?.isRcm === "true") &&
    (vendor?.gstType === "Unregistered" ||
      vendor?.gstRegistrationType === "Unregistered");

  return {
    hsnCode,
    igstRate: isInterState ? igstRate : 0,
    cgstRate: isInterState ? 0 : cgstRate,
    sgstRate: isInterState ? 0 : sgstRate,
    gstType: isInterState ? "IGST" : "CGST+SGST",
    isRCM,
  };
}

// ─── MR Line Builder ────────────────────────────────────────────────

export function buildMRLines(lines: MRLineInput[], _projectId: string) {
  return lines.map((line, i) => {
    const qtyRequired = parseFloat(String(line.qtyRequired ?? line.quantity ?? "0"));

    // Stock check is no longer derived from demo-store. The repository
    // re-hydrates `cnItem.currentStock` on read, and the requisitions
    // flow does not gate on stock at create time. Mark every line
    // INSUFFICIENT so the existing UI labels stay consistent — when a
    // real stock-check service lands, return the actual status here.
    const stockCheckStatus: "AVAILABLE" | "PARTIAL" | "INSUFFICIENT" = "INSUFFICIENT";

    const resolvedUomId = line.uomId ?? "";
    const resolvedUomCode = line.uomCode ?? "";

    const userRateRaw = line.estimatedRate;
    const hasUserRate =
      userRateRaw !== undefined &&
      userRateRaw !== null &&
      String(userRateRaw).trim() !== "";
    const rateNum = hasUserRate ? parseFloat(String(userRateRaw)) || 0 : 0;

    return {
      lineId: `mrl-${Date.now()}-${i}`,
      itemId: line.itemId ?? "",
      itemCode: line.itemCode ?? "",
      itemName: line.itemName ?? "",
      itemDescription: line.itemName ?? "",
      uomId: resolvedUomId,
      uomCode: resolvedUomCode,
      qtyRequired: String(qtyRequired),
      quantity: String(qtyRequired), // alias for UIs that read "quantity"
      currentStock: "0",
      availableStock: "0",
      stockCheckStatus,
      estimatedRate: String(rateNum),
      estimatedAmount: String(qtyRequired * rateNum),
      woRef: line.woRef ?? "",
      boqItemRef: line.boqItemRef ?? "",
      priority: line.priority ?? "MEDIUM",
      specification: line.specification ?? "",
      lineStatus: "open", // open → issued_from_stock | in_indent_process | served
    };
  });
}

// ─── PO Line Builder (from Indent) ──────────────────────────────────
//
// Callers should pre-merge `cnItem` master fields onto each input line
// (`itemCode`, `itemName`, `uomCode`, `hsnCode`, `gstRate` if known) so
// `computeGST` and the output have the data they need. `company` is
// optional — used by `computeGST` as a fallback for `project.state`
// when the project row has no state set.
export function buildPOLines(
  indentLines: POLineInput[],
  vendor: GstVendor,
  project: GstParty | null,
  company: GstParty | null = null,
) {
  return indentLines.map((line, i) => {
    const qty = parseFloat(String(
      line.poQty ?? line.qtyRequested ?? line.quantity ?? "0",
    ));
    const rate = parseFloat(String(line.unitRate ?? line.estimatedRate ?? "0"));
    const gst = computeGST(line, vendor, project, company);
    const lineValueExGST = qty * rate;
    const igstAmount = (lineValueExGST * gst.igstRate) / 100;
    const cgstAmount = (lineValueExGST * gst.cgstRate) / 100;
    const sgstAmount = (lineValueExGST * gst.sgstRate) / 100;
    const totalGST = igstAmount + cgstAmount + sgstAmount;

    return {
      lineId: `pol-${Date.now()}-${i}`,
      indentLineId: line.lineId ?? line.indentLineId ?? "",
      itemId: line.itemId,
      itemCode: line.itemCode ?? "",
      itemName: line.itemName ?? "",
      uomCode: line.uomCode ?? "",
      hsnCode: line.hsnCode ?? gst.hsnCode,
      poQty: String(qty),
      unitRate: String(rate),
      discount: "0",
      lineValueExGST: String(Math.round(lineValueExGST * 100) / 100),
      gstType: gst.gstType,
      gstRate: String(gst.igstRate || gst.cgstRate + gst.sgstRate),
      igstAmount: String(Math.round(igstAmount * 100) / 100),
      cgstAmount: String(Math.round(cgstAmount * 100) / 100),
      sgstAmount: String(Math.round(sgstAmount * 100) / 100),
      totalGST: String(Math.round(totalGST * 100) / 100),
      lineValueIncGST: String(
        Math.round((lineValueExGST + totalGST) * 100) / 100,
      ),
      deliveryLocationId: line.deliveryLocationId ?? "",
      qtyReceived: "0",
      qtyPending: String(qty),
      isRCM: gst.isRCM,
    };
  });
}
