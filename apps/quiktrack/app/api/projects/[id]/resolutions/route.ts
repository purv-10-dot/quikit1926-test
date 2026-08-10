import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";

/**
 * GET /api/projects/[id]/resolutions
 * The org's resolution catalog (Done, Won't Do, …). Resolutions are org-scoped,
 * resolved via the project's org. Used by the set_resolution post-function config
 * form and (later) the transition screen that prompts for a resolution on Done.
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId }) => {
    const resolutions = await db.qtResolution.findMany({
      where: { orgId, isDeleted: false },
      orderBy: { orderIndex: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json({ success: true, data: resolutions });
  },
  { paramKey: "id" },
);
