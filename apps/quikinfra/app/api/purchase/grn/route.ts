import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { nextProjectScopedDocNumber } from "@/lib/db/doc-number";
import {
  validateGRNCreation,
  validateGRNLines,
  validateGRNChallan,
  PurchaseValidationError,
  type POForGRN,
} from "@/lib/purchase-service";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { findPOById } from "@/lib/purchase/po-repository";
import { listGRNs, createGRN } from "@/lib/purchase/grn-repository";
import { db } from "@/lib/db";
import { parsePagination } from "@/lib/http/pagination";

/**
 * GRN API — Postgres-backed.
 *
 * P0 RULES ENFORCED:
 * - PO required and must be eligible (SOURCE_PO_REQUIRED, PO_NOT_ELIGIBLE_FOR_GRN)
 * - HARD REJECT over-receipt (OVER_RECEIPT_NOT_ALLOWED)
 * - Challan number, date, attachment mandatory (MISSING_REQUIRED_ATTACHMENT)
 * - Rejection qty cannot exceed received qty (INVALID_REJECTION_QTY)
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requirePurchaseAction("construction.grn", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const search = searchParams.get("search") ?? "";

  const p = parsePagination(req);
  const data = await listGRNs({
    orgId: ctx.orgId,
    projectIds: ctx.projectIds ?? null,
    status,
    search,
    ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
  });
  if (p.paginated) {
    return NextResponse.json({
      data,
      total: data.length,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: data.length === p.pageSize,
    });
  }
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx)
      return NextResponse.json(
        { error: "Unauthenticated" },
        { status: 401 },
      );
    if (!hasMatrixAction(ctx, "purchase.grn", "add")) {
      return envelopeErr("FORBIDDEN", `Action "add" not allowed for purchase.grn`, 403);
    }

    const body = await req.json();
    console.log("[grn.create] incoming body keys:", Object.keys(body));

    // Resolve PO — accept several aliases so the form shape from any
    // upstream drawer (main GRN list + PO-detail "Create GRN from PO")
    // both work. Prefer the Prisma repository so the new Postgres-
    // backed POs are honored; fall back to the legacy demo-store.
    const poIdOrNumber = String(
      body.poId ??
        body.sourcePoId ??
        body.sourcePoNumber ??
        body.poRef ??
        body.poNumber ??
        "",
    ).trim();

    // Normalise onto `sourcePoId` early so the downstream validator's
    // `!body.poId && !body.sourcePoId` check has something to bite on
    // even if the PO lookup later fails — we'd rather surface a clean
    // "PO not found" than the generic "GRN requires a source PO
    // reference" which implies the form field was empty.
    if (poIdOrNumber && !body.sourcePoId) {
      body.sourcePoId = poIdOrNumber;
    }
    let po: any = null;
    if (poIdOrNumber) {
      // Try by id first
      try {
        po = await findPOById(ctx.orgId, String(poIdOrNumber));
      } catch {
        /* noop */
      }
      // By poNumber
      if (!po) {
        try {
          const row = await (db as any).cnPurchaseOrder.findFirst({
            where: { orgId: ctx.orgId, poNumber: String(poIdOrNumber) },
            select: { id: true },
          });
          if (row?.id) po = await findPOById(ctx.orgId, row.id);
        } catch {
          /* noop */
        }
      }
    }
    // PO must be in Postgres now — no demo-store fallback.

    const poForGRN: POForGRN | null = po
      ? {
          id: po.id,
          status: po.status,
          lines: (po.lines ?? []).map((l: any) => {
            const poQty = parseFloat(
              l.poQty ?? l.quantity ?? l.orderedQty ?? "0",
            );
            const qtyReceived = parseFloat(
              l.qtyReceived ?? l.receivedQty ?? "0",
            );
            const qtyPending =
              l.qtyPending !== undefined
                ? parseFloat(l.qtyPending)
                : poQty - qtyReceived;
            return {
              lineId: l.lineId ?? l.id ?? "",
              itemId: l.itemId,
              poQty,
              qtyReceived,
              qtyPending,
            };
          }),
        }
      : null;

    body.sourcePoId = po?.id ?? poIdOrNumber;
    validateGRNCreation(body, poForGRN);
    validateGRNChallan(body);

    // Build GRN lines — HARD over-receipt check afterwards.
    const grnLines = (body.lines ?? po!.lines ?? []).map(
      (line: any, i: number) => {
        const poLine =
          poForGRN!.lines.find(
            (pl) =>
              pl.lineId === line.poLineId || pl.itemId === line.itemId,
          ) ?? null;
        const poQty = poLine?.poQty ?? 0;
        const prevReceived = poLine?.qtyReceived ?? 0;
        const qtyPending =
          poLine?.qtyPending ?? poQty - prevReceived;
        // Coerce empty / undefined / non-numeric inputs to 0. A bare
        // `parseFloat("")` returns `NaN`, and `NaN` propagates through
        // `Math.max` — which Prisma's Decimal column then rejects
        // with "invalid digit found in string". This extra guard
        // keeps the payload numeric under every input shape.
        const toNum = (raw: any): number => {
          const n = parseFloat(String(raw ?? "").trim());
          return Number.isFinite(n) ? n : 0;
        };
        const qtyReceived = toNum(line.qtyReceived ?? line.receivedQty);
        const qtyRejected = toNum(line.qtyRejected ?? line.rejectedQty);
        const qtyAccepted = Math.max(qtyReceived - qtyRejected, 0);
        return {
          i,
          poLineId: poLine?.lineId ?? line.poLineId ?? "",
          itemId: poLine?.itemId ?? line.itemId,
          uomCode: line.uomCode ?? "",
          unitRate: String(
            line.unitRate ??
              (po!.lines ?? []).find(
                (pl: any) =>
                  pl.itemId === (poLine?.itemId ?? line.itemId),
              )?.unitRate ??
              "0",
          ),
          qtyReceived: String(qtyReceived),
          qtyRejected: String(qtyRejected),
          qtyAccepted: String(qtyAccepted),
          batchNo: line.batchNo ?? null,
          condition: line.condition ?? "Good",
          testCertRef: line.testCertRef ?? null,
          remarks: line.remarks ?? null,
          qtyPendingAtCreation: qtyPending,
        };
      },
    );

    validateGRNLines(
      grnLines.map((l: any) => ({
        itemId: l.itemId,
        poLineId: l.poLineId,
        qtyReceived: l.qtyReceived,
        qtyRejected: l.qtyRejected,
      })),
      poForGRN!.lines,
    );

    const projectCode = po!.projectCode ?? "SITE";
    const grnNumber = await nextProjectScopedDocNumber({
      type: "grn",
      orgId: ctx.orgId,
      projectCode,
    });

    // locationId is NOT NULL in the schema. Storage Location is no longer
    // a required form field, so we resolve it through a fallback chain:
    //   1. user's picked storage location (form input)
    //   2. PO's declared delivery location
    //   3. first active location bound to the project
    //   4. first active location for the org (tenant-wide)
    // Only if the org has zero locations defined do we surface an error.
    let locationId: string | null =
      body.storageLocationId ?? po!.deliveryLocationId ?? null;

    if (!locationId) {
      const projectLocation = await db.cnLocation.findFirst({
        where: {
          orgId: ctx.orgId,
          projectId: po!.projectId,
          status: "active",
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      locationId = projectLocation?.id ?? null;
    }

    if (!locationId) {
      const orgLocation = await db.cnLocation.findFirst({
        where: {
          orgId: ctx.orgId,
          status: "active",
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      locationId = orgLocation?.id ?? null;
    }

    // Last resort: the org has zero locations defined. Rather than
    // blocking the user mid-flow with "go to Masters → Locations",
    // auto-provision a default "Main Store" the first time. The upsert
    // is keyed on (orgId, code) so concurrent GRN creates converge to
    // a single row instead of racing.
    if (!locationId) {
      const fallback = await db.cnLocation.upsert({
        where: {
          orgId_code: {
            orgId: ctx.orgId,
            code: "MAIN",
          },
        },
        create: {
          orgId: ctx.orgId,
          code: "MAIN",
          name: "Main Store",
          type: "warehouse",
          status: "active",
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        update: {},
        select: { id: true },
      });
      locationId = fallback.id;
    }

    const record = await createGRN({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      grnNumber,
      poId: po!.id,
      projectId: po!.projectId,
      vendorId: po!.vendorId,
      grnDate: body.grnDate ? new Date(body.grnDate) : new Date(),
      locationId,
      storageLocationId: body.storageLocationId ?? null,
      supplierInvoiceNo:
        body.supplierInvoiceNo ?? body.vendorInvoiceNo ?? null,
      supplierInvoiceDate: body.supplierInvoiceDate
        ? new Date(body.supplierInvoiceDate)
        : null,
      challanNo: body.challanNo ?? null,
      challanDate: body.challanDate
        ? new Date(body.challanDate)
        : null,
      receivedById: ctx.userId,
      receivedByName: body.receivedBy ?? null,
      vehicleNo: body.vehicleNo ?? null,
      ewayBillNo: body.ewayBillNo ?? null,
      approxInvoiceValue: body.invoiceValue ?? null,
      challanAttachment: body.challanAttachment ?? null,
      overallQualityStatus: body.overallQualityStatus ?? null,
      weighbridgeSlipNo: body.weighbridgeSlipNo ?? null,
      remarks: body.remarks ?? body.qualityRemarks ?? null,
      status: "draft",
      lines: grnLines.map((l: any) => ({
        poLineId: l.poLineId,
        itemId: l.itemId,
        uomCode: l.uomCode,
        unitRate: l.unitRate,
        receivedQty: l.qtyReceived,
        acceptedQty: l.qtyAccepted,
        rejectedQty: l.qtyRejected,
        batchNo: l.batchNo,
        condition: l.condition,
        testCertRef: l.testCertRef,
        remarks: l.remarks,
      })),
    });

    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err instanceof PurchaseValidationError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 },
      );
    }
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A GRN with this number already exists" },
        { status: 409 },
      );
    }
    console.error("[grn.create] failed:", err);
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
