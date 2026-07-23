"use client";

/**
 * React Query hooks for Project Management — BOQ, Estimation, WO, DPR, RAB.
 */

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { entityMeta } from "@/lib/toast";
import type { Estimation } from "@/lib/projects/estimation-repository";
import type { BoqTreeRow } from "@/lib/boq/tree-row";
import type { EstimationDetail } from "@/lib/projects/estimation-detail";
import type { WorkOrderDetail } from "@/lib/projects/work-order-detail";
import type { DprDetail } from "@/lib/projects/dpr-detail";

/** Work-order list row as returned by `/api/projects/work-orders`. Only the
 *  fields consumers read off the list are declared; the rest stay `unknown`
 *  via the index signature. */
interface WorkOrderListRow {
  id: string; woNumber?: string; contractorName?: string; status?: string;
  [key: string]: unknown;
}

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
      items?: BoqTreeRow[];
      data: BoqTreeRow[];
      summary: unknown;
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
        items: BoqTreeRow[];
        data: BoqTreeRow[];
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
        summary: unknown;
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
    mutationFn: ({ projectId, data }: { projectId: string; data: unknown }) =>
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
export function useEstimations(
  projectId?: string | null,
  opts?: {
    search?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    excludeInactive?: boolean;
  },
) {
  const qs = new URLSearchParams();
  if (projectId) qs.set("projectId", projectId);
  if (opts?.search) qs.set("search", opts.search);
  if (opts?.page) qs.set("page", String(opts.page));
  if (opts?.pageSize) qs.set("pageSize", String(opts.pageSize));
  if (opts?.sortBy) qs.set("sortBy", opts.sortBy);
  if (opts?.sortOrder) qs.set("sortOrder", opts.sortOrder);
  if (opts?.excludeInactive) qs.set("excludeInactive", "1");
  const query = qs.toString();
  return useQuery({
    queryKey: ["estimations", query || "__all__"],
    queryFn: () =>
      fetchApi<{ data: Estimation[]; total: number }>(
        `/api/estimations${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
  });
}

/** Single estimation by id — used by the detail page. */
export function useEstimation(id: string | null) {
  return useQuery({
    queryKey: ["estimation", id],
    queryFn: () => fetchApi<EstimationDetail>(`/api/estimations/${id}`),
    enabled: !!id,
  });
}

export function useCreateEstimation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: unknown }) =>
      mutateApi(`/api/projects/${projectId}/estimations`, "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimations"] }),
    meta: entityMeta("create", "Estimation"),
  });
}

export function useUpdateEstimation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/estimations/${id}`, "PUT", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["estimations"] }),
    meta: entityMeta("update", "Estimation"),
  });
}

// ─── Work Orders ───────────────────────────────────────────────────

export function useWorkOrders(params?: {
  status?: string;
  projectId?: string;
  contractorId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.contractorId) qs.set("contractorId", params.contractorId);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["work-orders", query],
    queryFn: () => fetchApi<{ data: WorkOrderListRow[]; total: number }>(`/api/projects/work-orders${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useWorkOrderStats(params?: { search?: string; projectId?: string }) {
  const qs = new URLSearchParams({ stats: "1" });
  if (params?.search) qs.set("search", params.search);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();
  return useQuery({
    queryKey: ["work-orders", "stats", query],
    queryFn: () =>
      fetchApi<{ stats: { total: number; active: number; totalValue: number; avgProgress: number } }>(
        `/api/projects/work-orders?${query}`,
      ),
    placeholderData: (prev) => prev,
  });
}

export function useWorkOrder(id: string | null) {
  return useQuery({
    queryKey: ["work-order", id],
    queryFn: () => fetchApi<WorkOrderDetail>(`/api/projects/work-orders/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/projects/work-orders", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-orders"] }),
    meta: entityMeta("create", "Work order"),
  });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
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

