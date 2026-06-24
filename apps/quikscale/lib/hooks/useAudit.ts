/**
 * Entity-agnostic audit hooks (timeline, unread badge, mark-read, add-comment).
 *
 * Parameterized by `entityType` so any module reuses them. The KPI module keeps
 * its own thin hooks in useKPI.ts for back-compat; new modules (Priority, …)
 * use these directly via their audit config.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as auditService from "@/lib/services/auditService";

export const auditKeys = {
  timeline: (entityType: string, entityId: string) =>
    ["audit", "timeline", entityType, entityId] as const,
  unread: (entityType: string, entityId: string) =>
    ["audit", "unread", entityType, entityId] as const,
};

/** Full Change History timeline for one entity. */
export function useEntityAuditTimeline(entityType: string, entityId: string, enabled = true) {
  return useQuery({
    queryKey: auditKeys.timeline(entityType, entityId),
    queryFn: () => auditService.getAuditTimeline(entityType, entityId),
    enabled: !!entityId && enabled,
    // The panel mounts only while open, so always refetch on open: an edit made
    // since the last view (status/field/weekly/delete/restore) must show without
    // a full page refresh. staleTime:0 marks cached data stale immediately so
    // the mount refetch fires; cached events still render instantly meanwhile.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** Per-entity unread audit-event count (drives the History button badge). */
export function useEntityUnreadCount(entityType: string, entityId: string, enabled = true) {
  return useQuery({
    queryKey: auditKeys.unread(entityType, entityId),
    queryFn: () => auditService.getAuditUnreadCount(entityType, entityId),
    enabled: !!entityId && enabled,
    staleTime: 1000 * 30,
  });
}

/** Mark an entity's timeline read for the current user (optimistic badge clear). */
export function useEntityMarkRead(entityType: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entityId: string) => auditService.markAuditRead(entityType, entityId),
    onMutate: (entityId: string) => {
      qc.setQueryData(auditKeys.unread(entityType, entityId), 0);
    },
    onSuccess: () => {
      // Refresh the page-level batched counts (UnreadCountsProvider).
      void qc.invalidateQueries({ queryKey: ["audit-unread-counts"] });
    },
  });
}

/** Add a free-text comment (stored as a COMMENT AuditEvent), then refresh. */
export function useAddAuditComment(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => auditService.addAuditComment(entityType, entityId, content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: auditKeys.timeline(entityType, entityId) });
      void qc.invalidateQueries({ queryKey: auditKeys.unread(entityType, entityId) });
    },
  });
}
