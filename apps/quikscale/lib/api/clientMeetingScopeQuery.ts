/**
 * Shared scope `where` for Daily Huddle + Weekly Meeting lists.
 *
 * Both meetings are module-gated org-wide data (no per-owner row visibility),
 * so the scope is simply: orgId + trash toggle + optional client + status +
 * a From/To range on `meetingDate`. Extracted so the list routes AND the
 * export routes build the identical filter (the export can't diverge from what
 * the list shows).
 *
 * Date parsing intentionally matches the existing list routes (`new Date(from)`
 * for the start, `to` pushed to end-of-day UTC) so exports line up exactly with
 * the on-screen table for the same range.
 */
export interface ClientMeetingScopeParams {
  clientId?: string;
  /** Maps to callStatus on both models. */
  status?: string;
  /** "YYYY-MM-DD" (inclusive start). */
  from?: string | null;
  /** "YYYY-MM-DD" (inclusive end — pushed to 23:59:59.999 UTC). */
  to?: string | null;
  includeDeleted?: boolean;
}

export function buildClientMeetingWhere(
  orgId: string,
  params: ClientMeetingScopeParams,
): Record<string, unknown> {
  const where: Record<string, unknown> = {
    orgId,
    deletedAt: params.includeDeleted ? { not: null } : null,
  };
  if (params.clientId) where.clientId = params.clientId;
  if (params.status) where.callStatus = params.status;
  if (params.from || params.to) {
    const range: Record<string, Date> = {};
    if (params.from) range.gte = new Date(params.from);
    if (params.to) {
      const d = new Date(params.to);
      d.setUTCHours(23, 59, 59, 999);
      range.lte = d;
    }
    where.meetingDate = range;
  }
  return where;
}
