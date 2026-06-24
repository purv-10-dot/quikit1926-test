"use client";

/**
 * Client hook for a Critical # / Balancing Critical # card's Change History
 * timeline. Reads the composite-keyed AuditEvent stream from
 * GET /api/opsp/review/critical/audit, returning the same `AuditEventResponse[]`
 * shape the generic `EntityChangeHistoryPanel` consumes.
 *
 * Mirrors `useEntityAuditTimeline` (staleTime 0 + refetch-on-mount) but routes
 * through the critical-scoped endpoint because the entityId is composite
 * (contains colons) and the per-card permission check differs from the generic
 * `/api/<module>/[id]/audit` routes.
 */
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { AuditEventResponse } from "@/lib/services/auditService";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export function useCriticalReviewTimeline(entityId: string, enabled = true) {
  return useQuery({
    queryKey: ["audit", "timeline", "CRITICAL_REVIEW", entityId],
    queryFn: async () => {
      const res = await axios.get<ApiResponse<AuditEventResponse[]>>(
        "/api/opsp/review/critical/audit",
        { params: { entityId } },
      );
      if (!res.data.success) {
        throw new Error(res.data.error || "Failed to fetch critical review history");
      }
      return res.data.data ?? [];
    },
    // The panel mounts only while open — always refetch so an edit made since
    // the last view shows without a full page refresh (matches KPI/Priority).
    enabled: !!entityId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
}
