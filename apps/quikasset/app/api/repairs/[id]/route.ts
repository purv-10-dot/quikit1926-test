import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Repair");

const updateSchema = z.object({
  issueTitle: z.string().optional(),
  issueDescription: z.string().optional(),
  sentDate: z.string().optional(),
  vendor: z.string().nullable().optional(),
  estimatedCost: z.coerce.number().nullable().optional(),
  actualCost: z.coerce.number().nullable().optional(),
  expectedReturn: z.string().nullable().optional(),
  returnedDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const patchSchema = z.object({
  action: z.string(),
  actualCost: z.coerce.number().nullable().optional(),
  returnedDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  replacementId: z.string().nullable().optional(),
  replacementAction: z.string().nullable().optional(),
});

export const PUT = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const row = await db.astRepair.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { issueTitle, issueDescription, sentDate, vendor, estimatedCost, actualCost, expectedReturn, returnedDate, notes } =
    parsed.data;

  const repair = await db.astRepair.update({
    where: { id },
    data: {
      issueTitle: issueTitle || undefined,
      issueDescription: issueDescription || undefined,
      sentDate: sentDate || undefined,
      vendor: vendor ?? undefined,
      estimatedCost: estimatedCost != null ? estimatedCost : undefined,
      actualCost: actualCost != null ? actualCost : undefined,
      expectedReturn: expectedReturn || null,
      returnedDate: returnedDate || null,
      notes: notes || null,
    },
    include: { asset: { include: { baseCategory: true, category: true } } },
  });
  await audit({
    orgId,
    module: "Repairs",
    action: "Repair Updated",
    entityId: repair.id,
    entityName: repair.asset?.itemName ?? id,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: repair });
});

// PATCH: advance status — body: { action, actualCost?, returnedDate?, notes?, replacementId?, replacementAction? }
export const PATCH = auth.update<{ id: string }>(async ({ orgId, userId, userEmail }, req, { params }) => {
  const { id } = params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }
  const { action, actualCost, returnedDate, notes, replacementId, replacementAction } = parsed.data;

  const current = await db.astRepair.findFirst({ where: { id, orgId }, select: { id: true, assetId: true } });
  if (!current) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const today = new Date().toISOString().split("T")[0];

  let repairData: Prisma.AstRepairUncheckedUpdateInput = {};
  let assetStatus: string | null = null;

  if (action === "markInRepair") {
    repairData = { status: "InRepair" };
    assetStatus = "InRepair";
  } else if (action === "markRepaired") {
    repairData = { status: "Repaired" };
    assetStatus = "Available";
  } else if (action === "markRecovered") {
    repairData = {
      status: "Recovered",
      returnedDate: returnedDate || today,
      actualCost: actualCost != null ? actualCost : undefined,
      notes: notes ?? undefined,
    };
    // returnAndReassign: original asset goes back as Assigned; otherwise Available
    assetStatus = replacementAction === "returnAndReassign" ? "Assigned" : "Available";
  } else if (action === "markUnrepairable") {
    repairData = {
      status: "Unrepairable",
      notes: notes ?? undefined,
    };
    assetStatus = "Retired";
  }

  const result = await db.$transaction(async (tx) => {
    const updated = await tx.astRepair.update({
      where: { id },
      data: repairData,
      include: { asset: { include: { baseCategory: true, category: true } } },
    });

    if (assetStatus) {
      await tx.astAsset.update({
        where: { id: current.assetId },
        data: { assetStatus: assetStatus as Prisma.AstAssetUncheckedUpdateInput["assetStatus"] },
      });
    }

    // Handle replacement resolution during recovery
    if (action === "markRecovered" && replacementId && replacementAction) {
      const repl = await tx.astReplacement.findFirstOrThrow({ where: { id: replacementId, orgId } });

      // End the replacement record
      await tx.astReplacement.update({
        where: { id: replacementId },
        data: { isActive: false, endDate: today },
      });

      if (replacementAction === "makePermanent") {
        // Replacement asset stays Assigned — create a real Assignment record for the user
        await tx.astAssignment.create({
          data: {
            orgId,
            assetId: repl.assetId,
            userId: repl.userId,
            condition: "Good",
            status: "Active",
          },
        });
        // replacement asset is already Assigned (set when replacement was created) — no status change needed
      } else if (replacementAction === "returnAndReassign") {
        // Release the replacement asset back to Available
        await tx.astAsset.update({ where: { id: repl.assetId }, data: { assetStatus: "Available" } });
        // End any active assignment for the replacement asset
        await tx.astAssignment.updateMany({
          where: { orgId, assetId: repl.assetId, status: "Active" },
          data: { status: "Returned", returnedAt: new Date() },
        });
        // Assign the recovered original asset to the temp replacement user
        await tx.astAssignment.create({
          data: {
            orgId,
            assetId: current.assetId,
            userId: repl.userId,
            condition: "Good",
            status: "Active",
          },
        });
        // original asset status already set to "Assigned" above via assetStatus
      } else if (replacementAction === "justRelease") {
        // Release the replacement asset back to Available
        await tx.astAsset.update({ where: { id: repl.assetId }, data: { assetStatus: "Available" } });
      }
    }

    return updated;
  });

  const auditActionMap: Record<string, string> = {
    markInRepair: "Marked In Repair",
    markRepaired: "Marked Repaired",
    markRecovered: "Marked Recovered",
    markUnrepairable: "Marked Unrepairable",
  };
  const auditAction = auditActionMap[action];
  if (auditAction) {
    await audit({
      orgId,
      module: "Repairs",
      action: auditAction,
      entityId: id,
      entityName: result.asset?.itemName ?? id,
      actorId: userId,
      actorEmail: userEmail,
    });
  }
  return NextResponse.json({ success: true, data: result });
});

export const DELETE = auth.delete<{ id: string }>(async ({ orgId, userId, userEmail }, _req, { params }) => {
  const { id } = params;
  const row = await db.astRepair.findFirst({ where: { id, orgId }, select: { id: true } });
  if (!row) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await db.astRepair.delete({ where: { id } });
  await audit({
    orgId,
    module: "Repairs",
    action: "Repair Deleted",
    entityId: id,
    entityName: id,
    actorId: userId,
    actorEmail: userEmail,
  });
  return NextResponse.json({ success: true, data: { ok: true } });
});
