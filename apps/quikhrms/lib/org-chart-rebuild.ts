/**
 * The org-chart is computed live on read (no Redis snapshot cache, no rebuild
 * job — see lib/services/org-chart.ts). This remains a no-op so the employee
 * write-paths that used to schedule a background rebuild compile unchanged.
 * (Previously lived in lib/queue/helpers.ts, now removed with BullMQ.)
 */
export async function scheduleOrgChartRebuild(
  _orgId: string,
  _reason: string,
  _triggeredByUserId?: string,
): Promise<void> {
  // intentionally a no-op
}
