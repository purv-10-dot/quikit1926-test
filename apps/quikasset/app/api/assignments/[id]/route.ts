import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { assetStatusAfterReturn, requestStateAfterUnfulfil } from "@/lib/api/assignments";

const auth = withOrgAuthForResource("Assignment");

const updateSchema = z.object({
  condition: z.string().optional(),
  expectedReturn: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
});

export const PUT = auth.update<{ id: string }>(async ({ orgId }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astAssignment.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const data = parsed.data as Prisma.AstAssignmentUncheckedUpdateInput;
  const assignment = await db.astAssignment.update({
    where: { id },
    data,
    include: {
      asset: { include: { baseCategory: true, category: true } },
      user: true,
    },
  });
  return NextResponse.json({ success: true, data: assignment });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const existing = await db.astAssignment.findFirst({
    where: { id, orgId },
    select: {
      id: true, status: true, assetId: true, requestId: true,
      asset: { select: { assetStatus: true, itemName: true } },
      user: { select: { name: true } },
    },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.astAssignment.delete({ where: { id } });
    // Deleting a still-Active assignment must free the asset and revert its
    // originating request, or the asset gets stranded "Assigned" with nothing
    // to return. A Returned assignment already released both — leave them.
    if (existing.status === "Active") {
      const nextAsset = assetStatusAfterReturn(existing.asset?.assetStatus ?? "");
      if (nextAsset) await tx.astAsset.update({ where: { id: existing.assetId }, data: { assetStatus: nextAsset } });
      if (existing.requestId) {
        const req = await tx.astAssetRequest.findUnique({
          where: { id: existing.requestId },
          select: { quantityFulfilled: true, status: true },
        });
        if (req) {
          const next = requestStateAfterUnfulfil(req.quantityFulfilled, req.status);
          await tx.astAssetRequest.update({
            where: { id: existing.requestId },
            data: { quantityFulfilled: next.quantityFulfilled, status: next.status as Prisma.AstAssetRequestUncheckedUpdateInput["status"] },
          });
        }
      }
    }
  });

  await audit({
    orgId,
    module: "Assignments",
    action: "Assignment Deleted",
    entityId: id,
    entityName: `${existing.asset?.itemName ?? "asset"}${existing.user?.name ? ` from ${existing.user.name}` : ""}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: { ok: true } });
});

export const PATCH = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const existing = await db.astAssignment.findFirst({
    where: { id, orgId },
    select: { id: true, status: true, assetId: true, requestId: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  // Idempotency: only an Active assignment can be returned. Returning an already
  // -returned one would re-stamp returnedAt and re-run the side effects.
  if (existing.status !== "Active") {
    return NextResponse.json({ success: false, error: "This assignment has already been returned." }, { status: 409 });
  }

  const result = await db.$transaction(async (tx) => {
    const assignment = await tx.astAssignment.update({
      where: { id },
      data: { status: "Returned", returnedAt: new Date() },
      include: { asset: true, user: true },
    });
    // Only free the asset if it's still "Assigned" — don't clobber InRepair/Retired.
    const nextAsset = assetStatusAfterReturn(assignment.asset?.assetStatus ?? "");
    if (nextAsset) await tx.astAsset.update({ where: { id: assignment.assetId }, data: { assetStatus: nextAsset } });
    // Revert the originating request (if this was a fulfilment).
    if (existing.requestId) {
      const req = await tx.astAssetRequest.findUnique({
        where: { id: existing.requestId },
        select: { quantityFulfilled: true, status: true },
      });
      if (req) {
        const next = requestStateAfterUnfulfil(req.quantityFulfilled, req.status);
        await tx.astAssetRequest.update({
          where: { id: existing.requestId },
          data: { quantityFulfilled: next.quantityFulfilled, status: next.status as Prisma.AstAssetRequestUncheckedUpdateInput["status"] },
        });
      }
    }
    return assignment;
  });
  await audit({
    orgId,
    module: "Assignments",
    action: "Asset Returned",
    entityId: id,
    entityName: `${result.asset?.itemName} from ${result.user?.name}`,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: result });
});
