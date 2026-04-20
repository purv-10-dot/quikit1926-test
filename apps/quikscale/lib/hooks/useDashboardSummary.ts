"use client";

import { useQuery } from "@tanstack/react-query";
import type { KPIRow } from "@/lib/types/kpi";
import type { PriorityRow } from "@/lib/types/priority";
import type { WWWItem } from "@/lib/types/www";

export interface DashboardSummaryTeam {
  id: string;
  name: string;
}

export interface DashboardSummaryUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface DashboardSummaryData {
  individualKPIs: KPIRow[];
  teamKPIs: KPIRow[];
  priorities: PriorityRow[];
  wwwItems: WWWItem[];
  teams: DashboardSummaryTeam[];
  users: DashboardSummaryUser[];
}

export interface DashboardSummaryResponse {
  success: boolean;
  data?: DashboardSummaryData;
  error?: string;
}

async function fetchDashboardSummary(year: number, quarter: string): Promise<DashboardSummaryResponse> {
  const params = new URLSearchParams({ year: String(year), quarter });
  const res = await fetch(`/api/dashboard/summary?${params.toString()}`);
  const data: DashboardSummaryResponse = await res.json();
  if (!data.success) throw new Error(data.error || "Failed to fetch dashboard summary");
  return data;
}

/**
 * Consolidated dashboard data hook — one network round-trip instead of six.
 * Replaces `useKPIs` + `useTeamKPIs` + `usePriorities` + `useWWWItems` +
 * `useTeams` + `useUsers` on the dashboard page.
 */
export function useDashboardSummary({ year, quarter }: { year: number; quarter: string }) {
  return useQuery({
    queryKey: ["dashboard", "summary", year, quarter],
    queryFn: () => fetchDashboardSummary(year, quarter),
    staleTime: 1000 * 60 * 5,
  });
}
