import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { SyncEngine } from "@/lib/integrations/engines/sync-engine";
import type { EntityType, SyncDirection } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

/**
 * Trigger a sync. Default: enqueue a background job (processed by the worker).
 * Pass { inline: true } to run synchronously (useful for manual "Sync now").
 */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const body = (await request.json()) as { connectionId?: string; entities?: EntityType[]; direction?: SyncDirection; full?: boolean; inline?: boolean };
    if (!body.connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const conn = await guard.repo.getConnection(body.connectionId);
    if (!conn) return fail(404, { code: "NOT_FOUND", message: "Connection not found." });

    const options = { entities: body.entities, direction: body.direction, full: body.full };

    if (body.inline) {
      const engine = new SyncEngine(guard.context.prisma, guard.context.orgId, guard.context.userId);
      const job = await guard.repo.enqueueJob({ connectionId: body.connectionId, type: "sync", payload: { options } });
      try {
        const results = await engine.runConnectionSync(body.connectionId, options, job.id as string);
        await guard.repo.finishJob(job.id as string, "succeeded", { entities: results });
        return ok({ mode: "inline", jobId: job.id, results });
      } catch (error) {
        await guard.repo.finishJob(job.id as string, "failed", undefined, errorMessage(error));
        return fail(502, { code: "SYNC_FAILED", message: errorMessage(error) });
      }
    }

    const job = await guard.repo.enqueueJob({ connectionId: body.connectionId, type: "sync", payload: { options } });
    return ok({ mode: "queued", jobId: job.id }, undefined, { status: 202 });
  } catch (error) {
    return fail(400, { code: "SYNC_ENQUEUE_FAILED", message: errorMessage(error) });
  }
}
