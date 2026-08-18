import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { quoteTransitionSchema } from "@/lib/services/quotes/validators";
import {
  TransitionError,
  transitionQuote,
} from "@/lib/services/quotes/transition-service";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";

export const runtime = "nodejs";

function ok<T>(data: T): NextResponse {
  return NextResponse.json({ success: true, data });
}
function fail(status: number, error: string, fieldErrors?: Record<string, string>): NextResponse {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "quotes", "edit");

    const body = await req.json().catch(() => null);
    const parsed = quoteTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }

    try {
      const updated = await transitionQuote({
        orgId: user.orgId,
        userId: user.userId,
        userName: user.name ?? null,
        quoteId: id,
        input: parsed.data,
      });
      evaluateRulesForEvent({
        event: "status_changed",
        entityType: "quote",
        entityId: id,
        orgId: user.orgId,
        actorUserId: user.userId,
        actorName: user.name || user.email,
        after: updated as unknown as Record<string, unknown>,
        changedFields: ["status"],
      }).catch((e) => console.error("[rules-engine] quote transition", e));
      return ok(updated);
    } catch (e: unknown) {
      if (e instanceof TransitionError) {
        return fail(e.statusCode, e.message);
      }
      throw e;
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to transition quote";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/quotes/:id/transition POST]", error);
    return fail(status, message);
  }
}
