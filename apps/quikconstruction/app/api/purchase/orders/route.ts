import { NextRequest, NextResponse } from "next/server";
import { buildPOLines } from "@/lib/purchase-engine";
import {
  nextProjectScopedDocNumber,
  withDocNumberRetry,
} from "@/lib/db/doc-number";
import {
  validatePOCreation,
  calculatePOFinance,
  PurchaseValidationError,
  type IndentForPO,
  type VendorForPO,
} from "@/lib/purchase-service";
import { getTenantContext } from "@/lib/auth/context";
import { findIndentById } from "@/lib/purchase/indent-repository";
import { findVendorsByIds } from "@/lib/masters/vendors-repository";
import { findProjectById } from "@/lib/masters/projects-repository";
import { listPOs, createPO } from "@/lib/purchase/po-repository";
import { db } from "@/lib/db/prisma";
import { parsePagination } from "@/lib/http/pagination";

/**
 * Purchase Order API — Postgres-backed.
 *
 * Standard flow P0 rules:
 * - sourceIndentId mandatory (SOURCE_INDENT_REQUIRED)
 * - Indent must be L3-approved (INDENT_NOT_APPROVED)
 * - PO line qty <= Indent qtyOpen (INDENT_QTY_EXCEEDED)
 * - Vendor not blacklisted (BLACKLISTED_VENDOR)
 * - Finance: materialValue + freight = poValueExGst (no double-counting)
 *
 * Urgent Local PO (`isUrgentLocal: true`) bypasses the indent /
 * RFQ chain — vendor + blacklist checks still run, source-doc
 * checks are skipped (see purchase-service.validatePOCreation).
 *
 * Multi-vendor: when `body.vendors` carries more than one vendor
 * row, the POST handler splits the submission into one PO per
 * vendor based on each row's `assignedItemIds`. Single-vendor
 * (legacy `body.vendorId` or one row in `body.vendors`) returns
 * the created record as before; multi-vendor returns
 * `{ multi, count, records }`.
 */

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const search = searchParams.get("search") ?? "";
    const projectId = searchParams.get("projectId") ?? undefined;
  
    const p = parsePagination(req);
    const data = await listPOs({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      projectIds: ctx.projectIds ?? null,
      projectId,
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

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[purchase/orders.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx)
      return NextResponse.json(
        { error: "Unauthenticated" },
        { status: 401 },
      );

    const body = await req.json();

    // Vendor list — drawer sends `vendors: [{ vendorId, email,
    // assignedItemIds: ["row-N"] }]`. When more than one vendor is
    // added, we split the submission into one PO per vendor below
    // (a PO is per-vendor by definition). Legacy single-vendor
    // callers that POST `body.vendorId` directly still work.
    const vendorRows: Array<{
      vendorId: string;
      email?: string | null;
      assignedItemIds?: string[];
    }> = Array.isArray(body.vendors)
      ? body.vendors
          .filter((v: any) => v?.vendorId)
          .map((v: any) => ({
            vendorId: String(v.vendorId),
            email: v.email ?? null,
            assignedItemIds: Array.isArray(v.assignedItemIds)
              ? v.assignedItemIds.map((x: any) => String(x))
              : [],
          }))
      : [];
    if (vendorRows.length === 0 && body.vendorId) {
      vendorRows.push({
        vendorId: String(body.vendorId),
        email: body.vendorEmail ?? null,
        assignedItemIds: [],
      });
    }
    if (vendorRows.length === 0) {
      return NextResponse.json(
        {
          error:
            "Vendor is required. Please add at least one vendor in the " +
            '"Vendors" section of the form.',
          code: "VENDOR_NOT_SELECTED",
        },
        { status: 400 },
      );
    }

    // Source RFQ → chain to its Indent so P0 validation keeps working.
    let sourceRfq: any = null;
    if (body.sourceRfqId) {
      try {
        sourceRfq = await (db as any).cnRfq.findFirst({
          where: { id: body.sourceRfqId, tenantId: ctx.tenantId },
          include: { lines: true },
        });
      } catch {
        /* fall through */
      }
      if (sourceRfq) {
        if (
          body.sourceIndentId &&
          sourceRfq.sourceIndentId &&
          body.sourceIndentId !== sourceRfq.sourceIndentId
        ) {
          return NextResponse.json(
            {
              error:
                "Source RFQ and Source Indent belong to different chains. " +
                "Pick an RFQ raised against the chosen Indent, or clear one of them.",
              code: "SOURCE_CHAIN_MISMATCH",
            },
            { status: 400 },
          );
        }
        body.sourceIndentId =
          body.sourceIndentId || sourceRfq.sourceIndentId;
        body.sourceRfqNumber =
          body.sourceRfqNumber ?? sourceRfq.rfqNumber ?? "";
        body.projectId = body.projectId || sourceRfq.projectId;
        if (!Array.isArray(body.lines) || body.lines.length === 0) {
          body.lines = (sourceRfq.lines ?? []).map((l: any) => ({
            itemId: l.itemId,
            poQty: l.quantity ?? "0",
            unitRate: l.estimatedRate ?? "0",
          }));
        }
      }
    }

    if (!body.projectId)
      return NextResponse.json(
        { error: "Project is required" },
        { status: 400 },
      );

    // Resolve indent for validation against Postgres. Indent rows have
    // been on `purchase_indents` since the early Phase-2 migration —
    // there is no longer a demo-store fallback to hide a missing row.
    let indent: any = null;
    if (body.sourceIndentId) {
      indent = await findIndentById(ctx.tenantId, body.sourceIndentId);
    }
    const indentForPO: IndentForPO | null = indent
      ? {
          id: indent.id,
          status: indent.status,
          lines: (indent.lines ?? []).map((l: any) => ({
            lineId: l.lineId ?? l.id,
            itemId: l.itemId,
            qtyRequested: parseFloat(l.qtyRequested ?? l.quantity ?? "0"),
            qtyOpen: parseFloat(
              l.qtyOpen ?? l.qtyRequested ?? l.quantity ?? "0",
            ),
          })),
        }
      : null;

    // Project lookup — same project across every per-vendor PO.
    const project = await findProjectById(ctx.tenantId, body.projectId);
    if (!project)
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    const projectCode = project.code ?? "SITE";

    // Pre-resolve item masters across the FULL line list (not just
    // one vendor's slice) so each per-vendor PO can backfill
    // itemName/itemCode/uomCode without re-hitting Prisma.
    const allBodyLines: any[] = Array.isArray(body.lines) ? body.lines : [];
    const itemIds = Array.from(
      new Set<string>(
        allBodyLines
          .map((l: any) => l?.itemId)
          .filter(
            (x: any): x is string => typeof x === "string" && x.length > 0,
          ),
      ),
    );
    let itemMasterById = new Map<string, any>();
    if (itemIds.length) {
      try {
        const rows = await (db as any).cnItem.findMany({
          where: { id: { in: itemIds } },
          include: { uom: { select: { id: true, code: true } } },
        });
        itemMasterById = new Map<string, any>(
          rows.map((r: any) => [
            r.id,
            {
              id: r.id,
              code: r.code,
              name: r.name,
              uomId: r.uom?.id ?? r.uomId ?? null,
              uomCode: r.uom?.code ?? "",
              hsnCode: r.hsnCode ?? "",
              gstRate: r.gstRate?.toString?.() ?? null,
            },
          ]),
        );
      } catch (e) {
        console.warn(
          "[po.create] Prisma item lookup failed:",
          (e as any)?.message ?? e,
        );
      }
    }

    // T&C snapshot — same body stamped on every per-vendor PO.
    let termsAndConditions = body.termsAndConditions ?? "";
    if (!termsAndConditions && body.termsTemplateId) {
      try {
        const tpl = await (db as any).cnTermsCondition.findFirst({
          where: { id: body.termsTemplateId, tenantId: ctx.tenantId },
          select: { body: true },
        });
        if (tpl?.body) termsAndConditions = String(tpl.body);
      } catch {
        /* fall through */
      }
    }

    // Buyer-side contacts flattened from the drawer's multi-row
    // "Contact Persons" section. Same list goes on every PO.
    const contactsList = Array.isArray(body.contacts) ? body.contacts : [];
    const contactPerson =
      contactsList
        .map((c: any) => String(c?.name ?? "").trim())
        .filter(Boolean)
        .join(", ") ||
      (typeof body.contactPerson === "string"
        ? body.contactPerson.trim()
        : "") ||
      null;
    const contactMobile =
      contactsList
        .map((c: any) => String(c?.mobile ?? "").replace(/[^\d]/g, ""))
        .filter(Boolean)
        .join(", ") ||
      (typeof body.contactMobile === "string"
        ? body.contactMobile.replace(/[^\d]/g, "")
        : "") ||
      null;

    // Resolve every selected vendor in one Prisma round-trip.
    let vendorMap = new Map<string, any>();
    try {
      vendorMap = await findVendorsByIds(
        ctx.tenantId,
        vendorRows.map((v) => v.vendorId),
      );
    } catch (e) {
      console.warn(
        "[po.create] Prisma vendor lookup failed, falling back to demo-store:",
        (e as any)?.message ?? e,
      );
    }

    // Pick the slice of body.lines belonging to a given vendor row.
    // The drawer encodes per-vendor item assignment as `row-N` keys
    // matching the ordinal of each primary line. Empty array means
    // "include every line" — same default the RFQ vendor picker uses
    // and what single-vendor POs always send.
    const linesForVendor = (vRow: (typeof vendorRows)[number]) => {
      const ids = vRow.assignedItemIds ?? [];
      if (ids.length === 0) return allBodyLines;
      const idxSet = new Set<number>();
      for (const k of ids) {
        const n = parseInt(String(k).replace(/^row-/, ""), 10);
        if (!Number.isNaN(n)) idxSet.add(n);
      }
      return allBodyLines.filter((_: any, idx: number) => idxSet.has(idx));
    };

    // ─── Per-vendor PO creation loop ─────────────────────────────
    // A PO is per-vendor by definition. Multi-vendor submissions
    // split into N sibling POs — each carries that vendor's assigned
    // items and gets its own poNumber, finance roll-up, and createPO
    // call. Project / source-doc / T&C / contacts / urgent flag are
    // shared across all of them.
    const createdRecords: any[] = [];
    const freightCharges = parseFloat(body.freightCharges ?? "0");
    for (const vRow of vendorRows) {
      const vendorLines = linesForVendor(vRow);
      if (vendorLines.length === 0) continue; // no items assigned to this vendor

      // Vendor lookup is Prisma-only — vendors have been on
      // `vendors` since the early Phase-2 migration, so a missing
      // vendor here means the row doesn't exist (404 below).
      const vendorRaw: any = vendorMap.get(vRow.vendorId) ?? null;
      const vendorForPO: VendorForPO | null = vendorRaw
        ? {
            id: vendorRaw.id,
            status: vendorRaw.status,
            isBlacklisted:
              vendorRaw.isBlacklisted === true ||
              vendorRaw.status === "blacklisted",
          }
        : null;

      const subBody = {
        ...body,
        vendorId: vRow.vendorId,
        vendorEmail: vRow.email ?? null,
        lines: vendorLines,
      };

      // P0 validation per sub-PO. Indent qtyOpen check applies to
      // the SLICE of lines this vendor is getting — when splitting,
      // the buyer must allocate qty across vendors using the
      // Assign-items picker so the cumulative split stays inside
      // indent capacity.
      validatePOCreation(subBody, indentForPO, vendorForPO);

      const vendor = vendorRaw!;

      const linesWithMasters = vendorLines.map((l: any) => {
        const master = itemMasterById.get(l.itemId);
        if (!master) return l;
        return {
          ...l,
          itemCode: l.itemCode ?? master.code,
          itemName: l.itemName ?? master.name,
          uomId: l.uomId ?? master.uomId,
          uomCode: l.uomCode ?? master.uomCode,
          hsnCode: l.hsnCode ?? master.hsnCode,
        };
      });
      const lines = buildPOLines(linesWithMasters, vendor, project);
      for (const pol of lines as any[]) {
        const master = itemMasterById.get(pol.itemId);
        if (master) {
          if (!pol.itemName) pol.itemName = master.name;
          if (!pol.itemCode) pol.itemCode = master.code;
          if (!pol.uomCode) pol.uomCode = master.uomCode;
          if (!pol.uomId) pol.uomId = master.uomId;
        }
      }

      const lineCalcs = lines.map((l: any) => ({
        qty: parseFloat(l.poQty ?? "0"),
        unitRate: parseFloat(l.unitRate ?? "0"),
        discountPct: parseFloat(l.discount ?? "0"),
        gstRate: parseFloat(l.gstRate ?? "0"),
        igstRate:
          parseFloat(l.igstAmount ?? "0") > 0
            ? parseFloat(l.gstRate ?? "0")
            : 0,
        cgstRate:
          parseFloat(l.cgstAmount ?? "0") > 0
            ? parseFloat(l.gstRate ?? "0") / 2
            : 0,
        sgstRate:
          parseFloat(l.sgstAmount ?? "0") > 0
            ? parseFloat(l.gstRate ?? "0") / 2
            : 0,
      }));
      const finance = calculatePOFinance(lineCalcs, freightCharges);

      // "Net 30" → 30 — vendor's master payment terms is the fallback
      // when the buyer didn't override on the form. Resolved per
      // vendor since each may have a different term.
      let paymentTermsDays: number | null = null;
      const ptRaw = body.paymentTerms ?? vendor.paymentTerms ?? "";
      const ptMatch = /(\d+)/.exec(String(ptRaw));
      if (ptMatch) paymentTermsDays = parseInt(ptMatch[1], 10);

      // Wrap createPO in a doc-number retry — under concurrent submissions
      // (two users hitting the endpoint at once), both can pick the same
      // `max + 1`. The unique constraint (`tenantId, orgId, poNumber`) makes
      // the second one fail P2002; the retry regenerates and tries again.
      const record = await withDocNumberRetry(
        () =>
          nextProjectScopedDocNumber({
            type: "po",
            tenantId: ctx.tenantId,
            orgId: ctx.orgId,
            projectCode,
          }),
        (poNumber) => createPO({
        tenantId: ctx.tenantId,
        orgId: ctx.orgId,
        createdBy: ctx.userId,
        poNumber,
        projectId: body.projectId,
        vendorId: vRow.vendorId,
        indentId: body.sourceIndentId ?? null,
        rfqId: sourceRfq?.id ?? body.sourceRfqId ?? null,
        poDate: body.poDate ? new Date(body.poDate) : new Date(),
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        deliveryAddress:
          body.deliveryAddress ?? (project as any).address ?? null,
        paymentTermsDays,
        termsConditionId: body.termsTemplateId ?? null,
        termsAndConditions,
        remarks: body.remarks ?? null,
        isUrgentLocal:
          body.isUrgentLocal === true || body.isUrgentLocal === "true",
        urgentLocalReason: body.urgentLocalReason ?? null,
        purpose: body.purpose ?? null,
        otherCharges: body.otherCharges ?? null,
        contactPerson,
        contactMobile,
        subtotal: String(finance.materialValueExGst),
        freightCharges: String(finance.freightCharges),
        taxAmount: String(finance.totalGstAmount),
        totalIGST: String(finance.totalIGST),
        totalCGST: String(finance.totalCGST),
        totalSGST: String(finance.totalSGST),
        totalAmount: String(finance.poTotalIncGst),
        status: "draft",
        lines: lines.map((l: any) => ({
          indentLineId: l.sourceIndentLineId ?? null,
          itemId: l.itemId,
          itemCode: l.itemCode,
          itemName: l.itemName,
          uomId: l.uomId ?? null,
          uomCode: l.uomCode,
          hsnCode: l.hsnCode,
          specification: l.specification ?? null,
          poQty: l.poQty,
          unitRate: l.unitRate,
          discount: l.discount ?? "0",
          gstRate: l.gstRate,
          gstType: l.gstType,
          igstAmount: l.igstAmount ?? "0",
          cgstAmount: l.cgstAmount ?? "0",
          sgstAmount: l.sgstAmount ?? "0",
          amount: l.amount,
          taxAmount: l.taxAmount ?? "0",
          totalAmount: l.totalAmount,
          isRCM: !!l.isRCM,
        })),
        }),
        "poNumber",
      );
      createdRecords.push(record);
    }

    if (createdRecords.length === 0) {
      return NextResponse.json(
        {
          error:
            "No PO lines were assigned to any vendor. Use the per-row " +
            '"Assign items" picker to allocate items, or leave it empty ' +
            "to send all items to a single vendor.",
          code: "NO_LINES_ASSIGNED",
        },
        { status: 400 },
      );
    }
    if (createdRecords.length === 1) {
      return NextResponse.json(createdRecords[0], { status: 201 });
    }
    return NextResponse.json(
      {
        multi: true,
        count: createdRecords.length,
        records: createdRecords,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (err instanceof PurchaseValidationError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 400 },
      );
    }
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A PO with this number already exists" },
        { status: 409 },
      );
    }
    console.error("[po.create] failed:", err);
    return NextResponse.json(
      { error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
