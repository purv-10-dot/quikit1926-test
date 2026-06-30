"use client";

import { useQuery } from "@tanstack/react-query";
import { fallbackDashboard, type DashboardData } from "@/lib/dashboard-data";

export type { DashboardData } from "@/lib/dashboard-data";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const response = await fetch("/api/v1/dashboard");
      if (!response.ok) {
        return fallbackDashboard;
      }
      const payload = (await response.json()) as { data?: DashboardData };
      return payload.data ?? fallbackDashboard;
    },
    initialData: fallbackDashboard
  });
}
