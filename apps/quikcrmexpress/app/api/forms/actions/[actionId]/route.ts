import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateRuleAction, deleteRuleAction, FormRuleError } from "@/lib/services/forms/form-rule-action.service";

export const runtime = "nodejs";

const updateActionSchema = z.object({
  actionType: z.enum(["show_field", "hide_field", "make_mandatory", "make_optional", "show_tab", "set_stage"]).optional(),
  targetKind: z.enum(["field", "section", "tab", "stage"]).optional(),
  targetFieldKey: z.string().trim().min(1).max(120).optional().nullable(),
  targetTabId: z.string().trim().min(1).optional().nullable(),
  setStatusId: z.string().trim().min(1).optional().nullable(),
  setSubStatusId: z.string().trim().min(1).optional().nullable(),
  sortOrder: z.number().int().nonnegative().optional(),
});

/** PATCH /api/forms/actions/[actionId] — edit an action (merged-state validated). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { actionId } = await params;
    const parsed = updateActionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const action = await updateRuleAction({ actionId, ...parsed.data });
    return NextResponse.json({ success: true, data: action });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}

/** DELETE /api/forms/actions/[actionId] — remove an action. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ actionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { actionId } = await params;
    await deleteRuleAction(actionId);
    return NextResponse.json({ success: true, data: { id: actionId } });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
