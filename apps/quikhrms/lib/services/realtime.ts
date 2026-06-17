/**
 * Realtime broadcasting has been REMOVED from QuikHRMS — no Redis Pub/Sub, no
 * SSE. Live UI updates are now delivered by client polling (React Query
 * `refetchInterval`) against the existing REST/status endpoints.
 *
 * These publish* functions are retained as **no-ops** so the existing
 * notification/asset/ticket call-sites keep compiling without edits. They emit
 * nothing and touch no Redis. (Safe to delete the call-sites later.)
 */

export interface RealtimeEvent {
  type: "notification" | "payroll_progress" | "bulk_import_progress" | "ticket_update" | "asset_update";
  orgId: string;
  targetEmployeeIds?: string[];
  payload: Record<string, unknown>;
  timestamp: number;
}

export async function publishEvent(_event: RealtimeEvent): Promise<void> {
  /* no-op — Pub/Sub removed */
}

export async function publishNotification(
  _orgId: string,
  _employeeIds: string[],
  _data: { id?: string; title: string; message: string; type: string; link?: string },
): Promise<void> {
  /* no-op */
}

export async function publishPayrollProgress(
  _orgId: string,
  _runId: string,
  _progress: { processed: number; total: number; status: string },
): Promise<void> {
  /* no-op */
}

export async function publishBulkImportProgress(
  _orgId: string,
  _importId: string,
  _progress: { processed: number; total: number; errors: number },
): Promise<void> {
  /* no-op */
}

export async function publishAssetUpdate(
  _orgId: string,
  _data: { assetId: string; action: "created" | "updated" | "assigned" | "returned" | "scrapped" | "deleted"; employeeId?: string },
): Promise<void> {
  /* no-op */
}

export async function publishTicketUpdate(
  _orgId: string,
  _employeeIds: string[],
  _data: { ticketId: string; status: string; action: string },
): Promise<void> {
  /* no-op */
}
