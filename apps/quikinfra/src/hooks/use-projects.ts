"use client";

/**
 * React Query hooks for Project Management — BOQ, Estimation, WO, DPR, RAB.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { entityMeta } from "@/lib/toast";

async function fetchApi<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function mutateApi<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }
  return res.json();
}

// ─── BOQ ───────────────────────────────────────────────────────────

export function useBOQ(projectId: string | null) {
  return useQuery({
    queryKey: ["boq", projectId],
    queryFn: () => fetchApi<{
      items?: any[];
      data: any[];
      summary: any;
      lockState?: { isLocked: boolean; lockedAt: string | null; lockedBy: string | null; version: number };
    }>(`/api/projects/${projectId}/boq`),
    enabled: !!projectId,
  });
}

/**
 * Infinite-scroll variant of useBOQ — emits one page at a time so the UI
 * can render the table progressively as the user scrolls. Server-side
 * rollup math runs on the FULL tree on every request, so `summary` and
 * `lockState` stay accurate on every page.
 *
 * Wire up with an IntersectionObserver pointed at a sentinel element
 * after the last rendered row, and call `fetchNextPage()` when it
 * intersects.
 */
export function useBOQInfinite(
  projectId: string | null,
  opts?: { category?: string; pageSize?: number },
) {
  const pageSize = opts?.pageSize ?? 100;
  const category = opts?.category ?? "all";
  return useInfiniteQuery({
    queryKey: ["boq-infinite", projectId, category, pageSize],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("page", String(pageParam));
      params.set("pageSize", String(pageSize));
      if (category && category !== "all") params.set("category", category);
      const res = await fetch(
        `/api/projects/${projectId}/boq?${params.toString()}`,
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{
        items: any[];
        data: any[];
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
        summary: any;
        lockState: {
          isLocked: boolean;
          lockedAt: string | null;
          lockedBy: string | null;
          version: number;
        };
      }>;
    },
    enabled: !!projectId,
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
  });
}

export function useImportBOQ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: any }) =>
      mutateApi(`/api/projects/${projectId}/boq/import`, "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boq"] });
      qc.invalidateQueries({ queryKey: ["boq-infinite"] });
    },
    meta: { successMessage: "BOQ imported", errorMessage: "Failed to import BOQ" },
  });
}

// ─── Material Estimation ───────────────────────────────────────────

/**
 * Fetch material estimations. Pass a projectId to scope to one project,
 * or pass null/undefined to get everything (used by the list page which
 * no longer gates on project selection).
 */
export function useEstimations(projectId?: string | null) {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return useQuery({
    queryKey: ["estimations", projectId ?? "__all__"],
    queryFn: () => fetchApi<{ data: any[] }>(`/api/estimations${qs}`),
  });
}

/** Single estimation by id — used by the detail page. */
export function useEstimation(id: string | null) {
  return useQuery({
    queryKey: ["estimation", id],
    queryFn: () => fetchApi<any>(`/api/estimations/${id}`),
    enabled: !!id,
  });
}

export function useCreateEstimation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: any }) =>
      mutateApi(`/api/projects/${projectId}/estimations`, "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimations"] }),
    meta: entityMeta("create", "Estimation"),
  });
}

export function useUpdateEstimation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      mutateApi(`/api/estimations/${id}`, "PUT", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimations"] }),
    meta: entityMeta("update", "Estimation"),
  });
}

// ─── Work Orders ───────────────────────────────────────────────────

export function useWorkOrders(params?: { status?: string; projectId?: string; contractorId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.contractorId) qs.set("contractorId", params.contractorId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["work-orders", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/projects/work-orders${query ? `?${query}` : ""}`),
  });
}

export function useWorkOrder(id: string | null) {
  return useQuery({
    queryKey: ["work-order", id],
    queryFn: () => fetchApi<any>(`/api/projects/work-orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/projects/work-orders", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
    meta: entityMeta("create", "Work order"),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      mutateApi(`/api/projects/work-orders/${id}`, "PUT", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
    meta: entityMeta("update", "Work order"),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/projects/work-orders/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
    meta: entityMeta("delete", "Work order"),
  });
}

// ─── DPR ───────────────────────────────────────────────────────────

export function useDPRs(params?: { status?: string; projectId?: string; fromDate?: string; toDate?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["dprs", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/projects/dpr${query ? `?${query}` : ""}`),
  });
}

export function useDPR(id: string | null) {
  return useQuery({
    queryKey: ["dpr", id],
    queryFn: () => fetchApi<any>(`/api/projects/dpr/${id}`),
    enabled: !!id,
  });
}

export function useCreateDPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/projects/dpr", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dprs"] }),
    meta: entityMeta("create", "DPR"),
  });
}

export function useUpdateDPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      mutateApi(`/api/projects/dpr/${id}`, "PUT", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dprs"] });
      qc.invalidateQueries({ queryKey: ["dpr"] });
    },
    meta: entityMeta("update", "DPR"),
  });
}

export function useDeleteDPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/projects/dpr/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dprs"] }),
    meta: entityMeta("delete", "DPR"),
  });
}

export function useSubmitDPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/projects/dpr/${id}/submit`, "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dprs"] });
      qc.invalidateQueries({ queryKey: ["dpr"] });
    },
    meta: entityMeta("submit", "DPR"),
  });
}

// ─── RAB ───────────────────────────────────────────────────────────

export function useRABs(params?: { status?: string; projectId?: string; contractorId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.contractorId) qs.set("contractorId", params.contractorId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["rabs", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/projects/rab${query ? `?${query}` : ""}`),
  });
}

export function useCreateRAB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/projects/rab", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rabs"] }),
    meta: entityMeta("create", "RAB"),
  });
}
