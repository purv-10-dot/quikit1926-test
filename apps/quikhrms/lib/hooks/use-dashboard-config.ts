"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

export interface DashboardConfig {
  role: { code: string; name: string };
  widgets: string[];
  permissions: string[];
  employee: {
    id: string;
    name: string;
    jobTitle: string | null;
    profilePhoto: string | null;
    /** "PreBoarding" | "Active" | … — drives the locked-down sidebar for new joiners. */
    status?: string;
  } | null;
}

export function useDashboardConfig() {
  const api = useApiClient();
  const q = useQuery({
    queryKey: ["dashboard", "config"],
    queryFn: () => api.get<DashboardConfig>("/api/v1/hrms/dashboard/config"),
    staleTime: 30_000,
  });
  return {
    config: q.data?.data ?? null,
    role: q.data?.data?.role ?? null,
    widgets: q.data?.data?.widgets ?? [],
    permissions: q.data?.data?.permissions ?? [],
    employee: q.data?.data?.employee ?? null,
    /** Convenience flag — new joiner who hasn't been promoted to Active. */
    preBoarding: q.data?.data?.employee?.status === "PreBoarding",
    isLoading: q.isLoading,
    hasPermission: (code: string) =>
      (q.data?.data?.permissions ?? []).includes(code) || (q.data?.data?.permissions ?? []).includes("*"),
    hasAnyPermission: (codes: string[]) => {
      const perms = q.data?.data?.permissions ?? [];
      if (perms.includes("*")) return true;
      return codes.some((c) => perms.includes(c));
    },
    isEnabled: (widget: string) => (q.data?.data?.widgets ?? []).includes(widget),
  };
}
