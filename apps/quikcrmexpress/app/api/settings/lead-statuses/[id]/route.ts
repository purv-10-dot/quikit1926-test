import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  updateLeadStatus,
  deleteLeadStatus,
  LeadStatusError,
} from "@/lib/services/settings/lead-status.service";

export const runtime = "nodejs";

const patchSchema = z.object({
  name:         z.string().min(1).optional(),
  subStatusIds: z.array(z.string()).optional(),
}).refine((d) => d.name !== undefined || d.subStatusIds !== undefined, {
  message: "Provide at least one of: name, subStatusIds",
});

/** PATCH /api/settings/lead-statuses/[id] — rename and/or update sub-status mappings */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const updated = await updateLeadStatus(params.id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof LeadStatusError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}

/** DELETE /api/settings/lead-statuses/[id] — remove status and its junction rows */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "delete");
    await deleteLeadStatus(params.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof LeadStatusError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
