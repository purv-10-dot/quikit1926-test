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

  const rab = await db.cnRunningAccountBill.findFirst({
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

  const lines = Array.isArray(rab.lines) ? rab.lines : [];

  const uomIds = Array.from(
    new Set(lines.map((l) => l.uomId).filter(Boolean)),
  ) as string[];
  const uoms = uomIds.length
    ? await db.cnUOM.findMany({
        where: { id: { in: uomIds } },
        select: { id: true, code: true },
      })
    : [];
  const uomById = new Map<string, string>();
  for (const u of uoms) uomById.set(u.id, u.code);

  // Resolve each line's BOQ number (e.g. "A.1.1"). Lines store the BOQ
  // item's internal id, but the bill must display the human BOQ number.
  const boqItemIds = Array.from(
    new Set(lines.map((l) => l.boqItemId).filter(Boolean)),
  ) as string[];
  const boqRows = boqItemIds.length
    ? await db.cnBOQItemV2.findMany({
        where: { id: { in: boqItemIds }, orgId: ctx.orgId },
        select: { id: true, boqNo: true },
      })
    : [];
  const boqNoById = new Map<string, string>();
  for (const b of boqRows) boqNoById.set(b.id, b.boqNo);

  // The tenant company that issues the bill — right-hand info box.
  const company = await db.cnCompany
    .findFirst({
      where: { orgId: ctx.orgId, status: "active" },
      orderBy: { createdAt: "asc" },
      select: { name: true, gstin: true, address: true, city: true, state: true, pincode: true },
    })
    .catch(() => null);
  const issuer = company
    ? {
        name: company.name,
        gstin: company.gstin,
        address: [company.address, company.city, [company.state, company.pincode].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", "),
      }
    : undefined;

  // Terms & Conditions source:
  //   1. ?termsId=none → suppress the section entirely ("No terms").
  //   2. ?termsId=<id> → that specific master entry (selectable).
  //   3. otherwise → the org's default "general" T&C from the Terms master
  //      (Masters → Terms & Conditions).
  //   4. otherwise → the built-in default RA-bill terms in the generator.
  let termsBody: string | null = null;
  let termsTitle: string | null = null;
  const termsId = new URL(req.url).searchParams.get("termsId");
  const hideTerms = termsId === "none";
  if (!hideTerms) {
    try {
      const row = termsId
        ? await db.cnTermsCondition.findFirst({
            where: { id: termsId, orgId: ctx.orgId },
            select: { body: true, title: true },
          })
        : await db.cnTermsCondition.findFirst({
            where: { orgId: ctx.orgId, status: "active", applicableTo: "general" },
            orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
            select: { body: true, title: true },
          });
      termsBody = row?.body ?? null;
      termsTitle = row?.title ?? null;
    } catch {
      termsBody = null;
    }
  }

  const items: RABillPdfLine[] = lines.map((l) => {
    const qty = parseFloat(String(l.currentQty ?? "0")) || 0;
    const rate = parseFloat(String(l.rate ?? "0")) || 0;
    const amount = parseFloat(String(l.currentAmount ?? "0")) || qty * rate;
    const cumQty = parseFloat(String(l.cumulativeQty ?? "0")) || qty;
    const cumAmount = parseFloat(String(l.cumulativeAmount ?? "0")) || cumQty * rate;
    return {
      itemCode: boqNoById.get(l.boqItemId) ?? String(l.boqItemId ?? ""),
      description: String(l.description ?? ""),
      uom: l.uomId ? uomById.get(l.uomId) ?? "" : "",
      quantity: qty,
      cumulativeQty: cumQty,
      rate,
      amount,
      cumulativeAmount: cumAmount,
    };
  });

  const numOr = (v: unknown) => parseFloat(String(v ?? "0")) || 0;

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
    issuer,
    items,
    amounts: {
      gross: numOr(rab.grossBillAmount) || numOr(rab.currentBillAmount),
      cgstAmount: numOr(rab.cgstAmount),
      sgstAmount: numOr(rab.sgstAmount),
      igstAmount: numOr(rab.igstAmount),
      retentionPercent: numOr(rab.retentionPercent),
      retentionAmount: numOr(rab.retentionAmount),
      tdsRate: numOr(rab.tdsRate),
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
    termsTitle,
    hideTerms,
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
