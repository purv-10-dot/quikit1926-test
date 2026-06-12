import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateRABillPdf, type RABillPdfLine } from "@/lib/projects/rab-pdf";

/**
 * GET /api/projects/rab/[id]/preview/pdf
 *
 * Streams the RA Bill PDF (letterhead + billed-quantity table + deduction
 * waterfall + T&C) as `application/pdf`, inline. Terms are selectable via
 * `?termsId=` (falls back to the built-in default terms).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.rab", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const rab = await (db as any).cnRunningAccountBill.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    include: {
      lines: true,
      project: { select: { id: true, name: true } },
      workOrder: { select: { id: true, woNumber: true } },
      contractor: {
        select: {
          id: true, name: true, gstin: true, address: true,
          phone: true, email: true, contactPerson: true,
        },
      },
    },
  });
  if (!rab) {
    return NextResponse.json({ error: "RAB not found" }, { status: 404 });
  }

  const lines: any[] = Array.isArray(rab.lines) ? rab.lines : [];

  const uomIds = Array.from(
    new Set(lines.map((l: any) => l.uomId).filter(Boolean)),
  ) as string[];
  const uoms = uomIds.length
    ? await (db as any).cnUOM.findMany({
        where: { id: { in: uomIds } },
        select: { id: true, code: true },
      })
    : [];
  const uomById = new Map<string, string>();
  for (const u of uoms) uomById.set(u.id, u.code);

  // Resolve each line's BOQ number (e.g. "A.1.1"). Lines store the BOQ
  // item's internal id, but the bill must display the human BOQ number.
  const boqItemIds = Array.from(
    new Set(lines.map((l: any) => l.boqItemId).filter(Boolean)),
  ) as string[];
  const boqRows = boqItemIds.length
    ? await (db as any).cnBOQItemV2.findMany({
        where: { id: { in: boqItemIds }, orgId: ctx.orgId },
        select: { id: true, boqNo: true },
      })
    : [];
  const boqNoById = new Map<string, string>();
  for (const b of boqRows) boqNoById.set(b.id, b.boqNo);

  // Terms & Conditions source:
  //   1. ?termsId= → that specific master entry (selectable).
  //   2. otherwise → the org's default "general" T&C from the Terms master
  //      (Masters → Terms & Conditions).
  //   3. otherwise → the built-in default RA-bill terms in the generator.
  let termsBody: string | null = null;
  const termsId = new URL(req.url).searchParams.get("termsId");
  try {
    const row = termsId
      ? await (db as any).cnTermsCondition.findFirst({
          where: { id: termsId, orgId: ctx.orgId },
          select: { body: true },
        })
      : await (db as any).cnTermsCondition.findFirst({
          where: { orgId: ctx.orgId, status: "active", applicableTo: "general" },
          orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
          select: { body: true },
        });
    termsBody = row?.body ?? null;
  } catch {
    termsBody = null;
  }

  const items: RABillPdfLine[] = lines.map((l: any) => {
    const qty = parseFloat(String(l.currentQty ?? "0")) || 0;
    const rate = parseFloat(String(l.rate ?? "0")) || 0;
    const amount = parseFloat(String(l.currentAmount ?? "0")) || qty * rate;
    return {
      itemCode: boqNoById.get(l.boqItemId) ?? String(l.boqItemId ?? ""),
      description: String(l.description ?? ""),
      uom: l.uomId ? uomById.get(l.uomId) ?? "" : "",
      quantity: qty,
      rate,
      amount,
    };
  });

  const numOr = (v: any) => parseFloat(String(v ?? "0")) || 0;

  const pdf = await generateRABillPdf({
    rab: {
      rabNumber: rab.rabNumber ?? "",
      rabDate: rab.createdAt?.toISOString?.().slice(0, 10) ?? null,
      billType: rab.billType ?? "ra_bill",
      projectName: rab.project?.name ?? null,
      woNumber: rab.workOrder?.woNumber ?? null,
      periodFrom: rab.billPeriodFrom?.toISOString?.().slice(0, 10) ?? null,
      periodTo: rab.billPeriodTo?.toISOString?.().slice(0, 10) ?? null,
      status: rab.status ?? "draft",
    },
    contractor: {
      name: rab.contractor?.name ?? "",
      gstin: rab.contractor?.gstin ?? null,
      address: rab.contractor?.address ?? null,
      phone: rab.contractor?.phone ?? null,
      email: rab.contractor?.email ?? null,
      contactPerson: rab.contractor?.contactPerson ?? null,
    },
    items,
    amounts: {
      gross: numOr(rab.grossBillAmount) || numOr(rab.currentBillAmount),
      cgstAmount: numOr(rab.cgstAmount),
      sgstAmount: numOr(rab.sgstAmount),
      igstAmount: numOr(rab.igstAmount),
      retentionAmount: numOr(rab.retentionAmount),
      tdsAmount: numOr(rab.tdsAmount),
      mobilisationRecovery: numOr(rab.mobilisationRecovery),
      liquidatedDamages: numOr(rab.liquidatedDamages),
      labourCess: numOr(rab.labourCess),
      otherDeductions: numOr(rab.otherDeductions),
      netPayable: numOr(rab.netPayable),
      previousBillAmount: numOr(rab.previousBillAmount),
      cumulativeAmount: numOr(rab.cumulativeAmount),
    },
    termsBody,
  });

  const safeNo = String(rab.rabNumber ?? "rab").replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNo}-preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
