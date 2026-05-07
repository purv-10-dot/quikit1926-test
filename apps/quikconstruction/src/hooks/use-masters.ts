"use client";

/**
 * React Query hooks for all master data entities.
 * Provides fetching, creating, updating with cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ─── Generic fetch helper ───────────────────────────────────────────

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


// ─── Projects ───────────────────────────────────────────────────────

export function useProjects(params?: { search?: string; status?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.status) qs.set("status", params.status);
  const query = qs.toString();

  return useQuery({
    queryKey: ["projects", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/projects${query ? `?${query}` : ""}`),
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => fetchApi<any>(`/api/masters/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/projects", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => mutateApi(`/api/masters/projects/${id}`, "PUT", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["project"] });
    },
  });
}

// ─── UOM ────────────────────────────────────────────────────────────

export function useUOMs() {
  return useQuery({
    queryKey: ["uoms"],
    queryFn: () => fetchApi<{ data: any[] }>("/api/masters/uom"),
  });
}

export function useCreateUOM() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/uom", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uoms"] }),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/items${query ? `?${query}` : ""}`),
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/items", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/vendors${query ? `?${query}` : ""}`),
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/vendors", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vendors"] }),
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
    queryFn: () => fetchApi<{ data: any[] }>(`/api/masters/locations${query ? `?${query}` : ""}`),
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/locations", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

// ─── Contractors ────────────────────────────────────────────────────

export function useContractors(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["contractors", query],
    queryFn: () => fetchApi<{ data: any[] }>(`/api/masters/contractors${query ? `?${query}` : ""}`),
  });
}

export function useCreateContractor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/contractors", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contractors"] }),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/customers${query ? `?${query}` : ""}`),
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/customers", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

// ─── Item Groups ───────────────────────────────────────────────────

export function useItemGroups(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["item-groups", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/item-groups${query ? `?${query}` : ""}`),
  });
}

export function useCreateItemGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/item-groups", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-groups"] }),
  });
}

// ─── GST Codes ─────────────────────────────────────────────────────

export function useGSTCodes(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["gst-codes", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/gst${query ? `?${query}` : ""}`),
  });
}

export function useCreateGSTCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/gst", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gst-codes"] }),
  });
}

// ─── TDS Codes ─────────────────────────────────────────────────────

export function useTDSCodes(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["tds-codes", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/tds${query ? `?${query}` : ""}`),
  });
}

export function useCreateTDSCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/tds", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tds-codes"] }),
  });
}

// ─── Banks ─────────────────────────────────────────────────────────

export function useBanks(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["banks", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/banks${query ? `?${query}` : ""}`),
  });
}

export function useCreateBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/banks", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["banks"] }),
  });
}

// ─── Departments ───────────────────────────────────────────────────

export function useDepartments(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["departments", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/departments${query ? `?${query}` : ""}`),
  });
}

export function useCreateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/departments", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });
}

// ─── Work Categories ───────────────────────────────────────────────

export function useWorkCategories(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["work-categories", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/work-categories${query ? `?${query}` : ""}`),
  });
}

export function useCreateWorkCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/work-categories", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["work-categories"] }),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/cost-centers${query ? `?${query}` : ""}`),
  });
}

export function useCreateCostCenter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/cost-centers", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cost-centers"] }),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/machinery${query ? `?${query}` : ""}`),
  });
}

export function useCreateMachinery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/machinery", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["machinery"] }),
  });
}

// ─── Companies ─────────────────────────────────────────────────────

export function useCompanies(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["companies", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/companies${query ? `?${query}` : ""}`),
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/companies", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

// ─── Financial Years ───────────────────────────────────────────────

export function useFinancialYears(params?: { search?: string }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  const query = qs.toString();

  return useQuery({
    queryKey: ["financial-years", query],
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/financial-years${query ? `?${query}` : ""}`),
  });
}

export function useCreateFinancialYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/financial-years", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["financial-years"] }),
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
    queryFn: () => fetchApi<{ data: any[]; total: number }>(`/api/masters/terms${query ? `?${query}` : ""}`),
  });
}

export function useCreateTermsCondition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => mutateApi("/api/masters/terms", "POST", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["terms-conditions"] }),
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

function makeUpdateHook(endpoint: string, queryKey: string) {
  return function useUpdate() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: ({ id, ...data }: any) =>
        mutateApi(`${endpoint}/${id}`, "PUT", data),
      onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
    });
  };
}

function makeDeleteHook(endpoint: string, queryKey: string) {
  return function useDelete() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => mutateApi(`${endpoint}/${id}`, "DELETE"),
      onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
    });
  };
}

// UOM
export const useUpdateUOM = makeUpdateHook("/api/masters/uom", "uoms");
export const useDeleteUOM = makeDeleteHook("/api/masters/uom", "uoms");

// Items
export const useUpdateItem = makeUpdateHook("/api/masters/items", "items");
export const useDeleteItem = makeDeleteHook("/api/masters/items", "items");

// Vendors
export const useUpdateVendor = makeUpdateHook("/api/masters/vendors", "vendors");
export const useDeleteVendor = makeDeleteHook("/api/masters/vendors", "vendors");

// Locations
export const useUpdateLocation = makeUpdateHook("/api/masters/locations", "locations");
export const useDeleteLocation = makeDeleteHook("/api/masters/locations", "locations");

// Contractors
export const useUpdateContractor = makeUpdateHook("/api/masters/contractors", "contractors");
export const useDeleteContractor = makeDeleteHook("/api/masters/contractors", "contractors");

// Customers
export const useUpdateCustomer = makeUpdateHook("/api/masters/customers", "customers");
export const useDeleteCustomer = makeDeleteHook("/api/masters/customers", "customers");

// Item Groups
export const useUpdateItemGroup = makeUpdateHook("/api/masters/item-groups", "item-groups");
export const useDeleteItemGroup = makeDeleteHook("/api/masters/item-groups", "item-groups");

// GST Codes
export const useUpdateGSTCode = makeUpdateHook("/api/masters/gst", "gst-codes");
export const useDeleteGSTCode = makeDeleteHook("/api/masters/gst", "gst-codes");

// TDS Codes
export const useUpdateTDSCode = makeUpdateHook("/api/masters/tds", "tds-codes");
export const useDeleteTDSCode = makeDeleteHook("/api/masters/tds", "tds-codes");

// Banks
export const useUpdateBank = makeUpdateHook("/api/masters/banks", "banks");
export const useDeleteBank = makeDeleteHook("/api/masters/banks", "banks");

// Departments
export const useUpdateDepartment = makeUpdateHook("/api/masters/departments", "departments");
export const useDeleteDepartment = makeDeleteHook("/api/masters/departments", "departments");

// Work Categories
export const useUpdateWorkCategory = makeUpdateHook("/api/masters/work-categories", "work-categories");
export const useDeleteWorkCategory = makeDeleteHook("/api/masters/work-categories", "work-categories");

// Cost Centers
export const useUpdateCostCenter = makeUpdateHook("/api/masters/cost-centers", "cost-centers");
export const useDeleteCostCenter = makeDeleteHook("/api/masters/cost-centers", "cost-centers");

// Machinery
export const useUpdateMachinery = makeUpdateHook("/api/masters/machinery", "machinery");
export const useDeleteMachinery = makeDeleteHook("/api/masters/machinery", "machinery");

// Companies
export const useUpdateCompany = makeUpdateHook("/api/masters/companies", "companies");
export const useDeleteCompany = makeDeleteHook("/api/masters/companies", "companies");

// Financial Years
export const useUpdateFinancialYear = makeUpdateHook("/api/masters/financial-years", "financial-years");
export const useDeleteFinancialYear = makeDeleteHook("/api/masters/financial-years", "financial-years");

// Terms & Conditions
export const useUpdateTermsCondition = makeUpdateHook("/api/masters/terms", "terms-conditions");
export const useDeleteTermsCondition = makeDeleteHook("/api/masters/terms", "terms-conditions");
