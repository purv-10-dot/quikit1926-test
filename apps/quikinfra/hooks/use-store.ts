"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";
import type { MaterialIssue } from "@/lib/store/material-issue-repository";
import type { GatePass } from "@/lib/store/gate-pass-repository";
import type { GoodReturn } from "@/lib/store/good-return-repository";
import type { StockTransfer } from "@/lib/store/stock-transfer-repository";
import type { GatePassDetail } from "@/lib/store/gate-pass-detail";
import type { GoodReturnDetail } from "@/lib/store/good-return-detail";
import type { StockTransferDetail } from "@/lib/store/stock-transfer-detail";
import type { IssueDetail } from "@/lib/store/material-issue-detail";
import type { ReconciliationDetail } from "@/lib/store/stock-reconciliation-detail";

const fetchApi = fetchJson;
const mutateApi = mutateJson;

export function useStockRegister(params?: {
  projectId?: string;
  locationId?: string;
  lowStockOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.locationId) qs.set("locationId", params.locationId);
  if (params?.lowStockOnly) qs.set("lowStockOnly", "true");
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();

  return useQuery({
    queryKey: ["stock-register", query],
    queryFn: () => fetchApi<{
      data: unknown[];
      total: number;
      summary: { totalItems?: number; totalValue?: number; onOrderValue?: number; lowStockCount?: number };
    }>(`/api/store/stock-register${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useMaterialIssues(params?: { status?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["material-issues", query],
    queryFn: () => fetchApi<{ data: MaterialIssue[] }>(`/api/store/issues${query ? `?${query}` : ""}`),
  });
}

export function useCreateMaterialIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/store/issues", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "material-issues");
      await refreshListQueries(qc, "stock-register");
    },
    meta: entityMeta("create", "Material issue"),
  });
}

/**
 * Single Material Issue — powers the detail page.
 * Disabled when `id` is falsy so the detail page can pass a possibly-
 * undefined route param without tripping an unnecessary request.
 */
export function useMaterialIssue(id: string | null | undefined) {
  return useQuery({
    queryKey: ["material-issue", id],
    queryFn: () => fetchApi<IssueDetail>(`/api/store/issues/${id}`),
    enabled: !!id,
  });
}

export function useUpdateMaterialIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/store/issues/${id}`, "PATCH", data),
    onSuccess: async (data, variables) => {
      await refreshListQueries(qc, "material-issues", {
        updatedRow: data,
        id: variables?.id,
      });
      await qc.invalidateQueries({ queryKey: ["material-issue", variables?.id] });
    },
    meta: entityMeta("update", "Material issue"),
  });
}

// ─── Gate Pass ─────────────────────────────────────────────────────

export function useGatePasses(params?: {
  status?: string;
  type?: string;
  projectId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.type && params.type !== "all") qs.set("type", params.type);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["gate-passes", query],
    queryFn: () => fetchApi<{ data: GatePass[]; total: number }>(`/api/store/gate-passes${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useGatePassCounts() {
  return useQuery({
    queryKey: ["gate-passes", "counts"],
    queryFn: () =>
      fetchApi<{ total: number; byStatus: Record<string, number> }>(
        `/api/store/gate-passes?counts=1`,
      ),
  });
}

export function useCreateGatePass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/store/gate-passes", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "gate-passes"); },
    meta: entityMeta("create", "Gate pass"),
  });
}

/**
 * Single Gate Pass — powers the detail page. Disabled when `id` is
 * falsy so the route component can pass a possibly-undefined param
 * without firing a wasted request.
 */
export function useGatePass(id: string | null | undefined) {
  return useQuery({
    queryKey: ["gate-pass", id],
    queryFn: () => fetchApi<GatePassDetail>(`/api/store/gate-passes/${id}`),
    enabled: !!id,
  });
}

// ─── Good Return ───────────────────────────────────────────────────

export function useGoodReturns(params?: {
  status?: string;
  projectId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["good-returns", query],
    queryFn: () => fetchApi<{ data: GoodReturn[]; total: number }>(`/api/store/good-returns${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useGoodReturnCounts() {
  return useQuery({
    queryKey: ["good-returns", "counts"],
    queryFn: () =>
      fetchApi<{ total: number; byStatus: Record<string, number> }>(
        `/api/store/good-returns?counts=1`,
      ),
  });
}

export function useCreateGoodReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/store/good-returns", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "good-returns");
      await refreshListQueries(qc, "stock-register");
    },
    meta: entityMeta("create", "Good return"),
  });
}

/**
 * Single Good Return — powers the detail page. Disabled when `id` is
 * falsy so the route component can pass a possibly-undefined param
 * without firing a wasted request.
 */
export function useGoodReturn(id: string | null | undefined) {
  return useQuery({
    queryKey: ["good-return", id],
    queryFn: () => fetchApi<GoodReturnDetail>(`/api/store/good-returns/${id}`),
    enabled: !!id,
  });
}

// ─── Stock Transfer ────────────────────────────────────────────────

export function useStockTransfers(params?: { status?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["stock-transfers", query],
    queryFn: () => fetchApi<{ data: StockTransfer[]; total: number }>(`/api/store/transfers${query ? `?${query}` : ""}`),
  });
}

export function useCreateStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/store/transfers", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "stock-transfers");
      await refreshListQueries(qc, "stock-register");
    },
    meta: entityMeta("create", "Stock transfer"),
  });
}

/**
 * Single Stock Transfer — powers the detail page. Disabled when `id`
 * is falsy so the route component can pass a possibly-undefined
 * param without firing a wasted request.
 */
export function useStockTransfer(id: string | null | undefined) {
  return useQuery({
    queryKey: ["stock-transfer", id],
    queryFn: () => fetchApi<StockTransferDetail>(`/api/store/transfers/${id}`),
    enabled: !!id,
  });
}

// ─── Stock Reconciliation ──────────────────────────────────────────

export function useStockReconciliations(params?: { status?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["stock-reconciliations", query],
    queryFn: () => fetchApi<{ data: unknown[]; total: number }>(`/api/store/reconciliations${query ? `?${query}` : ""}`),
  });
}

export function useStockReconciliation(id: string | null | undefined) {
  return useQuery({
    queryKey: ["stock-reconciliation", id],
    queryFn: () => fetchApi<ReconciliationDetail>(`/api/store/reconciliations/${id}`),
    enabled: !!id,
  });
}

export function useSubmitStockReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/store/reconciliations/${id}/submit`, "POST", {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["stock-reconciliations"] });
      qc.invalidateQueries({ queryKey: ["stock-reconciliation", id] });
    },
    meta: entityMeta("update", "Stock reconciliation"),
  });
}

export function useApproveStockReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      action: "approve" | "reject" | "return";
      comments?: string;
    }) =>
      mutateApi(`/api/store/reconciliations/${input.id}/approve`, "POST", {
        action: input.action,
        comments: input.comments,
      }),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ["stock-reconciliations"] });
      qc.invalidateQueries({ queryKey: ["stock-reconciliation", input.id] });
    },
    meta: entityMeta("update", "Stock reconciliation"),
  });
}


// ─── Diesel Log ────────────────────────────────────────────────────

export function useDieselLogs(params?: {
  projectId?: string;
  machineryId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.machineryId) qs.set("machineryId", params.machineryId);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["diesel-logs", query],
    queryFn: () => fetchApi<{ data: unknown[]; total: number }>(`/api/store/diesel-logs${query ? `?${query}` : ""}`),
    placeholderData: (prev) => prev,
  });
}

export function useCreateDieselLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/store/diesel-logs", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "diesel-logs"); },
    meta: entityMeta("create", "Diesel log"),
  });
}
