"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { equipmentQueryOptions } from "@/lib/react-query/equipment-query";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";
import type {
  EquipmentLogRecord,
  FuelReconciliationRow,
  JobCardRecord,
  MaintenanceDueRecord,
  EquipmentTransferRecord,
  EquipmentDocumentRecord,
  DeploymentSummary,
  FleetDashboardPayload,
  CostSheetPayload,
  Machine360Payload,
  HireRateRecord,
  HireInVerificationRecord,
  RentOutBillRecord,
  HireRentSummary,
} from "@/lib/equipment/equipment-types";

const fetchApi = fetchJson;
const mutateApi = mutateJson;

export interface EquipmentLogSummary {
  logEntries: number;
  pendingApproval: number;
  runHoursKm: number;
  breakdownHrs: number;
  dieselLitres: number;
}

export function useEquipmentLogs(params?: {
  projectId?: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  const query = qs.toString();

  return useQuery({
    queryKey: ["equipment-logs", query],
    queryFn: () =>
      fetchApi<{ data: EquipmentLogRecord[]; total: number }>(
        `/api/equipment/logs${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
  });
}

export function useEquipmentLogSummary(params?: {
  projectId?: string;
  status?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("summary", "true");
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["equipment-logs-summary", query],
    queryFn: () => fetchApi<EquipmentLogSummary>(`/api/equipment/logs?${query}`),
    ...equipmentQueryOptions,
  });
}

export function useEquipmentLog(id: string | null | undefined) {
  return useQuery({
    queryKey: ["equipment-log", id],
    queryFn: () => fetchApi<EquipmentLogRecord>(`/api/equipment/logs/${id}`),
    ...equipmentQueryOptions,
    enabled: !!id,
  });
}

export function useCreateEquipmentLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/equipment/logs", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "equipment-logs");
      await refreshListQueries(qc, "equipment-logs-summary");
      await refreshListQueries(qc, "fleet-dashboard");
    },
    meta: entityMeta("create", "Equipment log"),
  });
}

export function usePatchEquipmentLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/logs/${id}`, "PATCH", data),
    onSuccess: async (_data, variables) => {
      await refreshListQueries(qc, "equipment-logs");
      await refreshListQueries(qc, "equipment-logs-summary");
      await refreshListQueries(qc, "fleet-dashboard");
      await qc.invalidateQueries({ queryKey: ["equipment-log", variables.id] });
    },
    meta: entityMeta("update", "Equipment log"),
  });
}

export function useFuelReconciliation(params?: {
  projectId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  const query = qs.toString();

  return useQuery({
    queryKey: ["fuel-reconciliation", query],
    queryFn: () =>
      fetchApi<{ data: FuelReconciliationRow[] }>(
        `/api/equipment/fuel-reconciliation${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
    enabled: true,
  });
}

export interface JobCardSummary {
  overdue: number;
  dueSoon: number;
  openJobCards: number;
  maintenanceCost: number;
}

export function useJobCards(params?: { projectId?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["job-cards", query],
    queryFn: () =>
      fetchApi<{ data: JobCardRecord[]; total: number }>(
        `/api/equipment/job-cards${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
  });
}

export function useJobCardSummary(params?: { projectId?: string }) {
  const qs = new URLSearchParams();
  qs.set("summary", "true");
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["job-cards-summary", query],
    queryFn: () => fetchApi<JobCardSummary>(`/api/equipment/job-cards?${query}`),
    ...equipmentQueryOptions,
  });
}

export function useMaintenanceDue() {
  return useQuery({
    queryKey: ["maintenance-due"],
    queryFn: () =>
      fetchApi<{ data: MaintenanceDueRecord[] }>(
        "/api/equipment/maintenance-due",
      ),
    ...equipmentQueryOptions,
  });
}

export function useCreateJobCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/job-cards", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "job-cards");
      await refreshListQueries(qc, "job-cards-summary");
      await refreshListQueries(qc, "maintenance-due");
      await refreshListQueries(qc, "fleet-dashboard");
    },
    meta: entityMeta("create", "Job card"),
  });
}

export function usePatchJobCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/job-cards/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "job-cards");
      await refreshListQueries(qc, "job-cards-summary");
      await refreshListQueries(qc, "maintenance-due");
      await refreshListQueries(qc, "fleet-dashboard");
    },
    meta: entityMeta("update", "Job card"),
  });
}

