"use client";

/**
 * React Query hooks for all master data entities.
 * Provides fetching, creating, updating with cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, mutateJson } from "@/lib/react-query/fetch-json";
import { refreshListQueries } from "@/lib/react-query/list-cache";
import { entityMeta } from "@/lib/toast";
import type { DepartmentRecord } from "@/lib/masters/departments-repository";
import type { ProjectRecord } from "@/lib/masters/projects-repository";
import type { UOMRecord } from "@/lib/masters/uoms-repository";
import type { ItemRecord } from "@/lib/masters/items-repository";
import type { VendorRecord } from "@/lib/masters/vendors-repository";
import type { LocationRecord } from "@/lib/masters/locations-repository";
import type { ContractorRecord } from "@/lib/masters/contractors-repository";
import type { CustomerRecord } from "@/lib/masters/customers-repository";
import type { ItemGroupRecord } from "@/lib/masters/item-groups-repository";
import type { GSTCodeRecord } from "@/lib/masters/gst-codes-repository";
import type { TDSCodeRecord } from "@/lib/masters/tds-codes-repository";
import type { WorkCategoryRecord } from "@/lib/masters/work-categories-repository";
import type { CostCenterRecord } from "@/lib/masters/cost-centers-repository";
import type { MachineryRecord } from "@/lib/masters/machinery-repository";
import type { CompanyRecord } from "@/lib/masters/companies-repository";
import type { FinancialYearRecord } from "@/lib/masters/financial-years-repository";
import type { TermsConditionRecord } from "@/lib/masters/terms-repository";
import type { AssetRecord } from "@/lib/masters/assets-repository";

const fetchApi = fetchJson;
const mutateApi = mutateJson;


// ─── Projects ───────────────────────────────────────────────────────

export function useProjects(params?: { search?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["projects", query],
    queryFn: () => fetchApi<{ data: ProjectRecord[]; total: number }>(`/api/masters/projects${query ? `?${query}` : ""}`),
  });
}

// ─── Assets / Tools (Masters) ───────────────────────────────────────

export function useAssets(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["assets", query],
    queryFn: () =>
      fetchApi<{ data: AssetRecord[]; total: number }>(
        `/api/masters/assets${query ? `?${query}` : ""}`,
      ),
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchApi<ProjectRecord>(`/api/masters/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/projects", "POST", data),
    onSuccess: async () => {
      await refreshListQueries(qc, "projects");
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    meta: entityMeta("create", "Project"),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => mutateApi(`/api/masters/projects/${id}`, "PUT", data),
    onSuccess: async (data, { id }) => {
      await refreshListQueries(qc, "projects", { updatedRow: data, id });
      await qc.invalidateQueries({ queryKey: ["project"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    meta: entityMeta("update", "Project"),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mutateApi(`/api/masters/projects/${id}`, "DELETE"),
    onSuccess: async (_data, id) => {
      await refreshListQueries(qc, "projects", { removedId: id });
      await qc.invalidateQueries({ queryKey: ["project"] });
      await qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    meta: entityMeta("delete", "Project"),
  });
}

// ─── UOM ────────────────────────────────────────────────────────────

export function useUOMs() {
  return useQuery({
    queryKey: ["uoms"],
    queryFn: () => fetchApi<{ data: UOMRecord[] }>("/api/masters/uom"),
  });
}

export function useCreateUOM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/uom", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "uoms"); },
    meta: entityMeta("create", "UOM"),
  });
}

// ─── Items ──────────────────────────────────────────────────────────

export function useItems(params?: { search?: string; groupId?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.groupId) qs.set("groupId", params.groupId);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["items", query],
    queryFn: () => fetchApi<{ data: ItemRecord[]; total: number }>(`/api/masters/items${query ? `?${query}` : ""}`),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/items", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "items"); },
    meta: entityMeta("create", "Item"),
  });
}

// ─── Vendors ────────────────────────────────────────────────────────

export function useVendors(params?: { search?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["vendors", query],
    queryFn: () => fetchApi<{ data: VendorRecord[]; total: number }>(`/api/masters/vendors${query ? `?${query}` : ""}`),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/vendors", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "vendors"); },
    meta: entityMeta("create", "Vendor"),
  });
}

// ─── Locations ──────────────────────────────────────────────────────

export function useLocations(params?: { projectId?: string; type?: string }) {
  const qs = new URLSearchParams();
  if (params?.projectId) qs.set("projectId", params.projectId);
  if (params?.type) qs.set("type", params.type);
  const query = qs.toString();

  return useQuery({
    queryKey: ["locations", query],
    queryFn: () => fetchApi<{ data: LocationRecord[] }>(`/api/masters/locations${query ? `?${query}` : ""}`),
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/locations", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "locations"); },
    meta: entityMeta("create", "Location"),
  });
}

// ─── Contractors ────────────────────────────────────────────────────

export function useContractors(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["contractors", query],
    queryFn: () => fetchApi<{ data: ContractorRecord[] }>(`/api/masters/contractors${query ? `?${query}` : ""}`),
  });
}

export function useCreateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/contractors", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "contractors"); },
    meta: entityMeta("create", "Contractor"),
  });
}

// ─── Customers ─────────────────────────────────────────────────────

export function useCustomers(params?: { search?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["customers", query],
    queryFn: () => fetchApi<{ data: CustomerRecord[]; total: number }>(`/api/masters/customers${query ? `?${query}` : ""}`),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/customers", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "customers"); },
    meta: entityMeta("create", "Customer"),
  });
}

// ─── Item Groups ───────────────────────────────────────────────────

export function useItemGroups(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["item-groups", query],
    queryFn: () => fetchApi<{ data: ItemGroupRecord[]; total: number }>(`/api/masters/item-groups${query ? `?${query}` : ""}`),
  });
}

export function useCreateItemGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/item-groups", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "item-groups"); },
    meta: entityMeta("create", "Item group"),
  });
}

// ─── GST Codes ─────────────────────────────────────────────────────

export function useGSTCodes(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["gst-codes", query],
    queryFn: () => fetchApi<{ data: GSTCodeRecord[]; total: number }>(`/api/masters/gst${query ? `?${query}` : ""}`),
  });
}

export function useCreateGSTCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/gst", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "gst-codes"); },
    meta: entityMeta("create", "GST code"),
  });
}

// ─── TDS Codes ─────────────────────────────────────────────────────

export function useTDSCodes(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["tds-codes", query],
    queryFn: () => fetchApi<{ data: TDSCodeRecord[]; total: number }>(`/api/masters/tds${query ? `?${query}` : ""}`),
  });
}

export function useCreateTDSCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/tds", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "tds-codes"); },
    meta: entityMeta("create", "TDS code"),
  });
}

// ─── Departments ───────────────────────────────────────────────────

export function useDepartments(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["departments", query],
    queryFn: () => fetchApi<{ data: DepartmentRecord[]; total: number }>(`/api/masters/departments${query ? `?${query}` : ""}`),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/departments", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "departments"); },
    meta: entityMeta("create", "Department"),
  });
}

// ─── Work Categories ───────────────────────────────────────────────

export function useWorkCategories(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["work-categories", query],
    queryFn: () => fetchApi<{ data: WorkCategoryRecord[]; total: number }>(`/api/masters/work-categories${query ? `?${query}` : ""}`),
  });
}

export function useCreateWorkCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/work-categories", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "work-categories"); },
    meta: entityMeta("create", "Work category"),
  });
}

// ─── Cost Centers ──────────────────────────────────────────────────

export function useCostCenters(params?: { search?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["cost-centers", query],
    queryFn: () => fetchApi<{ data: CostCenterRecord[]; total: number }>(`/api/masters/cost-centers${query ? `?${query}` : ""}`),
  });
}

export function useCreateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/cost-centers", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "cost-centers"); },
    meta: entityMeta("create", "Cost center"),
  });
}

// ─── Machinery ─────────────────────────────────────────────────────

export function useMachinery(params?: { search?: string; projectId?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.projectId) qs.set("projectId", params.projectId);
  const query = qs.toString();

  return useQuery({
    queryKey: ["machinery", query],
    queryFn: () => fetchApi<{ data: MachineryRecord[]; total: number }>(`/api/masters/machinery${query ? `?${query}` : ""}`),
  });
}

export function useCreateMachinery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/machinery", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "machinery"); },
    meta: entityMeta("create", "Machinery"),
  });
}

// ─── Companies ─────────────────────────────────────────────────────

export function useCompanies(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["companies", query],
    queryFn: () => fetchApi<{ data: CompanyRecord[]; total: number }>(`/api/masters/companies${query ? `?${query}` : ""}`),
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/companies", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "companies"); },
    meta: entityMeta("create", "Company"),
  });
}

// ─── Financial Years ───────────────────────────────────────────────

export function useFinancialYears(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["financial-years", query],
    queryFn: () => fetchApi<{ data: FinancialYearRecord[]; total: number }>(`/api/masters/financial-years${query ? `?${query}` : ""}`),
  });
}

export function useCreateFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/financial-years", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "financial-years"); },
    meta: entityMeta("create", "Financial year"),
  });
}

// ─── Terms & Conditions ────────────────────────────────────────────

export function useTermsConditions(params?: { search?: string; applicableTo?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.applicableTo) qs.set("applicableTo", params.applicableTo);
  const query = qs.toString();

  return useQuery({
    queryKey: ["terms-conditions", query],
    queryFn: () => fetchApi<{ data: TermsConditionRecord[]; total: number }>(`/api/masters/terms${query ? `?${query}` : ""}`),
  });
}

export function useCreateTermsCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: unknown) => mutateApi("/api/masters/terms", "POST", data),
    onSuccess: async () => { await refreshListQueries(qc, "terms-conditions"); },
    meta: entityMeta("create", "Terms & conditions"),
  });
}

// ═══════════════════════════════════════════════════════════════════
// Update mutations
//
// Every master entity gets a `useUpdate*` twin to the `useCreate*` above.
// All three variants (the legacy create hooks, the new update hooks, and
// the delete hooks) share the same query key so the list re-renders after
// any mutation. The update payload shape is always { id, ...patch } —
// the id is stripped into the URL, everything else becomes the body.
//
// Backend: POST → /api/masters/<entity>, PUT → /api/masters/<entity>/<id>
// ═══════════════════════════════════════════════════════════════════

function makeUpdateHook(endpoint: string, queryKey: string, entity: string) {
  return function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
        mutateApi(`${endpoint}/${id}`, "PUT", data),
      onSuccess: async (data, { id }) => {
        await refreshListQueries(qc, queryKey, { updatedRow: data, id });
      },
      meta: entityMeta("update", entity),
    });
  };
}

function makeDeleteHook(endpoint: string, queryKey: string, entity: string) {
  return function useDelete() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => mutateApi(`${endpoint}/${id}`, "DELETE"),
      onSuccess: async (_data, id) => {
        await refreshListQueries(qc, queryKey, { removedId: id });
      },
      meta: entityMeta("delete", entity),
    });
  };
}

// UOM
export const useUpdateUOM = makeUpdateHook("/api/masters/uom", "uoms", "UOM");
export const useDeleteUOM = makeDeleteHook("/api/masters/uom", "uoms", "UOM");

// Items
export const useUpdateItem = makeUpdateHook("/api/masters/items", "items", "Item");
export const useDeleteItem = makeDeleteHook("/api/masters/items", "items", "Item");

// Vendors
export const useUpdateVendor = makeUpdateHook("/api/masters/vendors", "vendors", "Vendor");
export const useDeleteVendor = makeDeleteHook("/api/masters/vendors", "vendors", "Vendor");

// Locations
export const useUpdateLocation = makeUpdateHook("/api/masters/locations", "locations", "Location");
export const useDeleteLocation = makeDeleteHook("/api/masters/locations", "locations", "Location");

// Contractors
export const useUpdateContractor = makeUpdateHook("/api/masters/contractors", "contractors", "Contractor");
export const useDeleteContractor = makeDeleteHook("/api/masters/contractors", "contractors", "Contractor");

// Customers
export const useUpdateCustomer = makeUpdateHook("/api/masters/customers", "customers", "Customer");
export const useDeleteCustomer = makeDeleteHook("/api/masters/customers", "customers", "Customer");

// Item Groups
export const useUpdateItemGroup = makeUpdateHook("/api/masters/item-groups", "item-groups", "Item group");
export const useDeleteItemGroup = makeDeleteHook("/api/masters/item-groups", "item-groups", "Item group");

// GST Codes
export const useUpdateGSTCode = makeUpdateHook("/api/masters/gst", "gst-codes", "GST code");
export const useDeleteGSTCode = makeDeleteHook("/api/masters/gst", "gst-codes", "GST code");

// TDS Codes
export const useUpdateTDSCode = makeUpdateHook("/api/masters/tds", "tds-codes", "TDS code");
export const useDeleteTDSCode = makeDeleteHook("/api/masters/tds", "tds-codes", "TDS code");

// Departments
export const useUpdateDepartment = makeUpdateHook("/api/masters/departments", "departments", "Department");
export const useDeleteDepartment = makeDeleteHook("/api/masters/departments", "departments", "Department");

// Work Categories
export const useUpdateWorkCategory = makeUpdateHook("/api/masters/work-categories", "work-categories", "Work category");
export const useDeleteWorkCategory = makeDeleteHook("/api/masters/work-categories", "work-categories", "Work category");

// Cost Centers
export const useUpdateCostCenter = makeUpdateHook("/api/masters/cost-centers", "cost-centers", "Cost center");
export const useDeleteCostCenter = makeDeleteHook("/api/masters/cost-centers", "cost-centers", "Cost center");

// Machinery
export const useUpdateMachinery = makeUpdateHook("/api/masters/machinery", "machinery", "Machinery");
export const useDeleteMachinery = makeDeleteHook("/api/masters/machinery", "machinery", "Machinery");

// Companies
export const useUpdateCompany = makeUpdateHook("/api/masters/companies", "companies", "Company");
export const useDeleteCompany = makeDeleteHook("/api/masters/companies", "companies", "Company");

// Financial Years
export const useUpdateFinancialYear = makeUpdateHook("/api/masters/financial-years", "financial-years", "Financial year");
export const useDeleteFinancialYear = makeDeleteHook("/api/masters/financial-years", "financial-years", "Financial year");

// Terms & Conditions
export const useUpdateTermsCondition = makeUpdateHook("/api/masters/terms", "terms-conditions", "Terms & conditions");
export const useDeleteTermsCondition = makeDeleteHook("/api/masters/terms", "terms-conditions", "Terms & conditions");
