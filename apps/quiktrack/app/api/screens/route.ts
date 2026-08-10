import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { listScreens, createScreen, ensureDefaultScreen } from "@/lib/services/screens/screen-service";

/**
 * GET /api/screens — org's screens (seeds the Default Screen on first read).
 * POST /api/screens — create a screen.
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  await ensureDefaultScreen(orgId);
  const data = await listScreens(orgId);
  return NextResponse.json({ success: true, data });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.string().trim().max(500).optional(),
  fieldKeys: z.array(z.string()).optional(),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const created = await createScreen(orgId, userId, parsed.data);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    // Unique [orgId, name] violation → friendly message.
    const message = error instanceof Error && error.message.includes("Unique")
      ? "A screen with that name already exists."
      : error instanceof Error ? error.message : "Failed to create screen";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
});
