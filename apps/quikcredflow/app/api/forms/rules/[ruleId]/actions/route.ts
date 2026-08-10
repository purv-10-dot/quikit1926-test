import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { addRuleAction, FormRuleError } from "@/lib/services/forms/form-rule-action.service";

export const runtime = "nodejs";

const actionSchema = z.object({
  actionType: z.enum(["show_field", "hide_field", "make_mandatory", "make_optional", "show_tab", "set_stage"]),
  targetKind: z.enum(["field", "section", "tab", "stage"]),
  targetFieldKey: z.string().trim().min(1).max(120).optional().nullable(),
  targetTabId: z.string().trim().min(1).optional().nullable(),
  setStatusId: z.string().trim().min(1).optional().nullable(),
  setSubStatusId: z.string().trim().min(1).optional().nullable(),
  sortOrder: z.number().int().nonnegative(),
});

/** POST /api/forms/rules/[ruleId]/actions — add an action to a rule. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ ruleId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { ruleId } = await params;
    const parsed = actionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const action = await addRuleAction({ formRuleId: ruleId, ...parsed.data });
    return NextResponse.json({ success: true, data: action }, { status: 201 });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
