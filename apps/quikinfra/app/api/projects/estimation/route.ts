import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { estimationCreateSchema } from "@/lib/schemas/projects-4b";

const withOrgAuth = withOrgAuthForModule("projects");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const list = await db.cnEstimation.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(projectId ? { projectId } : {}) },
    include: {
      project: { select: { id: true, name: true, code: true } },
      _count: { select: { items: true } },
    },
    orderBy: { estimationDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
}, { permission: { resource: "construction.estimation", action: "view" } });

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = estimationCreateSchema.parse(body);
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  const dup = await db.cnEstimation.findFirst({ where: { orgId, estimationNumber: input.estimationNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Estimation '${input.estimationNumber}' already exists` }, { status: 409 });

  let subtotal = 0, taxAmount = 0;
  for (const it of input.items) {
    if (it.kind === "group") continue;
    const amt = (it.quantity ?? 0) * (it.rate ?? 0);
    subtotal += amt;
    if (it.gstRate) taxAmount += amt * (it.gstRate / 100);
  }

  const est = await db.$transaction(async (tx) => {
    const created = await tx.cnEstimation.create({
      data: {
        orgId, projectId: input.projectId,
        estimationNumber: input.estimationNumber,
        estimationDate: new Date(input.estimationDate),
        subtotal, taxAmount, total: subtotal + taxAmount,
        currency: input.currency, status: "draft", remarks: input.remarks,
        createdBy: userId,
      },
    });
    const insertedIds: string[] = [];
    for (const it of input.items) {
      const amt = it.kind === "item" ? (it.quantity ?? 0) * (it.rate ?? 0) : 0;
      const row = await tx.cnEstimationItem.create({
        data: {
          estimationId: created.id,
          sortOrder: it.sortOrder, kind: it.kind,
          code: it.code ?? null, description: it.description,
          itemId: it.itemId ?? null, uomId: it.uomId ?? null,
          quantity: it.quantity ?? null, rate: it.rate ?? null,
          gstRate: it.gstRate ?? null, amount: amt,
        },
      });
      insertedIds.push(row.id);
    }
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      if (!it.parentId) continue;
      if (it.parentId.startsWith("idx:")) {
        const n = parseInt(it.parentId.slice(4), 10);
        if (Number.isFinite(n) && insertedIds[n]) {
          await tx.cnEstimationItem.update({ where: { id: insertedIds[i] }, data: { parentId: insertedIds[n] } });
        }
      }
    }
    return created;
  });
  return NextResponse.json({ success: true, data: est }, { status: 201 });
}, { permission: { resource: "construction.estimation", action: "create" } });
