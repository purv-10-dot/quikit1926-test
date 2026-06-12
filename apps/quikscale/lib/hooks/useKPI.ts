"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as kpiService from "@/lib/services/kpiService";
import { CreateKPIInput, UpdateKPIInput, WeeklyValueInput, KPINoteInput, KPIListParams } from "@/lib/schemas/kpiSchema";

// Query Keys
const kpiKeys = {
  all: ["kpi"],
  lists: () => [...kpiKeys.all, "list"],
  list: (filters: Partial<KPIListParams>) => [...kpiKeys.lists(), filters],
  details: () => [...kpiKeys.all, "detail"],
  detail: (id: string) => [...kpiKeys.details(), id],
  weekly: (id: string) => [...kpiKeys.detail(id), "weekly"],
  notes: (id: string) => [...kpiKeys.detail(id), "notes"],
  logs: (id: string) => [...kpiKeys.detail(id), "logs"],
  audit: (id: string) => [...kpiKeys.detail(id), "audit"],
};

// List KPIs with filters
export function useKPIs(params: Partial<KPIListParams> = {}) {
  return useQuery({
    queryKey: kpiKeys.list(params),
    queryFn: () => kpiService.getKPIs(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Keep the current page visible while the next page/sort/search loads —
    // no spinner flash on pagination.
    placeholderData: keepPreviousData,
  });
}

// List Team KPIs — convenience wrapper that forces kpiLevel="team". The Team
// KPI page now drives DB-level pagination (page/pageSize), so the caller
// supplies the page size; default 10 to match the other list pages.
export function useTeamKPIs(params: Partial<KPIListParams> = {}) {
  return useKPIs({
    ...params,
    kpiLevel: "team",
    pageSize: params.pageSize ?? 10,
  });
}

// Get single KPI
export function useKPI(id: string) {
  return useQuery({
    queryKey: kpiKeys.detail(id),
    queryFn: () => kpiService.getKPI(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Create KPI
export function useCreateKPI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateKPIInput) => kpiService.createKPI(input),
    onSuccess: () => {
      // Invalidate lists so they refetch
      queryClient.invalidateQueries({ queryKey: kpiKeys.lists() });
      // Dashboard summary aggregates KPIs — keep it in sync.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Update KPI
export function useUpdateKPI(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<UpdateKPIInput>) => kpiService.updateKPI(id, input),
    onSuccess: () => {
      // Invalidate specific KPI and lists
      queryClient.invalidateQueries({ queryKey: kpiKeys.detail(id) });
      queryClient.invalidateQueries({ queryKey: kpiKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Delete KPI
export function useDeleteKPI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => kpiService.deleteKPI(id),
    onSuccess: () => {
      // Invalidate all KPI queries
      queryClient.invalidateQueries({ queryKey: kpiKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Restore KPI — undo soft-delete for a single row.
export function useRestoreKPI() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/kpi/${id}/restore`, { method: "POST" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to restore KPI");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kpiKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Bulk restore KPIs — undo soft-delete in batch.
export function useBulkRestoreKPI() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`/api/kpi/bulk-restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Failed to restore KPIs");
      return (json.data ?? { restored: 0 }) as { restored: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kpiKeys.all });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Get weekly values
export function useWeeklyValues(kpiId: string) {
  return useQuery({
    queryKey: kpiKeys.weekly(kpiId),
    queryFn: () => kpiService.getWeeklyValues(kpiId),
    enabled: !!kpiId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Update weekly value (single-week — kept for callers that still upsert one
// row at a time; new code should prefer useUpdateWeeklyValuesBatch).
export function useUpdateWeeklyValue(kpiId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WeeklyValueInput) => kpiService.updateWeeklyValue(kpiId, input),
    onSuccess: () => {
      // Invalidate weekly values and parent KPI
      queryClient.invalidateQueries({ queryKey: kpiKeys.weekly(kpiId) });
      queryClient.invalidateQueries({ queryKey: kpiKeys.detail(kpiId) });
      queryClient.invalidateQueries({ queryKey: kpiKeys.lists() });
      // Dashboard pulls weekly values + progress%; keep it fresh after a save.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Batch update weekly values — one network call per Save click. Same cache
// invalidation as the single-week variant.
export function useUpdateWeeklyValuesBatch(kpiId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inputs: WeeklyValueInput[]) =>
      kpiService.updateWeeklyValuesBatch(kpiId, inputs),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: kpiKeys.weekly(kpiId) });
      queryClient.invalidateQueries({ queryKey: kpiKeys.detail(kpiId) });
      queryClient.invalidateQueries({ queryKey: kpiKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// Get notes
export function useNotes(kpiId: string) {
  return useQuery({
    queryKey: kpiKeys.notes(kpiId),
    queryFn: () => kpiService.getNotes(kpiId),
    enabled: !!kpiId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Add note
export function useAddNote(kpiId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: KPINoteInput) => kpiService.addNote(kpiId, input),
    onSuccess: () => {
      // Invalidate notes
      queryClient.invalidateQueries({ queryKey: kpiKeys.notes(kpiId) });
    },
  });
}

// Delete note
export function useDeleteNote(kpiId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => kpiService.deleteNote(kpiId, noteId),
    onSuccess: () => {
      // Invalidate notes
      queryClient.invalidateQueries({ queryKey: kpiKeys.notes(kpiId) });
    },
  });
}

// Get audit logs
export function useLogs(kpiId: string) {
  return useQuery({
    queryKey: kpiKeys.logs(kpiId),
    queryFn: () => kpiService.getLogs(kpiId),
    enabled: !!kpiId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Get the centralized Change History timeline (AuditEvent/AuditChange)
export function useAuditTimeline(kpiId: string, enabled = true) {
  return useQuery({
    queryKey: kpiKeys.audit(kpiId),
    queryFn: () => kpiService.getAuditTimeline(kpiId),
    enabled: !!kpiId && enabled,
    // The Change History panel mounts only while open, so always refetch on
    // open: an edit made since the last view (weekly/field/status/delete/
    // restore) must show without a full page refresh. staleTime:0 marks cached
    // data stale so the mount refetch fires; cached events render meanwhile.
    staleTime: 0,
    refetchOnMount: "always",
  });
}

// Per-KPI unread audit-event count (drives the History button badge).
const auditUnreadKey = (entityId: string) => ["audit", "unread", "KPI", entityId];

export function useUnreadCount(entityId: string, enabled = true) {
  return useQuery({
    queryKey: auditUnreadKey(entityId),
    queryFn: () => kpiService.getAuditUnreadCount(entityId),
    enabled: !!entityId && enabled,
    staleTime: 1000 * 30,
  });
}

// Marks an entity's timeline read; optimistically clears its badge.
export function useMarkAuditRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entityId: string) => kpiService.markAuditRead("KPI", entityId),
    onMutate: (entityId: string) => {
      queryClient.setQueryData(auditUnreadKey(entityId), 0);
    },
    onSuccess: () => {
      // Re-sync from the server once the mark is persisted.
      queryClient.invalidateQueries({ queryKey: ["audit", "unread"] });
      // Also refresh the page-level batched counts (UnreadCountsProvider).
      queryClient.invalidateQueries({ queryKey: ["audit-unread-counts"] });
    },
    // On failure we keep the optimistic 0 (no rollback) — the badge re-appears
    // on the next natural refetch (window focus). Matches UC-1.17.
  });
}

// Module-wide unread (sidebar dot). Refetches on window focus so the dot
// clears shortly after the user has read the events (AC-1.33).
export function useModuleUnread(moduleKey = "KPI") {
  return useQuery({
    queryKey: ["audit", "module-unread", moduleKey],
    queryFn: () => kpiService.getModuleUnreadCount(moduleKey),
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60,
  });
}
