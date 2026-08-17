import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getSearchConsoleData } from "@/lib/connectors/gsc";
import { connectorErrorResponse } from "@/lib/connectors/errors";
import { markExpiredIfAuthError } from "@/lib/connectors/reauth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Clamped so a hand-edited query string can't ask a platform API for an
  // absurd window. Defaults to 28 days, the long-standing behaviour.
  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days") ?? 28), 1), 365);
  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
  try {
    const data = await getSearchConsoleData(session.user.id, days, workspaceId);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    // A dead grant is terminal — record it so Integrations offers a reconnect
    // instead of silently retrying a doomed refresh on every page load.
    await markExpiredIfAuthError(err, session.user.id, "GOOGLE_SEARCH_CONSOLE", workspaceId);
    const { body, status } = connectorErrorResponse("search-console", err);
    return NextResponse.json(body, { status });
  }
}
