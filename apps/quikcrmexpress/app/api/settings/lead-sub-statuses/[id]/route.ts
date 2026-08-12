import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  updateLeadSubStatus,
  deleteLeadSubStatus,
  LeadStatusError,
} from "@/lib/services/settings/lead-status.service";

export const runtime = "nodejs";

const patchSchema = z.object({
  name:      z.string().min(1).optional(),
  statusIds: z.array(z.string()).optional(),
}).refine((d) => d.name !== undefined || d.statusIds !== undefined, {
  message: "Provide at least one of: name, statusIds",
});

/** PATCH /api/settings/lead-sub-statuses/[id] — rename and/or update status mappings */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const updated = await updateLeadSubStatus(params.id, parsed.data);
    return NextResponse.json({ success: true, data: updated });
  } catch (e) {
    if (e instanceof LeadStatusError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}

/** DELETE /api/settings/lead-sub-statuses/[id] — remove sub-status and its junction rows */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "delete");
    await deleteLeadSubStatus(params.id);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof LeadStatusError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
