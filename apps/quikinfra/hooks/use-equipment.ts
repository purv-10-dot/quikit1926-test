"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { equipmentQueryOptions } from "@/lib/react-query/equipment-query";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";
import type {
  EquipmentLogRecord,
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
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.fromDate) qs.set("fromDate", params.fromDate);
  if (params?.toDate) qs.set("toDate", params.toDate);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["equipment-logs", query],
    queryFn: () =>
      fetchApi<{ data: EquipmentLogRecord[]; total: number }>(
        `/api/equipment/logs${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
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


export interface JobCardSummary {
  overdue: number;
  dueSoon: number;
  openJobCards: number;
  maintenanceCost: number;
}

export function useJobCards(params?: {
  projectId?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["job-cards", query],
    queryFn: () =>
      fetchApi<{ data: JobCardRecord[]; total: number }>(
        `/api/equipment/job-cards${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
    ...equipmentQueryOptions,
  });
}

export function useJobCard(id: string | null | undefined) {
  return useQuery({
    queryKey: ["job-card", id],
    queryFn: () => fetchApi<JobCardRecord>(`/api/equipment/job-cards/${id}`),
    ...equipmentQueryOptions,
    enabled: !!id,
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
    onSuccess: async (_data, variables) => {
      await refreshListQueries(qc, "job-cards");
      await refreshListQueries(qc, "job-cards-summary");
      await refreshListQueries(qc, "maintenance-due");
      await refreshListQueries(qc, "fleet-dashboard");
      await qc.invalidateQueries({ queryKey: ["job-card", variables.id] });
    },
    meta: entityMeta("update", "Job card"),
  });
}

export function useEquipmentTransfers(params?: {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.status && params.status !== "all") qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["equipment-transfers", query],
    queryFn: () =>
      fetchApi<{ data: EquipmentTransferRecord[]; total: number }>(
        `/api/equipment/transfers${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
    ...equipmentQueryOptions,
  });
}

export function useEquipmentTransfer(id: string | null | undefined) {
  return useQuery({
    queryKey: ["equipment-transfer", id],
    queryFn: () => fetchApi<EquipmentTransferRecord>(`/api/equipment/transfers/${id}`),
    ...equipmentQueryOptions,
    enabled: !!id,
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

export function useHireRates(params?: {
  direction?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.direction && params.direction !== "all") {
    qs.set("direction", params.direction);
  }
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["hire-rates", query],
    queryFn: () =>
      fetchApi<{ data: HireRateRecord[]; total: number }>(
        `/api/equipment/hire-rates${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
    ...equipmentQueryOptions,
  });
}

export function useHireInVerifications(params?: {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["hire-in-verifications", query],
    queryFn: () =>
      fetchApi<{ data: HireInVerificationRecord[]; total: number }>(
        `/api/equipment/hire-in-verifications${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
    ...equipmentQueryOptions,
  });
}

export function useHireInVerification(id: string | null | undefined) {
  return useQuery({
    queryKey: ["hire-in-verification", id],
    queryFn: () =>
      fetchApi<HireInVerificationRecord>(
        `/api/equipment/hire-in-verifications/${id}`,
      ),
    ...equipmentQueryOptions,
    enabled: !!id,
  });
}

export function useRentOutBills(params?: {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.sortOrder) qs.set("sortOrder", params.sortOrder);
  const query = qs.toString();

  return useQuery({
    queryKey: ["rent-out-bills", query],
    queryFn: () =>
      fetchApi<{ data: RentOutBillRecord[]; total: number }>(
        `/api/equipment/rent-out-bills${query ? `?${query}` : ""}`,
      ),
    placeholderData: (prev) => prev,
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
