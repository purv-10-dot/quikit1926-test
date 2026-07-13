import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** List conflicts. ?connectionId=…&status=open */
export async function GET(request: NextRequest) {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const connectionId = request.nextUrl.searchParams.get("connectionId") ?? undefined;
    const status = request.nextUrl.searchParams.get("status") ?? "open";
    const rows = await guard.repo.listConflicts(connectionId, status);
    return ok(rows);
  } catch (error) {
    return fail(400, { code: "CONFLICTS_FAILED", message: errorMessage(error) });
  }
}
