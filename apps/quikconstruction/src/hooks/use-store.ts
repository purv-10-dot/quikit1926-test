"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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

export function useStockRegister(params?: { projectId?: string; locationId?: string; lowStockOnly?: boolean; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.locationId) qs.set("locationId", params.locationId);
  if (params?.lowStockOnly) qs.set("lowStockOnly", "true");
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["stock-register", query],
    queryFn: () => fetchApi<{ data: any[]; total: number; summary: any }>(`/api/store/stock-register${query ? `?${query}` : ""}`),
  });
}

export function useMaterialIssues(params?: { status?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["material-issues", query],
    queryFn: () => fetchApi<{ data: any[] }>(`/api/store/issues${query ? `?${query}` : ""}`),
  });
}

export function useCreateMaterialIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/store/issues", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["material-issues"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
    },
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
    queryFn: () => fetchApi<any>(`/api/store/issues/${id}`),
    enabled: !!id,
  });
}

export function useUpdateMaterialIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) =>
      mutateApi(`/api/store/issues/${id}`, "PATCH", data),
    onSuccess: (_, variables: any) => {
      qc.invalidateQueries({ queryKey: ["material-issues"] });
      qc.invalidateQueries({ queryKey: ["material-issue", variables?.id] });
    },
  });
}

// ─── Gate Pass ─────────────────────────────────────────────────────

export function useGatePasses(params?: { status?: string; type?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.type && params.type !== "all") qs.set("type", params.type);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["gate-passes", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/store/gate-passes${query ? `?${query}` : ""}`),
  });
}

export function useCreateGatePass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/store/gate-passes", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gate-passes"] }),
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
    queryFn: () => fetchApi<any>(`/api/store/gate-passes/${id}`),
    enabled: !!id,
  });
}

// ─── Good Return ───────────────────────────────────────────────────

export function useGoodReturns(params?: { status?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["good-returns", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/store/good-returns${query ? `?${query}` : ""}`),
  });
}

export function useCreateGoodReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/store/good-returns", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["good-returns"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
    },
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
    queryFn: () => fetchApi<any>(`/api/store/good-returns/${id}`),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/store/transfers${query ? `?${query}` : ""}`),
  });
}

export function useCreateStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/store/transfers", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-transfers"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
    },
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
    queryFn: () => fetchApi<any>(`/api/store/transfers/${id}`),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/store/reconciliations${query ? `?${query}` : ""}`),
  });
}

export function useCreateStockReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/store/reconciliations", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-reconciliations"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
    },
  });
}

// ─── Diesel Log ────────────────────────────────────────────────────

export function useDieselLogs(params?: { projectId?: string; machineryId?: string; fromDate?: string; toDate?: string }) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.machineryId) qs.set("machineryId", params.machineryId);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  const query = qs.toString();

  return useQuery({
    queryKey: ["diesel-logs", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/store/diesel-logs${query ? `?${query}` : ""}`),
  });
}

export function useCreateDieselLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/store/diesel-logs", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["diesel-logs"] }),
  });
}
