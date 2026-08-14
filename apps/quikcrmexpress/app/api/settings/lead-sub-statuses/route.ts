import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  getLeadSubStatuses,
  createLeadSubStatus,
  LeadStatusError,
} from "@/lib/services/settings/lead-status.service";

export const runtime = "nodejs";

/** GET /api/settings/lead-sub-statuses — all sub-statuses with their linked statuses */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await getLeadSubStatuses();
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  name:      z.string().min(1),
  statusIds: z.array(z.string()).optional().default([]),
});

/** POST /api/settings/lead-sub-statuses — create a new sub-status */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "create");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const created = await createLeadSubStatus(parsed.data.name, parsed.data.statusIds);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (e) {
    if (e instanceof LeadStatusError) return NextResponse.json({ success: false, error: e.message }, { status: e.statusCode });
    return errorResponse(e);
  }
}
