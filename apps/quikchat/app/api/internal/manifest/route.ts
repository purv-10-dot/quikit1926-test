import { hasInternalSecret, resolveActor } from "@/lib/auth-shims";

export const dynamic = "force-dynamic";

const MANIFEST = {
  app: "quikchat",
  version: "1",
  scoping: "org",
  entities: [
    { name: "channel", summary: "/api/internal/summary/channel/{id}" },
    { name: "thread", summary: "/api/internal/summary/thread/{rootMessageId}" },
    { name: "activity", summary: "/api/internal/summary/activity" },
  ],
  capabilities: [
    "read_summary",
    "accept_agent_jwt",
    "emit_index_events",
    "write_message_via_approval_gate",
  ],
};

/**
 * Discovery descriptor for the QuikverseAI runtime. Accepts an agent JWT, a
 * human session, or the internal shared secret (org-agnostic — it's a static
 * descriptor).
 */
export async function GET(req: Request) {
  const authed = hasInternalSecret(req) || (await resolveActor(req).catch(() => null));
  if (!authed) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(MANIFEST);
}
