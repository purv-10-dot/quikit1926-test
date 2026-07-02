import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/leads/stream
 *
 * Realtime lead streaming has been removed — the kanban now refreshes via
 * polling instead of SSE/Redis. This endpoint is retained only so any stale
 * EventSource client gets a clean 503 (and falls back to polling) rather than
 * a 404. Auth + module ACL are still enforced.
 */
export async function GET(_req: NextRequest) {
  const user = await requireApiUser();
  if (isResponse(user)) return user;
  try {
    await assertModule(user, "leads", "view");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response("Realtime unavailable: leads streaming is disabled", {
    status: 503,
  });
}
