import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { getProvider } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const { connectionId, remove } = (await request.json()) as { connectionId?: string; remove?: boolean };
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const conn = await guard.repo.getConnection(connectionId);
    if (!conn) return fail(404, { code: "NOT_FOUND", message: "Connection not found." });

    try {
      const ctx = await guard.repo.buildProviderContext(connectionId);
      await getProvider(conn.provider_key as string, ctx).disconnect();
    } catch {
      // best-effort external revoke
    }

    if (remove) {
      await guard.repo.deleteConnection(connectionId);
      return ok({ removed: true });
    }
    await guard.repo.updateConnection(connectionId, { status: "disabled", is_enabled: false });
    await guard.repo.notify({ connectionId, type: "disconnected", title: "Integration disconnected", body: `${conn.name} was disconnected.` });
    return ok({ status: "disabled" });
  } catch (error) {
    return fail(400, { code: "DISCONNECT_FAILED", message: errorMessage(error) });
  }
}