export function useEquipmentTransfers(params?: { status?: string }) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["equipment-transfers", query],
    queryFn: () =>
      fetchApi<{ data: EquipmentTransferRecord[]; total: number }>(
        `/api/equipment/transfers${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
  });
}

export function useDeploymentSummary() {
  return useQuery({
    queryKey: ["deployment-summary"],
    queryFn: () =>
      fetchApi<DeploymentSummary>("/api/equipment/transfers?summary=true"),
    ...equipmentQueryOptions,
  });
}

export function useEquipmentDocuments() {
  return useQuery({
    queryKey: ["equipment-documents"],
    queryFn: () =>
      fetchApi<{ data: EquipmentDocumentRecord[]; total: number }>(
        "/api/equipment/documents",
      ),
    ...equipmentQueryOptions,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/transfers", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "equipment-transfers");
      await refreshListQueries(qc, "deployment-summary");
    },
    meta: entityMeta("create", "Equipment transfer"),
  });
}

export function usePatchTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/transfers/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "equipment-transfers");
      await refreshListQueries(qc, "deployment-summary");
    },
    meta: entityMeta("update", "Equipment transfer"),
  });
}

export function useCreateEquipmentDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/documents", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "equipment-documents");
      await refreshListQueries(qc, "deployment-summary");
    },
    meta: entityMeta("create", "Compliance document"),
  });
}

export function useDeleteEquipmentDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutateApi(`/api/equipment/documents/${id}`, "DELETE"),
    onSuccess: async () => {
      await refreshListQueries(qc, "equipment-documents");
      await refreshListQueries(qc, "deployment-summary");
    },
    meta: entityMeta("delete", "Compliance document"),
  });
}

export function useFleetDashboard(params?: {
  projectId?: string;
  fromDate?: string;
  toDate?: string;
  refresh?: boolean;
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.fromDate) qs.set("from", params.fromDate);
  if (params?.toDate) qs.set("to", params.toDate);
  if (params?.refresh) qs.set("refresh", "true");
  const query = qs.toString();

  return useQuery({
    queryKey: ["fleet-dashboard", query],
    queryFn: () =>
      fetchApi<FleetDashboardPayload>(
        `/api/equipment/fleet-dashboard${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
  });
}

export function useCostSheet(params?: {
  equipmentId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.equipmentId) qs.set("equipmentId", params.equipmentId);
  if (params?.fromDate) qs.set("from", params.fromDate);
  if (params?.toDate) qs.set("to", params.toDate);
  const query = qs.toString();

  return useQuery({
    queryKey: ["cost-sheet", query],
    queryFn: () =>
      fetchApi<CostSheetPayload>(`/api/equipment/cost-sheet?${query}`),
    ...equipmentQueryOptions,
    enabled: !!params?.equipmentId,
  });
}

export function useMachine360(
  id: string | null | undefined,
  params?: { fromDate?: string; toDate?: string },
) {
  const qs = new URLSearchParams();
  if (params?.fromDate) qs.set("from", params.fromDate);
  if (params?.toDate) qs.set("to", params.toDate);
  const query = qs.toString();

  return useQuery({
    queryKey: ["machine-360", id, query],
    queryFn: () =>
      fetchApi<Machine360Payload>(
        `/api/equipment/machines/${id}/360${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
    enabled: !!id,
  });
}

export function useHireRentSummary() {
  return useQuery({
    queryKey: ["hire-rent-summary"],
    queryFn: () =>
      fetchApi<HireRentSummary>("/api/equipment/hire-rates?summary=true"),
    ...equipmentQueryOptions,
  });
}

export function useHireRates(params?: { direction?: string }) {
  const qs = new URLSearchParams();
  if (params?.direction && params.direction !== "all") {
    qs.set("direction", params.direction);
  }
  const query = qs.toString();

  return useQuery({
    queryKey: ["hire-rates", query],
    queryFn: () =>
      fetchApi<{ data: HireRateRecord[]; total: number }>(
        `/api/equipment/hire-rates${query ? `?${query}` : ""}`,
      ),
    ...equipmentQueryOptions,
  });
}

export function useHireInVerifications() {
  return useQuery({
    queryKey: ["hire-in-verifications"],
    queryFn: () =>
      fetchApi<{ data: HireInVerificationRecord[]; total: number }>(
        "/api/equipment/hire-in-verifications",
      ),
    ...equipmentQueryOptions,
  });
}

export function useRentOutBills() {
  return useQuery({
    queryKey: ["rent-out-bills"],
    queryFn: () =>
      fetchApi<{ data: RentOutBillRecord[]; total: number }>(
        "/api/equipment/rent-out-bills",
      ),
    ...equipmentQueryOptions,
  });
}

export function useCreateHireRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/hire-rates", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "hire-rates");
      await refreshListQueries(qc, "hire-rent-summary");
    },
    meta: entityMeta("create", "Hire rate"),
  });
}

export function useCreateHireInVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/hire-in-verifications", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "hire-in-verifications");
      await refreshListQueries(qc, "hire-rent-summary");
    },
    meta: entityMeta("create", "Hire-in verification"),
  });
}

export function usePatchHireInVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/hire-in-verifications/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "hire-in-verifications");
      await refreshListQueries(qc, "hire-rent-summary");
    },
    meta: entityMeta("update", "Hire-in verification"),
  });
}

export function useCreateRentOutBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) =>
      mutateApi("/api/equipment/rent-out-bills", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "rent-out-bills");
      await refreshListQueries(qc, "hire-rent-summary");
    },
    meta: entityMeta("create", "Rent-out bill"),
  });
}

export function usePatchRentOutBill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      mutateApi(`/api/equipment/rent-out-bills/${id}`, "PATCH", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "rent-out-bills");
      await refreshListQueries(qc, "hire-rent-summary");
    },
    meta: entityMeta("update", "Rent-out bill"),
  });
}
