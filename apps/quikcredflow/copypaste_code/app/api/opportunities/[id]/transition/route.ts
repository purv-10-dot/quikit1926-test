import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { transitionSchema } from "@/lib/services/opportunities/validators";
import {
  TransitionError,
  recordTransition,
  validateTransition,
} from "@/lib/services/opportunities/transition-service";
import { TERMINAL_STAGES } from "@/lib/services/opportunities/stage-labels";

export const runtime = "nodejs";

function err(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "opportunities", "edit");

    const body = await req.json().catch(() => null);
    const parsed = transitionSchema.safeParse(body);
    if (!parsed.success) {
      return err(
        "Validation failed: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        400,
      );
    }

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";
    const isAdmin = user.role === "Administrator";

    const opp = await db.crmOpportunity.findFirst({
      where: { id, tenantId: user.tenantId, deletedAt: null },
      select: { id: true, accountId: true, stage: true, name: true },
    });
    if (!opp) return err("Not found", 404);
    await assertAccountAccess(user, opp.accountId);

    try {
      validateTransition(
        opp.stage,
        {
          toStage: parsed.data.toStage,
          closeReason: parsed.data.closeReason,
          closeReasonCategory: parsed.data.closeReasonCategory,
          notes: parsed.data.notes,
          force,
        },
        isAdmin,
      );
    } catch (e: unknown) {
      if (e instanceof TransitionError) return err(e.message, e.statusCode);
      throw e;
    }

    const isClosing = TERMINAL_STAGES.has(parsed.data.toStage);

    const updated = await db.$transaction(async (tx) => {
      const next = await tx.crmOpportunity.update({
        where: { id, tenantId: user.tenantId },
        data: {
          stage: parsed.data.toStage,
          lastStageChangeAt: new Date(),
          ...(isClosing
            ? {
                closeReason: parsed.data.closeReason ?? null,
                closeReasonCategory: parsed.data.closeReasonCategory ?? null,
              }
            : {}),
        },
      });
      await recordTransition(tx, {
        tenantId: user.tenantId,
        opportunityId: id,
        opportunityName: opp.name,
        fromStage: opp.stage,
        toStage: parsed.data.toStage,
        changedByUserId: user.userId,
        changedByName: user.name || user.email || null,
        closeReason: parsed.data.closeReason ?? null,
        closeReasonCategory: parsed.data.closeReasonCategory ?? null,
        notes: parsed.data.notes ?? null,
      });
      return next;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to transition stage";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    return err(message, status);
  }
}
