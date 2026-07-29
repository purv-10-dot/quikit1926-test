"use client";

/**
 * React Query hooks for Approvals module.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { entityMeta } from "@/lib/toast";
import type { EnrichedIndent } from "@/lib/purchase/indent-repository";
import type { EnrichedRfq } from "@/lib/purchase/rfq-repository";
import type { CentralUserRecord } from "@/lib/users/central-repository";
import type { IndentDetail } from "@/lib/purchase/indent-detail";
import type { RfqDetail } from "@/lib/purchase/rfq-detail";

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

export function usePendingApprovals(params?: { entityType?: string; projectId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.entityType && params.entityType !== "all") qs.set("entityType", params.entityType);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["pending-approvals", query],
    queryFn: () => fetchApi<{ data: unknown[]; total: number }>(`/api/approvals/pending${query ? `?${query}` : ""}`),
  });
}

export function useApprovalHistory(instanceId: string | null) {
  return useQuery({
    queryKey: ["approval-history", instanceId],
    queryFn: () => fetchApi<{ data: unknown[] }>(`/api/approvals/${instanceId}/history`),
    enabled: !!instanceId,
  });
}

export function useApproveAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, comments }: { id: string; action: "approve" | "reject" | "return"; comments?: string }) =>
      mutateApi(`/api/approvals/${id}/${action}`, "POST", { comments }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-approvals"] });
      qc.invalidateQueries({ queryKey: ["purchase-requisitions"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      qc.invalidateQueries({ queryKey: ["dprs"] });
      // Every entity above feeds a dashboard KPI tile, and an approval is
      // what moves them between the counted states.
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    meta: { successMessage: "Decision recorded", errorMessage: "Failed to record decision" },
  });
}

// ─── Indents (Purchase module hook that was missing) ───────────────

export function useIndents(params?: { status?: string; projectId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["indents", query],
    queryFn: () => fetchApi<{ data: EnrichedIndent[]; total: number }>(`/api/purchase/indents${query ? `?${query}` : ""}`),
  });
}

export function useCreateIndent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/purchase/indents", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indents"] }),
    meta: entityMeta("create", "Indent"),
  });
}

export function useIndent(id: string | null) {
  return useQuery({
    queryKey: ["indent", id],
    queryFn: () => fetchApi<IndentDetail>(`/api/purchase/indents/${id}`),
    enabled: !!id,
  });
}

export function useSubmitIndent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/purchase/indents/${id}/submit`, "POST"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indents"] });
      qc.invalidateQueries({ queryKey: ["indent"] });
    },
    meta: entityMeta("submit", "Indent"),
  });
}

export function useDeleteIndent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/purchase/indents/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indents"] }),
    meta: entityMeta("delete", "Indent"),
  });
}

// ─── RFQ ───────────────────────────────────────────────────────────

export function useRFQs(params?: { status?: string; projectId?: string; search?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["rfqs", query],
    queryFn: () => fetchApi<{ data: EnrichedRfq[]; total: number }>(`/api/purchase/rfqs${query ? `?${query}` : ""}`),
  });
}

export function useCreateRFQ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/purchase/rfqs", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfqs"] }),
    meta: entityMeta("create", "RFQ"),
  });
}

export function useRFQ(id: string | null) {
  return useQuery({
    queryKey: ["rfq", id],
    queryFn: () => fetchApi<RfqDetail>(`/api/purchase/rfqs/${id}`),
    enabled: !!id,
  });
}

export function useSubmitRFQ() {
  const qc = useQueryClient();
  return useMutation({
    // Accepts either a bare `id` (legacy list-page quick submit) or
    // `{ id, emailHtmlBodies }` so the submit-preview modal can ship
    // each vendor's edited cover-email body to the server. The
    // override map is keyed by `vendorId`; entries with empty/missing
    // values fall back to the default template per vendor.
    mutationFn: (
      input: string | { id: string; emailHtmlBodies?: Record<string, string> },
    ) => {
      const id = typeof input === "string" ? input : input.id;
      const emailHtmlBodies =
        typeof input === "string" ? undefined : input.emailHtmlBodies;
      const hasOverrides =
        emailHtmlBodies && Object.keys(emailHtmlBodies).length > 0;
      return mutateApi(
        `/api/purchase/rfqs/${id}/submit`,
        "POST",
        hasOverrides ? { emailHtmlBodies } : undefined,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rfqs"] });
      qc.invalidateQueries({ queryKey: ["rfq"] });
    },
    meta: entityMeta("submit", "RFQ"),
  });
}

export function useDeleteRFQ() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/purchase/rfqs/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rfqs"] }),
    meta: entityMeta("delete", "RFQ"),
  });
}

// ─── Settings: Users ───────────────────────────────────────────────

export function useUsers(params?: { search?: string; role?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.role) qs.set("role", params.role);
  const query = qs.toString();

  return useQuery({
    queryKey: ["users", query],
    queryFn: () => fetchApi<{ data: CentralUserRecord[]; total: number }>(`/api/settings/users${query ? `?${query}` : ""}`),
  });
}

// ─── Settings: Workflows ───────────────────────────────────────────

export function useWorkflows(params?: {
  entityType?: string;
  // `"default"` / `null` filters to Default rows only; any other string
  // filters to that project's overrides; `undefined` returns everything.
  projectId?: string | null;
}) {
  const qs = new URLSearchParams();
  if (params?.entityType) qs.set("entityType", params.entityType);
  if (params?.projectId === null || params?.projectId === "default") {
    qs.set("projectId", "default");
  } else if (typeof params?.projectId === "string") {
    qs.set("projectId", params.projectId);
  }
  const query = qs.toString();

  return useQuery({
    queryKey: ["workflows", query],
    queryFn: () => fetchApi<{ data: unknown[]; total: number }>(`/api/settings/workflows${query ? `?${query}` : ""}`),
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/settings/workflows", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
    meta: entityMeta("create", "Workflow"),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/settings/workflows/${id}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
    meta: entityMeta("delete", "Workflow"),
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/settings/workflows/${id}`, "PATCH", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
    meta: entityMeta("update", "Workflow"),
  });
}
