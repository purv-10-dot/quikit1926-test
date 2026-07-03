import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { MigrationEngine } from "@/lib/integrations/engines/migration-engine";
import type { EntityType } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

/**
 * Start a migration: create a session and (optionally) run analysis immediately.
 * Body: { connectionId, entities[], mode?: 'dry_run'|'live', analyze?: boolean }
 */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const body = (await request.json()) as { connectionId?: string; entities?: EntityType[]; mode?: "dry_run" | "live"; analyze?: boolean };
    if (!body.connectionId || !body.entities?.length) {
      return fail(422, { code: "MISSING_FIELDS", message: "connectionId and at least one entity are required." });
    }
    const session = await guard.repo.createMigrationSession({
      connectionId: body.connectionId,
      mode: body.mode ?? "dry_run",
      entities: body.entities
    });

    let analysis = null;
    if (body.analyze !== false) {
      const engine = new MigrationEngine(guard.context.prisma, guard.context.orgId, guard.context.userId);
      analysis = await engine.analyze(session.id as string);
    }
    return ok({ session, analysis }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "MIGRATION_START_FAILED", message: errorMessage(error) });
  }
}
