import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateRuleCondition, deleteRuleCondition, FormRuleError } from "@/lib/services/forms/form-rule.service";

export const runtime = "nodejs";

const updateConditionSchema = z.object({
  subjectKind: z.enum(["field", "stage", "status", "sub_stage"]).optional(),
  subjectFieldKey: z.string().trim().min(1).max(120).optional().nullable(),
  operator: z.enum(["is", "is_not", "is_any_of", "is_none_of", "is_empty", "is_not_empty"]).optional(),
  valueKeys: z.array(z.string()).optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
});

/** PATCH /api/forms/conditions/[conditionId] — edit a condition (merged-state validated). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ conditionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { conditionId } = await params;
    const parsed = updateConditionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const condition = await updateRuleCondition({ conditionId, ...parsed.data });
    return NextResponse.json({ success: true, data: condition });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}

/** DELETE /api/forms/conditions/[conditionId] — remove a condition. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ conditionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { conditionId } = await params;
    await deleteRuleCondition(conditionId);
    return NextResponse.json({ success: true, data: { id: conditionId } });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
