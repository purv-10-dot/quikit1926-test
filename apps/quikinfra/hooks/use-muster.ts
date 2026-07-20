"use client";

/**
 * React Query hooks for Muster Rolls (labour attendance).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";
import type { MusterRecord } from "@/lib/labour/muster-repository";

export function useMusters(params?: {
  projectId?: string;
  contractorId?: string;
  engagementType?: string;
  docStatus?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.contractorId) qs.set("contractorId", params.contractorId);
  if (params?.engagementType) qs.set("engagementType", params.engagementType);
  if (params?.docStatus) qs.set("docStatus", params.docStatus);
  if (params?.dateFrom) qs.set("dateFrom", params.dateFrom);
  if (params?.dateTo) qs.set("dateTo", params.dateTo);
  const query = qs.toString();
  return useQuery({
    queryKey: ["musters", query],
    queryFn: () =>
      fetchJson<{ data: MusterRecord[]; total: number }>(`/api/projects/muster${query ? `?${query}` : ""}`),
  });
}

export function useMuster(id: string | null) {
  return useQuery({
    queryKey: ["muster", id],
    queryFn: () => fetchJson<MusterRecord>(`/api/projects/muster/${id}`),
    enabled: !!id,
  });
}

export function useCreateMuster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateJson("/api/projects/muster", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "musters"); },
    meta: entityMeta("create", "Muster"),
  });
}

export function useUpdateMuster() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateJson(`/api/projects/muster/${id}`, "PATCH", data),
    onSuccess: async (data, { id }) => {
      await refreshListQueries(qc, "musters", { updatedRow: data, id });
      await qc.invalidateQueries({ queryKey: ["muster"] });
    },
    meta: entityMeta("update", "Muster"),
  });
}

function makeActionHook(action: "submit" | "approve" | "reverse") {
  return function useAction() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
        mutateJson(`/api/projects/muster/${id}/${action}`, "POST", reason ? { reason } : undefined),
      onSuccess: async (data, { id }) => {
        await refreshListQueries(qc, "musters", { updatedRow: data, id });
        await qc.invalidateQueries({ queryKey: ["muster"] });
      },
      meta: entityMeta("update", "Muster"),
    });
  };
}

export const useSubmitMuster = makeActionHook("submit");
export const useApproveMuster = makeActionHook("approve");
export const useReverseMuster = makeActionHook("reverse");

export async function fetchMusterPrefill(params: {
  projectId: string; date: string; engagementType: string; contractorId?: string | null; shift?: string;
}): Promise<Array<{ workmanId: string; labourCategoryId: string }>> {
  const qs = new URLSearchParams();
  qs.set("projectId", params.projectId);
  qs.set("date", params.date);
  qs.set("engagementType", params.engagementType);
  if (params.contractorId) qs.set("contractorId", params.contractorId);
  if (params.shift) qs.set("shift", params.shift);
  const res = await fetchJson<{ data: Array<{ workmanId: string; labourCategoryId: string }> }>(
    `/api/projects/muster/prefill?${qs.toString()}`,
  );
  return res.data ?? [];
}
