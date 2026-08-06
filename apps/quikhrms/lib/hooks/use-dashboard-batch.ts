"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

interface DashboardBirthday {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
  daysUntil: number;
}

interface DashboardAnniversary {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
  jobTitle: string | null;
  daysUntil: number;
  years: number;
}

interface DashboardUpcomingHoliday {
  id: string;
  name: string;
  date: string;
  type: string;
  isFloater: boolean;
  calendar: { id: string; name: string } | null;
}

interface DashboardMonthHoliday {
  id: string;
  name: string;
  date: string;
  type: string;
}

interface DashboardAvailabilityRow {
  category: "Sick" | "Parental" | "WFH" | "Holiday";
  label: string;
  count: number;
  avatars: { id: string; firstName: string; lastName: string; profilePhoto: string | null }[];
}

interface DashboardJobOpening {
  id: string;
  title: string;
  requisitionNumber: string;
  positions: number;
  filledPositions: number;
  employmentType: string;
  workLocation: string;
  department: { name: string } | null;
}

export interface DashboardBatchData {
  me: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    jobTitle: string | null;
    profilePhoto: string | null;
    status: string;
    designation: { id: string; title: string } | null;
  } | null;
  unreadCount: number;
  attendance: {
    checkedIn: boolean;
    elapsedSeconds: number;
  };
  birthdays: DashboardBirthday[];
  birthdayCounts: { today: number; month: number };
  anniversaries: DashboardAnniversary[];
  holidays: {
    upcoming: DashboardUpcomingHoliday[];
    monthHolidays: DashboardMonthHoliday[];
  };
  eventsToday: number;
  availability: DashboardAvailabilityRow[];
  jobOpenings: { totalOpen: number; items: DashboardJobOpening[] };
}

/**
 * The single API call for all above-the-fold dashboard data. Every home widget
 * shares this one query (queryKey `["dashboard","batch"]`), so React Query
 * dedupes them into ONE network request and serves the rest from cache — no
 * repeated fetching. "View All" / month navigation pull full lists on demand
 * from the per-resource detail routes.
 */
export function useDashboardBatch() {
  const api = useApiClient();

  return useQuery({
    queryKey: ["dashboard", "batch"],
    queryFn: () => api.get<DashboardBatchData>("/api/v1/hrms/dashboard/batch"),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
