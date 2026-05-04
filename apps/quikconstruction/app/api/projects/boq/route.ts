import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { boqCreateSchema } from "@/lib/schemas/projects";

const withTenantAuth = withTenantAuthForModule("projects");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const list = await db.cnBOQ.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(projectId ? { projectId } : {}) },
    include: {
      project: { select: { id: true, name: true, code: true } },
      _count: { select: { items: true } },
    },
    orderBy: { boqDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

/**
 * POST /api/projects/boq
 *
 * Creates a BOQ with its items. Hierarchy: items carry `parentId` referencing
 * another item in the SAME request (by array index via a two-pass insert).
 * Callers pass `parentId` as an index-string like "idx:2" when the parent is
 * also being created; use `existingId:<cuid>` when linking to an already-
 * persisted item (rare on create).
 *
 * Totals (subtotal, tax, total) are computed server-side.
 */
export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = boqCreateSchema.parse(body);
  const project = await db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  const dup = await db.cnBOQ.findFirst({ where: { orgId, boqNumber: input.boqNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `BOQ '${input.boqNumber}' already exists` }, { status: 409 });

  // Compute totals
  let subtotal = 0;
  let taxAmount = 0;
  for (const it of input.items) {
    if (it.kind === "group") continue;
    const amt = (it.quantity ?? 0) * (it.rate ?? 0);
    subtotal += amt;
    if (it.gstRate) taxAmount += amt * (it.gstRate / 100);
  }

  const boq = await db.$transaction(async (tx) => {
    const created = await tx.cnBOQ.create({
      data: {
        orgId,
        boqNumber: input.boqNumber,
        projectId: input.projectId,
        boqDate: new Date(input.boqDate),
        currency: input.currency,
        subtotal,
        taxAmount,
        total: subtotal + taxAmount,
        status: "draft",
        remarks: input.remarks,
        createdBy: userId,
      },
    });

    // Two-pass: create items without parentId first, keep idx → generated id map,
    // then rewire parent references.
    const insertedIds: string[] = [];
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      const amt = it.kind === "item" ? (it.quantity ?? 0) * (it.rate ?? 0) : 0;
      const row = await tx.cnBOQItem.create({
        data: {
          boqId: created.id,
          sortOrder: it.sortOrder,
          kind: it.kind,
          code: it.code ?? null,
          description: it.description,
          itemId: it.itemId ?? null,
          uomId: it.uomId ?? null,
          quantity: it.quantity ?? null,
          rate: it.rate ?? null,
          gstRate: it.gstRate ?? null,
          amount: amt,
        },
      });
      insertedIds.push(row.id);
    }
    // Resolve parentId where it was "idx:N"
    for (let i = 0; i < input.items.length; i++) {
      const it = input.items[i];
      if (!it.parentId) continue;
      let parentId: string | null = null;
      if (it.parentId.startsWith("idx:")) {
        const n = parseInt(it.parentId.slice(4), 10);
        if (Number.isFinite(n) && insertedIds[n]) parentId = insertedIds[n];
      } else if (it.parentId.startsWith("existingId:")) {
        parentId = it.parentId.slice(11);
      }
      if (parentId) {
        await tx.cnBOQItem.update({
          where: { id: insertedIds[i] },
          data: { parentId },
        });
      }
    }
    return created;
  });

  return NextResponse.json({ success: true, data: boq }, { status: 201 });
});
