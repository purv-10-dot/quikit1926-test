import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateFormRule, deleteFormRule, FormRuleError } from "@/lib/services/forms/form-rule.service";

export const runtime = "nodejs";

const updateRuleSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  matchType: z.enum(["all", "any"]).optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

/** PATCH /api/forms/rules/[ruleId] — edit a rule on its (draft) version. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { ruleId } = await params;
    const parsed = updateRuleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const rule = await updateFormRule({ ruleId, ...parsed.data });
    return NextResponse.json({ success: true, data: rule });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}

/** DELETE /api/forms/rules/[ruleId] — delete a rule (cascades conditions/actions). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { ruleId } = await params;
    await deleteFormRule(ruleId);
    return NextResponse.json({ success: true, data: { id: ruleId } });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
