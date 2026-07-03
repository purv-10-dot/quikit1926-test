import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { getProvider, isProviderRegistered } from "@/lib/integrations/registry";
import type { Schedule, SyncDirection } from "@/lib/integrations/types";

export const dynamic = "force-dynamic";

/**
 * Create/initialize a connection.
 * Body: { providerKey, name, region?, config?, credentials?, settings?, defaultDirection?, schedule? }
 * OAuth providers return { authorizationUrl } to redirect the user; local
 * providers (Tally) return a connected/error status after a live probe.
 */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;

  try {
    const body = (await request.json()) as {
      providerKey?: string; name?: string; region?: string; config?: Record<string, unknown>;
      credentials?: Record<string, string>; settings?: Record<string, unknown>;
      defaultDirection?: SyncDirection; schedule?: Schedule;
    };
    if (!body.providerKey || !isProviderRegistered(body.providerKey)) {
      return fail(422, { code: "INVALID_PROVIDER", message: "Unknown or unsupported provider." });
    }

    const connection = await guard.repo.createConnection({
      providerKey: body.providerKey,
      name: body.name?.trim() || body.providerKey,
      region: body.region ?? null,
      config: body.config ?? {},
      settings: body.settings ?? {},
      defaultDirection: body.defaultDirection,
      schedule: body.schedule
    });
    const connectionId = connection.id as string;

    if (body.credentials && Object.keys(body.credentials).length) {
      await guard.repo.setCredentials(connectionId, body.credentials);
    }
    if (body.region) await guard.repo.updateConnection(connectionId, { region: body.region });

    const ctx = await guard.repo.buildProviderContext(connectionId);
    const provider = getProvider(body.providerKey, ctx);
    const result = await provider.connect();

    await guard.repo.updateConnection(connectionId, {
      status: result.status,
      last_error: result.status === "error" ? result.message : null
    });

    return ok({ connection: { ...connection, status: result.status }, ...result }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CONNECT_FAILED", message: errorMessage(error) });
  }
}
