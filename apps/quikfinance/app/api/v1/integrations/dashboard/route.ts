import { ok, fail, errorMessage } from "@/lib/api/responses";
import { integrationContext } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Org-wide sync dashboard aggregates. */
export async function GET() {
  const guard = await integrationContext("read");
  if (!guard.ok) return guard.response;
  try {
    const [dashboard, connections, notifications] = await Promise.all([
      guard.repo.dashboard(),
      guard.repo.listConnections(),
      guard.repo.listNotifications(10)
    ]);
    const jobsByStatus = (dashboard.jobs as Array<{ status: string; c: number }>) ?? [];
    const find = (s: string) => jobsByStatus.find((j) => j.status === s)?.c ?? 0;
    const summary = {
      connectedProviders: connections.filter((c) => c.status === "connected").length,
      totalConnections: connections.length,
      running: find("running"),
      queued: find("queued"),
      failed: find("failed"),
      dead: find("dead"),
      paused: find("paused"),
      openConflicts: dashboard.openConflicts,
      last30: dashboard.last30
    };
    return ok({ summary, connections, notifications });
  } catch (error) {
    return fail(400, { code: "DASHBOARD_FAILED", message: errorMessage(error) });
  }
}
