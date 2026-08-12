import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { getFormRules, createFormRule, FormRuleError } from "@/lib/services/forms/form-rule.service";

export const runtime = "nodejs";

/** GET /api/forms/versions/[versionId]/rules — rules + conditions, ordered. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const data = await getFormRules(versionId);
    return NextResponse.json({ success: true, data });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}

const createRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  matchType: z.enum(["all", "any"]),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean().optional(),
});

/** POST /api/forms/versions/[versionId]/rules — add a rule to a draft version. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const { versionId } = await params;
    const parsed = createRuleSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", fieldErrors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const rule = await createFormRule({
      formSetVersionId: versionId,
      name: parsed.data.name,
      matchType: parsed.data.matchType,
      sortOrder: parsed.data.sortOrder,
      isActive: parsed.data.isActive,
      createdByUserId: user.userId,
    });
    return NextResponse.json({ success: true, data: rule }, { status: 201 });
  } catch (e) {
    if (e instanceof FormRuleError) {
      return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    }
    return errorResponse(e);
  }
}
