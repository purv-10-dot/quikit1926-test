import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getInstagramStats } from "@/lib/connectors/instagram";
import { connectorErrorResponse } from "@/lib/connectors/errors";
import { decodePeriod, resolvePeriod } from "@/lib/period/resolve";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
    // Accepts ?start/&end (from PeriodPicker via encodePeriod) and the legacy
    // ?days=N. No params at all -> undefined, so getInstagramStats falls back
    // to its own trailingWindow(7) default instead of decodePeriod's DEFAULT_PERIOD
    // (30 days) â€” preserving this endpoint's pre-existing 7-day default for
    // callers that don't pass a range.
    const sp = new URL(req.url).searchParams;
    const window = sp.size > 0 ? resolvePeriod(decodePeriod(sp)).current : undefined;
    const data = await getInstagramStats(session.user.id, workspaceId, window);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    const { body, status } = connectorErrorResponse("instagram", err);
    return NextResponse.json(body, { status });
  }
}
