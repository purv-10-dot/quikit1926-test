import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { setProjectStarred } from "@/lib/services/projectStars";

const bodySchema = z.object({ starred: z.boolean() });

/**
 * PATCH /api/projects/:id/star — the current user stars / un-stars this space.
 * Per-user (QtProjectStar), so any project member can toggle their own star.
 * `:id` may be a cuid or project key (withProjectAccess resolves it).
 */
export const PATCH = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId }, req: NextRequest) => {
    try {
      const parsed = bodySchema.safeParse(await req.json());
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: "starred must be a boolean" },
          { status: 400 },
        );
      }
      const next = await setProjectStarred(orgId, userId, projectId, parsed.data.starred);
      if (next === null) {
        return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { id: projectId, starred: next } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Operation failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
