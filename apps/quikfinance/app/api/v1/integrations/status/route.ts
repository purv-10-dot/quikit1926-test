import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Connection status + recent jobs. ?connectionId=… */
export async function GET(request: NextRequest) {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const connection = await guard.repo.getConnection(connectionId);
    if (!connection) return fail(404, { code: "NOT_FOUND", message: "Connection not found." });
    const jobs = await guard.repo.listJobs(connectionId, undefined, 20);
    const conflicts = await guard.repo.listConflicts(connectionId, "open");
    return ok({ connection, jobs, openConflicts: conflicts.length });
  } catch (error) {
    return fail(400, { code: "STATUS_FAILED", message: errorMessage(error) });
  }
}
