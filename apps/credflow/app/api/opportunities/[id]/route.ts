import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { updateOpportunitySchema } from "@/lib/services/opportunities/validators";
import {
  softDelete,
  updateOpportunity,
} from "@/lib/services/opportunities/opportunity-service";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "view");

    const opp = await db.qcfOpportunity.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    // Tenant isolation: cross-tenant requests get 404 (not 403) to avoid
    // existence disclosure.
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId);

    return NextResponse.json({ success: true, data: opp });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read opportunity";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const raw = await req.json().catch(() => null);
    if (raw && typeof raw === "object" && "stage" in raw) {
      return err(
        "Stage transitions must use POST /api/opportunities/[id]/transition",
        400,
      );
    }
    const parsed = updateOpportunitySchema.safeParse(raw);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const existing = await db.qcfOpportunity.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, accountId: true, ownerId: true, amount: true, probability: true },
    });
    if (!existing) return err("Not found", 404);

    await assertAccountAccess(user, existing.accountId);
    if (parsed.data.accountId && parsed.data.accountId !== existing.accountId) {
      await assertAccountAccess(user, parsed.data.accountId);
    }

    const updated = await updateOpportunity({
      tenantId: user.tenantId,
      userId: user.userId,
      id,
      input: parsed.data,
      existing: {
        ownerId: existing.ownerId,
        amount: existing.amount,
        probability: existing.probability,
      },
    });
    evaluateRulesForEvent({
      event: "updated",
      entityType: "opportunity",
      entityId: id,
      tenantId: user.tenantId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      changedFields: Object.keys(parsed.data),
    }).catch((e) => console.error("[rules-engine] opportunity updated", e));
    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update opportunity";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "delete");

    const existing = await db.qcfOpportunity.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, accountId: true },
    });
    if (!existing) return err("Not found", 404);
    await assertAccountAccess(user, existing.accountId);

    await softDelete(user.tenantId, id);
    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete opportunity";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
