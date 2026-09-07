import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getYouTubeData } from "@/lib/connectors/google";
import { connectorErrorResponse } from "@/lib/connectors/errors";
import { markExpiredIfAuthError } from "@/lib/connectors/reauth";
import { decodePeriod, resolvePeriod } from "@/lib/period/resolve";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Accepts ?start/&end (from PeriodPicker via encodePeriod) and the legacy
  // ?days=N. No params at all -> undefined, so getYouTubeData falls back to
  // its own 28-day default — preserving this endpoint's pre-existing
  // behaviour for any caller that doesn't pass a range.
  const sp = new URL(req.url).searchParams;
  const window = sp.size > 0 ? resolvePeriod(decodePeriod(sp)).current : undefined;
  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
  try {
    const data = await getYouTubeData(session.user.id, window ?? 28, workspaceId);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    // A dead grant is terminal — record it so Integrations offers a reconnect
    // instead of silently retrying a doomed refresh on every page load.
    await markExpiredIfAuthError(err, session.user.id, "YOUTUBE", workspaceId);
    const { body, status } = connectorErrorResponse("youtube", err);
    return NextResponse.json(body, { status });
  }
}
