import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";
import { computeHealth } from "@/lib/integrations/engines/health-engine";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);

/** Health score + analytics + recommendations for a connection. ?connectionId=… */
export async function GET(request: NextRequest) {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const connectionId = request.nextUrl.searchParams.get("connectionId");
    if (!connectionId) return fail(422, { code: "MISSING_CONNECTION", message: "connectionId is required." });
    const connection = await guard.repo.getConnection(connectionId);
    if (!connection) return fail(404, { code: "NOT_FOUND", message: "Connection not found." });

    const { prisma, orgId } = guard.context;
    const stats = (await prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE status = 'succeeded')::int AS succeeded,
        COUNT(*) FILTER (WHERE status IN ('failed','dead'))::int AS failed,
        COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
        COALESCE(SUM(attempts),0)::int AS attempts,
        COALESCE(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000) FILTER (WHERE finished_at IS NOT NULL),0)::int AS avg_ms
      FROM integration_jobs
      WHERE org_id = ${orgId}::uuid AND connection_id = ${connectionId}::uuid AND created_at >= now() - interval '30 days'
    `) as Array<{ succeeded: number; failed: number; queued: number; attempts: number; avg_ms: number }>;
    const s = stats[0] ?? { succeeded: 0, failed: 0, queued: 0, attempts: 0, avg_ms: 0 };
    const total = s.succeeded + s.failed;

    const tokens = await guard.repo.getTokens(connectionId);
    const tokenExpiresInHours = tokens?.expiresAt ? (Date.parse(tokens.expiresAt) - Date.now()) / 3_600_000 : null;
    const latencySeries = await guard.repo.getHealthSeries(connectionId, "latency_ms", 7);
    const avgLatency = latencySeries.length ? latencySeries.reduce((a, b) => a + n(b.value), 0) / latencySeries.length : s.avg_ms;

    const report = computeHealth({
      successRate: total ? s.succeeded / total : 1,
      avgSyncMs: s.avg_ms,
      apiLatencyMs: Math.round(avgLatency),
      failedRequests: s.failed,
      retryCount: Math.max(0, s.attempts - total),
      queueLength: s.queued,
      tokenExpiresInHours,
      lastFailureAgeHours: null
    });

    await guard.repo.recordHealthMetric(connectionId, "success_rate", total ? s.succeeded / total : 1);
    await guard.repo.updateConnection(connectionId, { health_score: report.score });

    return ok({ connectionId, report, metrics: { ...s, total, tokenExpiresInHours }, latencySeries });
  } catch (error) {
    return fail(400, { code: "HEALTH_FAILED", message: errorMessage(error) });
  }
}
