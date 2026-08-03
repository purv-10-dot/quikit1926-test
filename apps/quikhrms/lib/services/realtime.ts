/**
 * Realtime broadcasting has been REMOVED from QuikHRMS — no Redis Pub/Sub, no
 * SSE. Live UI updates are now delivered by client polling (React Query
 * `refetchInterval`) against the existing REST/status endpoints.
 *
 * These publish* functions are retained as **no-ops** so the existing
 * notification/asset/ticket call-sites keep compiling without edits. They emit
 * nothing and touch no Redis. (Safe to delete the call-sites later.)
 */

export async function publishNotification(
  _orgId: string,
  _employeeIds: string[],
  _data: { id?: string; title: string; message: string; type: string; link?: string },
): Promise<void> {
  /* no-op */
}
