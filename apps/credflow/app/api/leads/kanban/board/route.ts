import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { buildKanbanBoard } from "@/lib/services/leads/kanban";

export const runtime = "nodejs";
// Per-tenant authenticated query — must NEVER be cached at the route level
// (intermediate caches, RSC cache, or the Vercel data cache). Marking the
// route dynamic + sending `no-store` is belt-and-suspenders against staleness.
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/leads/kanban/board
 *
 * Server-grouped buckets per pipeline stage. Each bucket: { stage, total, items[] }.
 * Respects ACL + field masking. Parity: legacy GET /leads/kanban/board.
 *
 * Query params:
 *   ?perStage=N    Cards per stage (default 100, max 500).
 *   ?ownerName=X   Filter by owner name.
 *   ?stage=X       Restrict response to a single stage (used by Load More).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const { searchParams } = new URL(req.url);
    const perStage = Number(searchParams.get("perStage") ?? "100");
    const ownerName = searchParams.get("ownerName") ?? undefined;
    const stage = searchParams.get("stage") ?? undefined;

    const buckets = await buildKanbanBoard({ user, perStage, ownerName, stage });
    return NextResponse.json(
      { buckets },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
