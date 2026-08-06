"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

// Reference data shared across multiple forms (employee new/edit, candidate new,
// requisitions, etc). Centralised so a single React Query cache entry serves
// every consumer — no duplicate network calls per page mount.
//
// Long staleTime because these tables change rarely. Settings pages that mutate
// them already invalidate the same query keys (`departments`, `designations`,
// `locations`, `settings.roles`, `payroll.salary-templates`).

const REF_STALE_MS = 5 * 60_000;

export interface RefDepartment { id: string; name: string; code?: string | null }
export interface RefDesignation { id: string; title: string }
export interface RefLocation { id: string; name: string; city?: string | null; state?: string | null }
export interface RefRole { id: string; code: string; name: string; description?: string | null }
export type SalaryAmountType = "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";
type SalaryComponentType = "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";

export interface RefSalaryTemplateComponent {
  componentId: string;
  amountType: SalaryAmountType;
  amountValue: string | number | null;
  component: {
    id: string;
    name: string;
    code: string;
    type: SalaryComponentType;
    category: string;
  };
}

export interface RefSalaryTemplate {
  id: string;
  name: string;
  code: string;
  // The list endpoint returns each template's full component breakdown
  // (ordered by sortOrder). Optional so lighter callers can ignore it.
  components?: RefSalaryTemplateComponent[];
}

export function useDepartments() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<RefDepartment[]>("/api/v1/hrms/departments?limit=200"),
    staleTime: REF_STALE_MS,
  });
}

/**
 * Departments scoped to the caller's role-priority hierarchy AND limited to those
 * that actually have at least one accessible employee. Use for filter dropdowns.
 */
export function useAccessibleDepartments() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["departments", "accessible"],
    queryFn: () => api.get<RefDepartment[]>("/api/v1/hrms/departments?limit=200&accessible=true"),
    staleTime: REF_STALE_MS,
  });
}

export function useDesignations() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["designations"],
    queryFn: () => api.get<RefDesignation[]>("/api/v1/hrms/designations?limit=200"),
    staleTime: REF_STALE_MS,
  });
}

export function useLocations() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<RefLocation[]>("/api/v1/hrms/locations?limit=200"),
    staleTime: REF_STALE_MS,
  });
}

export function useRoles() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["settings", "roles"],
    queryFn: () => api.get<RefRole[]>("/api/v1/hrms/settings/roles"),
    staleTime: REF_STALE_MS,
  });
}

export function useSalaryTemplates() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["payroll", "salary-templates"],
    queryFn: () => api.get<RefSalaryTemplate[]>("/api/v1/hrms/payroll/salary-templates"),
    staleTime: REF_STALE_MS,
  });
}
