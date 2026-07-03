import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { MigrationEngine } from "@/lib/integrations/engines/migration-engine";

export const dynamic = "force-dynamic";

/**
 * Run / resume the import for a session. Body: { sessionId, inline?: boolean }.
 * Default enqueues a background migration job; inline runs synchronously.
 */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const body = (await request.json()) as { sessionId?: string; inline?: boolean };
    if (!body.sessionId) return fail(422, { code: "MISSING_SESSION", message: "sessionId is required." });
    const session = await guard.repo.getMigrationSession(body.sessionId);
    if (!session) return fail(404, { code: "NOT_FOUND", message: "Migration session not found." });

    if (body.inline) {
      const engine = new MigrationEngine(guard.context.prisma, guard.context.orgId, guard.context.userId);
      const report = await engine.import(body.sessionId);
      return ok({ mode: "inline", report });
    }
    const job = await guard.repo.enqueueJob({ connectionId: session.connection_id as string, type: "migration", payload: { sessionId: body.sessionId }, priority: 3 });
    return ok({ mode: "queued", jobId: job.id }, undefined, { status: 202 });
  } catch (error) {
    return fail(400, { code: "MIGRATION_IMPORT_FAILED", message: errorMessage(error) });
  }
}
