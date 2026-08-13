"use client";

/**
 * Shared data hook for running a canned report. Backed by React Query so the
 * drawer (quick view) and the full-page runner share one cache entry: opening
 * a report in the drawer then clicking "Full page" reuses the result instead
 * of firing the identical query twice.
 */
import { useQuery } from "@tanstack/react-query";
import type { ReportResult } from "./canned-report-view";

async function fetchCannedReport(
  reportId: string,
  from: string,
  to: string,
  ownerId?: string,
): Promise<ReportResult> {
  const params = new URLSearchParams({ from, to });
  if (ownerId) params.set("ownerId", ownerId);
  const res = await fetch(`/api/reports/canned/${reportId}?${params.toString()}`);
  const body = (await res.json()) as
    | { success: true; data: ReportResult }
    | { success: false; error: string };
  if (!res.ok || !body.success) {
    throw new Error(!body.success ? body.error : `Load failed (${res.status})`);
  }
  return body.data;
}

export function useCannedReport(opts: {
  reportId: string;
  from: string;
  to: string;
  ownerId?: string;
  /** Skip the fetch until true (e.g. the drawer is open). Defaults to true. */
  enabled?: boolean;
}): { result: ReportResult | null; loading: boolean; error: string | null } {
  const { reportId, from, to, ownerId, enabled = true } = opts;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["reports", "canned", reportId, from, to, ownerId ?? ""],
    queryFn: () => fetchCannedReport(reportId, from, to, ownerId),
    enabled,
    staleTime: 60_000,
  });
  return {
    result: data ?? null,
    loading: enabled && isLoading,
    error: isError
      ? error instanceof Error
        ? error.message
        : "Failed to load report"
      : null,
  };
}
