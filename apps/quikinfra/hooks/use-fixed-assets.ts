"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { equipmentQueryOptions } from "@/lib/react-query/equipment-query";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";
import type {
  FixedAssetAuditRecord,
  FixedAssetDashboardPayload,
  FixedAssetDepreciationRow,
  FixedAssetIssuanceRecord,
  FixedAssetRepairRecord,
  FixedAssetTransferRecord,
} from "@/lib/equipment/fixed-assets-types";

const fetchApi = fetchJson;
const mutateApi = mutateJson;

export function useFixedAssetDashboard() {
  return useQuery({
    queryKey: ["fixed-assets-dashboard"],
    queryFn: () =>
      fetchApi<FixedAssetDashboardPayload>("/api/equipment/fixed-assets/dashboard"),
    ...equipmentQueryOptions,
  });
}

export function useFixedAssetIssuances() {
  return useQuery({
    queryKey: ["fixed-asset-issuances"],
    queryFn: () =>
      fetchApi<{ data: FixedAssetIssuanceRecord[]; total: number }>(
        "/api/equipment/fixed-assets/issuances",
      ),
    ...equipmentQueryOptions,
  });
}

export function useFixedAssetTransfers() {
  return useQuery({
    queryKey: ["fixed-asset-transfers"],
    queryFn: () =>
      fetchApi<{ data: FixedAssetTransferRecord[]; total: number }>(
        "/api/equipment/fixed-assets/transfers",
      ),
    ...equipmentQueryOptions,
  });
}

export function useFixedAssetRepairs() {
  return useQuery({
    queryKey: ["fixed-asset-repairs"],
    queryFn: () =>
      fetchApi<{ data: FixedAssetRepairRecord[]; total: number }>(
        "/api/equipment/fixed-assets/repairs",
      ),
    ...equipmentQueryOptions,
  });
}

export function useFixedAssetAudits() {
  return useQuery({
    queryKey: ["fixed-asset-audits"],
    queryFn: () =>
      fetchApi<{ data: FixedAssetAuditRecord[]; total: number }>(
        "/api/equipment/fixed-assets/audits",
      ),
    ...equipmentQueryOptions,
  });
}

export function useFixedAssetDepreciation() {
  return useQuery({
    queryKey: ["fixed-asset-depreciation"],
    queryFn: () =>
      fetchApi<{ data: FixedAssetDepreciationRow[]; total: number }>(
        "/api/equipment/fixed-assets/depreciation",
      ),
    ...equipmentQueryOptions,
  });
}

export function useCreateFixedAssetIssuance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/fixed-assets/issuances", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-issuances");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("create", "Asset issuance"),
  });
}

export function useReturnFixedAssetIssuance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/fixed-assets/issuances/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-issuances");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("update", "Asset issuance"),
  });
}

export function useCreateFixedAssetTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/fixed-assets/transfers", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-transfers");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("create", "Asset transfer"),
  });
}

export function usePatchFixedAssetTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/fixed-assets/transfers/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-transfers");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("update", "Asset transfer"),
  });
}

export function useCreateFixedAssetRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/fixed-assets/repairs", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-repairs");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("create", "Asset repair"),
  });
}

export function useCloseFixedAssetRepair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/fixed-assets/repairs/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-repairs");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("update", "Asset repair"),
  });
}

export function useCreateFixedAssetAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/fixed-assets/audits", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-audits");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("create", "Physical audit"),
  });
}

export function useAdjustFixedAssetAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/equipment/fixed-assets/audits/${id}`, "PATCH", { action: "adjust" }),
    onSuccess: async () => {
      await refreshListQueries(qc, "fixed-asset-audits");
      await refreshListQueries(qc, "fixed-assets-dashboard");
    },
    meta: entityMeta("update", "Physical audit"),
  });
}
