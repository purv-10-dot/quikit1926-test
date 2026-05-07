"use client";

/**
 * React Query hooks for Purchase module — PR, Indent, PO, GRN.
 */

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

// ─── Purchase Requisitions ──────────────────────────────────────────

export function usePurchaseRequisitions(params?: { status?: string; projectId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["purchase-requisitions", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/purchase/requisitions${query ? `?${query}` : ""}`),
  });
}

export function usePurchaseRequisition(id: string | null) {
  return useQuery({
    queryKey: ["purchase-requisition", id],
    queryFn: () => fetchApi<any>(`/api/purchase/requisitions/${id}`),
    enabled: !!id,
  });
}

export function useCreatePR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/purchase/requisitions", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-requisitions"] }),
  });
}

export function useSubmitPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/purchase/requisitions/${id}/submit`, "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-requisitions"] });
      qc.invalidateQueries({ queryKey: ["purchase-requisition"] });
    },
  });
}

// ─── Purchase Orders ────────────────────────────────────────────────

export function usePurchaseOrders(params?: { status?: string; projectId?: string; vendorId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.vendorId) qs.set("vendorId", params.vendorId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["purchase-orders", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/purchase/orders${query ? `?${query}` : ""}`),
  });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => fetchApi<any>(`/api/purchase/orders/${id}`),
    enabled: !!id,
  });
}

export function useCreatePO() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/purchase/orders", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
}

export function useSubmitPO() {
  const qc = useQueryClient();
  return useMutation({
    // Accepts either a bare `id` (legacy callers from the list page)
    // or `{ id, emailHtmlBody }` so the submit-preview modal can ship
    // the user's edited cover-email body to the server.
    mutationFn: (input: string | { id: string; emailHtmlBody?: string }) => {
      const id = typeof input === "string" ? input : input.id;
      const emailHtmlBody =
        typeof input === "string" ? undefined : input.emailHtmlBody;
      return mutateApi(
        `/api/purchase/orders/${id}/submit`,
        "POST",
        emailHtmlBody ? { emailHtmlBody } : undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-order"] });
    },
  });
}

// ─── GRN ────────────────────────────────────────────────────────────

export function useGRNs(params?: { status?: string; projectId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["grns", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/purchase/grn${query ? `?${query}` : ""}`),
  });
}

export function useSubmitGRN() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/purchase/grn/${id}/submit`, "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["grn"] });
    },
  });
}

export function useGRN(id: string | null) {
  return useQuery({
    queryKey: ["grn", id],
    queryFn: () => fetchApi<any>(`/api/purchase/grn/${id}`),
    enabled: !!id,
  });
}

export function useCreateGRN() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/purchase/grn", "POST", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["stock-register"] });
    },
  });
}

// ─── Approvals ──────────────────────────────────────────────────────

export function useApproveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, comments }: { id: string; action: "approve" | "reject" | "return"; comments?: string }) =>
      mutateApi(`/api/approvals/${id}/${action}`, "POST", { comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-requisitions"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
    },
  });
}