export function useDPRs(params?: {
  status?: string;
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["dprs", query],
    queryFn: () => fetchApi<{ data: unknown[]; total: number }>(`/api/projects/dpr${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useDPRStats(params?: { search?: string; projectId?: string }) {
  const qs = new URLSearchParams({ stats: "1" });
  if (params?.search) qs.set("search", params.search);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();
  return useQuery({
    queryKey: ["dprs", "stats", query],
    queryFn: () =>
      fetchApi<{ stats: { total: number; approved: number; pending: number; halted: number } }>(
        `/api/projects/dpr?${query}`,
      ),
    placeholderData: (prev) => prev,
  });
}

export function useDPR(id: string | null) {
  return useQuery({
    queryKey: ["dpr", id],
    queryFn: () => fetchApi<DprDetail>(`/api/projects/dpr/${id}`),
    enabled: !!id,
  });
}

export function useCreateDPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/projects/dpr", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dprs"] }),
    meta: entityMeta("create", "DPR"),
  });
}

export function useUpdateDPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
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

export function useRABs(params?: {
  status?: string;
  projectId?: string;
  contractorId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.contractorId) qs.set("contractorId", params.contractorId);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["rabs", query],
    queryFn: () => fetchApi<{ data: unknown[]; total: number }>(`/api/projects/rab${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useCreateRAB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/projects/rab", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rabs"] }),
    meta: entityMeta("create", "RAB"),
  });
}

export function useSubmitRAB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/projects/rab/${id}/submit`, "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rabs"] }),
    meta: entityMeta("submit", "RAB"),
  });
}

export function useApproveRAB() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, comments }: { id: string; action: "approve" | "reject" | "return"; comments?: string }) =>
      mutateApi(`/api/projects/rab/${id}/approve`, "POST", { action, comments }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rabs"] }),
    meta: entityMeta("update", "RAB"),
  });
}

/** A proposed RAB line as returned by the pull endpoints / normalised from BOQ. */
interface RabPullLine {
  boqItemId?: string; boqNo?: string; description?: string; unit?: string;
  uomId?: string; rate?: number | string; billableQty?: number | string;
  billQty?: number | string; amount?: number | string; capped?: boolean;
}
/** A cumulative-billable BOQ row from `/api/projects/rab/billable`. */
interface BillableBoqRow {
  boqItemId?: string; boqNo?: string; description?: string; unit?: string;
  rate?: number | string; billableQty?: number | string; billableAmount?: number | string;
}

/**
 * Pull clamped proposed lines from approved DPRs for a period (Phase 2),
 * or the cumulative billable balance from the BOQ (Phase 1). Imperative —
 * the form calls this on the "Pull" button, not on every render.
 */
export async function pullRABLines(
  source: "dpr" | "boq",
  params: { projectId: string; from?: string; to?: string },
): Promise<{
  lines: RabPullLine[];
  sources?: unknown[];
  cappedLines?: number;
  noDprs?: boolean;
}> {
  if (source === "dpr") {
    const qs = new URLSearchParams({
      projectId: params.projectId,
      from: params.from ?? "",
      to: params.to ?? "",
    });
    const res = await fetchApi<{ lines: RabPullLine[]; sources: unknown[]; cappedLines: number; noDprs: boolean }>(
      `/api/projects/rab/from-dpr?${qs.toString()}`,
    );
    return res;
  }
  const qs = new URLSearchParams({ projectId: params.projectId });
  const res = await fetchApi<{ data: BillableBoqRow[] }>(`/api/projects/rab/billable?${qs.toString()}`);
  // Normalise BOQ rows to the same shape the form's line table expects.
  const lines = (res.data ?? []).map((r) => ({
    boqItemId: r.boqItemId,
    boqNo: r.boqNo,
    description: r.description,
    unit: r.unit,
    uomId: "",
    rate: r.rate,
    billableQty: r.billableQty,
    billQty: r.billableQty,
    amount: r.billableAmount,
    capped: false,
  }));
  return { lines, sources: [], cappedLines: 0, noDprs: false };
}
