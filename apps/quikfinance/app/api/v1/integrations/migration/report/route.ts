import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Fetch the validation report (and session) for a migration. ?sessionId=… */
export async function GET(request: NextRequest) {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) return fail(422, { code: "MISSING_SESSION", message: "sessionId is required." });
    const session = await guard.repo.getMigrationSession(sessionId);
    if (!session) return fail(404, { code: "NOT_FOUND", message: "Migration session not found." });
    const report = await guard.repo.getMigrationReport(sessionId);
    return ok({ session, report: report?.report ?? null });
  } catch (error) {
    return fail(400, { code: "REPORT_FAILED", message: errorMessage(error) });
  }
}
