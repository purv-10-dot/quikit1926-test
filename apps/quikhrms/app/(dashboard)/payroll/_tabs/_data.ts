"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

export interface CompRow {
  salaryId: string;
  employeeId: string;
  code: string;
  name: string;
  ctc: number;
  effectiveFrom: string;
  dateOfJoining: string | null;
  deptId: string | null;
  deptName: string;
  designationId: string | null;
  designationName: string;
  gradeId: string | null;
  gradeName: string | null;
  locationId: string | null;
  locationName: string;
  city: string | null;
  state: string | null;
}

export function useCompensationDetail() {
  const api = useApiClient();
  return useQuery({
    queryKey: ["payroll", "comp-detail"],
    queryFn: () => api.get<CompRow[]>("/api/v1/hrms/payroll/analytics/compensation-detail"),
    staleTime: 60_000,
  });
}

export function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function groupBy<T, K extends string>(arr: T[], key: (x: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    (out[k] ??= []).push(item);
  }
  return out;
}
