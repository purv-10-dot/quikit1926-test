/**
 * Entity-agnostic audit client. Mirrors the KPI audit calls in kpiService but
 * routes by `entityType` so any module (KPI, Priority, …) can read its timeline,
 * unread badge, mark-read, and post comments through one service.
 *
 * The mark-read and unread-count endpoints are already generic
 * (/api/audit/*). Per-entity timeline + comment endpoints live under the
 * module's own route tree (/api/<module>/[id]/audit | /notes).
 */
import axios from "axios";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuditEventResponse {
  id: string;
  action: string;
  actorUserId: string;
  actorName: string;
  source: string;
  reason: string | null;
  snapshot: unknown;
  createdAt: string;
  teamId: string | null;
  changes: { fieldName: string; oldValue: unknown; newValue: unknown }[];
}

/** Map a stored entityType to its module API base path. */
export function auditBasePath(entityType: string): string {
  switch (entityType.toUpperCase()) {
    case "PRIORITY":
      return "/api/priority";
    case "WWW":
      return "/api/www";
    case "CLIENT":
      return "/api/client-meetings/clients";
    case "CLIENT_MEMBER":
      return "/api/client-meetings/members";
    case "DAILY_HUDDLE":
      return "/api/client-meetings/daily-huddles";
    case "WEEKLY_MEETING":
      return "/api/client-meetings/weekly-meetings";
    case "KPI":
      return "/api/kpi";
    default:
      return `/api/${entityType.toLowerCase()}`;
  }
}

export async function getAuditTimeline(
  entityType: string,
  entityId: string,
): Promise<AuditEventResponse[]> {
  const res = await axios.get<ApiResponse<AuditEventResponse[]>>(
    `${auditBasePath(entityType)}/${entityId}/audit`,
  );
  if (!res.data.success) throw new Error(res.data.error || "Failed to fetch audit history");
  return res.data.data || [];
}

export async function markAuditRead(entityType: string, entityId: string): Promise<void> {
  await axios.post(`/api/audit/mark-read`, { entityType, entityId });
}

export async function getAuditUnreadCount(
  entityType: string,
  entityId: string,
): Promise<number> {
  const res = await axios.get<ApiResponse<{ unread: number }>>(`/api/audit/unread-count`, {
    params: { entityType, entityId },
  });
  return res.data?.data?.unread ?? 0;
}

/** Post a free-text comment; stored as a COMMENT AuditEvent on the entity. */
export async function addAuditComment(
  entityType: string,
  entityId: string,
  content: string,
): Promise<void> {
  const res = await axios.post<ApiResponse<unknown>>(
    `${auditBasePath(entityType)}/${entityId}/notes`,
    { content },
  );
  if (!res.data.success) throw new Error(res.data.error || "Failed to add comment");
}
