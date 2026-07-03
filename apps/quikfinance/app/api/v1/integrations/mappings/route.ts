import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import type { EntityType, FieldMapping } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

/** GET field mappings for a connection (optionally one entity). */
export async function GET(request: NextRequest) {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    const entity = request.nextUrl.searchParams.get("entity") as EntityType | null;
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const rows = await guard.repo.getFieldMappings(connectionId, entity ?? undefined);
    return ok(rows);
  } catch (error) {
    return fail(400, { code: "MAPPINGS_FAILED", message: errorMessage(error) });
  }
}

/** PUT replaces an entity's field mapping set. Body: { connectionId, entity, mappings[] } */
export async function PUT(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const body = (await request.json()) as { connectionId?: string; entity?: EntityType; mappings?: FieldMapping[] };
    if (!body.connectionId || !body.entity) return fail(422, { code: "MISSING_FIELDS", message: "connectionId and entity are required." });
    await guard.repo.saveFieldMappings(body.connectionId, body.entity, (body.mappings ?? []).map((m) => ({ ...m, entity: body.entity as EntityType })));
    const rows = await guard.repo.getFieldMappings(body.connectionId, body.entity);
    return ok(rows);
  } catch (error) {
    return fail(400, { code: "MAPPINGS_SAVE_FAILED", message: errorMessage(error) });
  }
}
