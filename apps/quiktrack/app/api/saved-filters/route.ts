import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  listSavedFilters,
  listStarredSavedFilters,
  createSavedFilter,
} from "@/lib/services/savedFilters";

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  criteria: z.record(z.unknown()).default({}),
  visibility: z.enum(["private", "org", "space", "user"]).default("private"),
  viewerIds: z.array(z.string().min(1)).max(200).default([]),
});

/**
 * GET  /api/saved-filters           → filters the caller can see (own + shared)
 * GET  /api/saved-filters?starred=1 → only the caller's starred filters (sidebar)
 * POST /api/saved-filters           → create a saved filter from toolbar state
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const starredOnly = new URL(req.url).searchParams.get("starred") === "1";
    const data = starredOnly
      ? await listStarredSavedFilters(orgId, userId)
      : await listSavedFilters(orgId, userId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  try {
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const data = await createSavedFilter(orgId, userId, parsed.data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
