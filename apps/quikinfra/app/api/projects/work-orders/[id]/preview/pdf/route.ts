import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import {
  generateWorkOrderPdf,
  type WorkOrderPdfLine,
} from "@/lib/projects/work-order-pdf";

/**
 * GET /api/projects/work-orders/[id]/preview/pdf
 *
 * Streams the Work Order PDF (letterhead + BOQ scope table + grand
 * total + T&C) as `application/pdf` with an `inline` disposition so
 * the client can open it in a new tab. 404 if the WO has no scope.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction(
    "construction.wo",
    "view",
  );
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const wo = await db.cnWorkOrder.findFirst({
    where: { id: params.id, orgId: ctx.orgId },
    include: {
      lines: true,
      project: { select: { id: true, name: true, code: true } },
      contractor: {
        select: {
          id: true,
          name: true,
          gstin: true,
          address: true,
          phone: true,
          email: true,
          contactPerson: true,
        },
      },
    },
  });
  if (!wo) {
    return NextResponse.json({ error: "Work order not found" }, { status: 404 });
  }

  const lines = Array.isArray(wo.lines) ? wo.lines : [];
  if (lines.length === 0) {
    return NextResponse.json(
      { error: "Work order has no scope items to preview" },
      { status: 404 },
    );
  }

  // Labour lines print the category name, so resolve the ids in one batch.
  const labourCategoryIds = Array.from(
    new Set(lines.map((l) => l.labourCategoryId).filter(Boolean)),
  ) as string[];
  const labourCategories = labourCategoryIds.length
    ? await db.cnLabourCategory.findMany({
        where: { id: { in: labourCategoryIds }, orgId: ctx.orgId },
        select: { id: true, name: true, skillLevel: true },
      })
    : [];
  const labourCategoryById = new Map(
    labourCategories.map((c) => [
      c.id,
      // Skill level is what distinguishes two same-named categories on a rate
      // sheet ("Mason — Skilled" vs "Mason — Highly Skilled"), so show both.
      c.skillLevel
        ? `${c.name} — ${c.skillLevel.replace(/_/g, " ").toLowerCase()}`
        : c.name,
    ]),
  );

  let termsBody: string | null = null;
  const woTermsConditionId = (wo as { termsConditionId?: string | null })
    .termsConditionId;
  if (woTermsConditionId) {
    try {
      const row = await db.cnTermsCondition.findFirst({
        where: { id: woTermsConditionId, orgId: ctx.orgId },
        select: { body: true },
      });
      termsBody = row?.body ?? null;
    } catch {
      termsBody = null;
    }
  }

  const items: WorkOrderPdfLine[] = lines.map((l) => {
    const qty = parseFloat(String(l.quantity ?? "0")) || 0;
    const rate = parseFloat(String(l.negotiatedRate ?? "0")) || 0;
    const amount = parseFloat(String(l.amount ?? "0")) || qty * rate;
    return {
      itemCode: String(l.boqItemId ?? ""),
      // Labour lines carry the trade in `activityName`; fall back to it so the
      // description column is never empty on a labour work order.
      description: String(l.description || l.activityName || ""),
      quantity: qty,
      rate,
      amount,
      labourCategory: l.labourCategoryId
        ? labourCategoryById.get(l.labourCategoryId) ?? null
        : null,
      labourCount:
        l.labourCount != null ? parseFloat(String(l.labourCount)) || 0 : null,
    };
  });

  const grandTotal =
    parseFloat(String(wo.totalAmount ?? "0")) ||
    items.reduce((s, it) => s + it.amount, 0);

  const pdf = await generateWorkOrderPdf({
    wo: {
      woNumber: wo.woNumber ?? "",
      woDate: wo.createdAt?.toISOString?.().slice(0, 10) ?? null,
      projectName: wo.project?.name ?? null,
      title: wo.title ?? null,
      type: "Work Order",
      workType: wo.workType ?? null,
      plannedStart: wo.startDate?.toISOString?.().slice(0, 10) ?? null,
      plannedEnd: wo.endDate?.toISOString?.().slice(0, 10) ?? null,
    },
    contractor: {
      name: wo.contractor?.name ?? "",
      gstin: wo.contractor?.gstin ?? null,
      address: wo.contractor?.address ?? null,
      phone: wo.contractor?.phone ?? null,
      email: wo.contractor?.email ?? null,
      contactPerson: wo.contractor?.contactPerson ?? null,
    },
    items,
    grandTotal,
    termsBody,
  });

  const safeNo = String(wo.woNumber ?? "wo").replace(/[^A-Za-z0-9_-]+/g, "_");
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNo}-preview.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
