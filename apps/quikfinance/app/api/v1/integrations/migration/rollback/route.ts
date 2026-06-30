import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { MigrationEngine } from "@/lib/integrations/engines/migration-engine";

export const dynamic = "force-dynamic";

/** One-click rollback of a migration session. Body: { sessionId } */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const { sessionId } = (await request.json()) as { sessionId?: string };
    if (!sessionId) return fail(422, { code: "MISSING_SESSION", message: "sessionId is required." });
    const engine = new MigrationEngine(guard.context.prisma, guard.context.orgId, guard.context.userId);
    const result = await engine.rollback(sessionId);
    return ok(result);
  } catch (error) {
    return fail(400, { code: "ROLLBACK_FAILED", message: errorMessage(error) });
  }
}
