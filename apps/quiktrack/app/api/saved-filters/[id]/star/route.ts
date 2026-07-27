import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { setSavedFilterStarred } from "@/lib/services/savedFilters";

const bodySchema = z.object({ starred: z.boolean() });

/** PATCH /api/saved-filters/:id/star — owner toggles the sidebar star. */
export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req: NextRequest, { params }) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "starred must be a boolean" }, { status: 400 });
    }
    const next = await setSavedFilterStarred(orgId, userId, params.id, parsed.data.starred);
    if (next === null) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { id: params.id, starred: next } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
