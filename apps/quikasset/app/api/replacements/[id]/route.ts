import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Replacement");

// PATCH: end an active replacement (temporary → release asset back to Available)
export const PATCH = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;

  const replacement = await db.astReplacement.findFirst({
    where: { id, orgId },
    select: { id: true, assetId: true },
  });
  if (!replacement) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const result = await db.$transaction(async (tx) => {
    const updated = await tx.astReplacement.update({
      where: { id },
      data: { isActive: false },
      include: { asset: true, user: true },
    });
    // Release the replacement asset back to Available
    await tx.astAsset.update({ where: { id: replacement.assetId }, data: { assetStatus: "Available" } });
    return updated;
  });

  await audit({
    orgId,
    module: "Replacements",
    action: "Replacement Ended",
    entityId: id,
    entityName: result.asset?.itemName ?? id,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: result });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const { id } = params;
  const replacement = await db.astReplacement.findFirst({
    where: { id, orgId },
    select: { id: true, assetId: true, isActive: true },
  });
  if (!replacement) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.$transaction(async (tx) => {
    await tx.astReplacement.delete({ where: { id } });
    // If it was active, release the asset
    if (replacement.isActive) {
      await tx.astAsset.update({ where: { id: replacement.assetId }, data: { assetStatus: "Available" } });
    }
  });

  return NextResponse.json({ success: true, data: { ok: true } });
});
