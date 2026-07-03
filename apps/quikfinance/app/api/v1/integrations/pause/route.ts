import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Pause a connection: stop scheduling and park queued jobs. */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const { connectionId } = (await request.json()) as { connectionId?: string };
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const paused = await guard.repo.setJobsStatusForConnection(connectionId, "queued", "paused");
    await guard.repo.updateConnection(connectionId, { is_enabled: false });
    return ok({ paused, isEnabled: false });
  } catch (error) {
    return fail(400, { code: "PAUSE_FAILED", message: errorMessage(error) });
  }
}
