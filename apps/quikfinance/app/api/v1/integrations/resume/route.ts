import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Resume a connection: re-enable scheduling and requeue parked jobs. */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const { connectionId } = (await request.json()) as { connectionId?: string };
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const resumed = await guard.repo.setJobsStatusForConnection(connectionId, "paused", "queued");
    await guard.repo.updateConnection(connectionId, { is_enabled: true });
    return ok({ resumed, isEnabled: true });
  } catch (error) {
    return fail(400, { code: "RESUME_FAILED", message: errorMessage(error) });
  }
}
