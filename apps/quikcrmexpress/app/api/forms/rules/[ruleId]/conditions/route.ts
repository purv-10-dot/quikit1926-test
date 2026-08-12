import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { addRuleCondition, FormRuleError } from "@/lib/services/forms/form-rule.service";

export const runtime = "nodejs";

const conditionSchema = z.object({
  subjectKind: z.enum(["field", "stage", "status", "sub_stage"]),
  subjectFieldKey: z.string().trim().min(1).max(120).optional().nullable(),
  operator: z.enum(["is", "is_not", "is_any_of", "is_none_of", "is_empty", "is_not_empty"]),
  valueKeys: z.array(z.string()).optional().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

/** POST /api/forms/rules/[ruleId]/conditions — add a condition to a rule. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { ruleId } = await params;
    const parsed = conditionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const condition = await addRuleCondition({ formRuleId: ruleId, ...parsed.data });
    return NextResponse.json({ success: true, data: condition }, { status: 201 });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
