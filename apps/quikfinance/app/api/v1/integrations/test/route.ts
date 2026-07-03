import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { getProvider } from "@/lib/integrations/registry";

export const dynamic = "force-dynamic";

/** Test connection — live probe + health, persists metadata and health score. */
export async function POST(request: NextRequest) {
  const guard = await integrationContext("write");
  if (!guard.ok) return guard.response;
  try {
    const { connectionId } = (await request.json()) as { connectionId?: string };
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const conn = await guard.repo.getConnection(connectionId);
    if (!conn) return fail(404, { code: "NOT_FOUND", message: "Connection not found." });

    const ctx = await guard.repo.buildProviderContext(connectionId);
    const provider = getProvider(conn.provider_key as string, ctx);
    const health = await provider.healthCheck();

    let organizations: Array<{ id: string; name: string }> = [];
    if (health.ok) {
      try {
        organizations = (await provider.getMetadata()).organizations;
      } catch {
        // metadata optional when reachable but unauthorized
      }
    }

    await guard.repo.recordHealthMetric(connectionId, "latency_ms", health.latencyMs);
    await guard.repo.updateConnection(connectionId, {
      status: health.ok ? "connected" : "error",
      health_score: health.ok ? 100 : 40,
      last_error: health.ok ? null : health.message
    });

    return ok({ ok: health.ok, message: health.message, latencyMs: health.latencyMs, organizations, tokenExpiresAt: health.tokenExpiresAt ?? null });
  } catch (error) {
    return fail(400, { code: "TEST_FAILED", message: errorMessage(error) });
  }
}
