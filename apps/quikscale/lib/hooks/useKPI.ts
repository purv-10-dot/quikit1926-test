"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
};

// List KPIs with filters
export function useKPIs(params: Partial<KPIListParams> = {}) {
  return useQuery({
    queryKey: kpiKeys.list(params),
    queryFn: () => kpiService.getKPIs(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
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

// Update weekly value (autosave)
export function useUpdateWeeklyValue(kpiId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: WeeklyValueInput) => kpiService.updateWeeklyValue(kpiId, input),
    onSuccess: () => {
      // Invalidate weekly values and parent KPI
      queryClient.invalidateQueries({ queryKey: kpiKeys.weekly(kpiId) });
      queryClient.invalidateQueries({ queryKey: kpiKeys.detail(kpiId) });
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
