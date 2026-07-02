/**
 * GET /api/notifications/stream
 *
 * Legacy SSE endpoint. Realtime delivery over Redis pub/sub has been removed;
 * this endpoint now always responds 503 so the client cleanly falls back to
 * polling (React Query's refetchInterval on useUnreadCount + refetchOnWindowFocus
 * on useNotifications).
 *
 * The route is retained (rather than deleted) because the client's
 * useNotificationStream() hook still opens an EventSource against it and relies
 * on the 503 to enter its error state and give up after MAX_ERRORS retries.
 *
 * Auth: NextAuth cookie (EventSource sends cookies same-origin by default).
 */

import { requireApiUser, isResponse } from "@/lib/auth/require";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (isResponse(user)) return user;

  // Realtime is no longer available — clients fall back to polling.
  return new Response("Realtime unavailable: notification streaming is disabled", {
    status: 503,
  });
}
