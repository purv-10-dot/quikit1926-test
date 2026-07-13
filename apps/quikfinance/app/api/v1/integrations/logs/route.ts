import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Recent job logs for a connection. ?connectionId=…&limit=200 */
export async function GET(request: NextRequest) {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? "200"), 500);
    const logs = await guard.repo.listLogs(connectionId, limit);
    return ok(logs);
  } catch (error) {
    return fail(400, { code: "LOGS_FAILED", message: errorMessage(error) });
  }
}
