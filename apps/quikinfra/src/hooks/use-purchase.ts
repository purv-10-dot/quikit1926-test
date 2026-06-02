"use client";

/**
 * React Query hooks for Purchase module — PR, Indent, PO, GRN.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";

const fetchApi = fetchJson;
const mutateApi = mutateJson;

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
    onSuccess: async () => { await refreshListQueries(qc, "purchase-requisitions"); },
    meta: entityMeta("create", "Purchase requisition"),
  });
}

export function useSubmitPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/purchase/requisitions/${id}/submit`, "POST"),
    onSuccess: async () => {
      await refreshListQueries(qc, "purchase-requisitions");
      await qc.invalidateQueries({ queryKey: ["purchase-requisition"] });
    },
    meta: entityMeta("submit", "Purchase requisition"),
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
    onSuccess: async () => { await refreshListQueries(qc, "purchase-orders"); },
    meta: entityMeta("create", "Purchase order"),
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
    onSuccess: async () => {
      await refreshListQueries(qc, "purchase-orders");
      await qc.invalidateQueries({ queryKey: ["purchase-order"] });
    },
    meta: entityMeta("submit", "Purchase order"),
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
    onSuccess: async () => {
      await refreshListQueries(qc, "grns");
      await qc.invalidateQueries({ queryKey: ["grn"] });
    },
    meta: entityMeta("submit", "GRN"),
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
    onSuccess: async () => {
      await refreshListQueries(qc, "grns");
      await refreshListQueries(qc, "purchase-orders");
      await refreshListQueries(qc, "stock-register");
    },
    meta: entityMeta("create", "GRN"),
  });
}

// ─── Approvals ──────────────────────────────────────────────────────

export function useApproveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, comments }: { id: string; action: "approve" | "reject" | "return"; comments?: string }) =>
      mutateApi(`/api/approvals/${id}/${action}`, "POST", { comments }),
    onSuccess: async () => {
      await refreshListQueries(qc, "purchase-requisitions");
      await refreshListQueries(qc, "purchase-orders");
      await refreshListQueries(qc, "grns");
      await qc.invalidateQueries({ queryKey: ["pending-approvals"] });
    },
    meta: {
      successMessage: "Decision recorded",
      errorMessage: "Failed to record decision",
    },
  });
}
