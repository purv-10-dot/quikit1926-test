"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmptyState } from "@/components/hrms/empty-state";
import { PageBackground } from "@/components/hrms/page-background";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { ArrowLeft } from "lucide-react";
import { type PerfData } from "../_components/team-performance-tab";
import { AssignedPositionsView } from "../_components/assigned-positions-view";

/**
 * Full-page "Assigned Positions" browser — was a Modal on the Team
 * Performance tab, moved here because the toolbar + table + Revise SLA
 * flow genuinely needs page-width room, not a dialog box. Scoped to one
 * recruiter via ?recruiterId=, or the full in-scope set (self or all,
 * same rule the API already applies) when omitted.
 */
export default function AssignedPositionsPage() {
  const api = useApiClient();
  const searchParams = useSearchParams();
  const recruiterId = searchParams.get("recruiterId");

  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  const canSeeAll = hasPermission("hrms.recruit.performance.read");
  const canView = canSeeAll || hasPermission("hrms.recruit.performance.read_self");

  const { data, isLoading } = useQuery({
    queryKey: ["recruiter-performance", recruiterId ?? ""],
    queryFn: () => api.get<PerfData>(`/api/v1/hrms/recruit/recruiter-performance${recruiterId ? `?recruiterId=${recruiterId}` : ""}`),
    enabled: canView,
    staleTime: 60_000,
  });
  const d = data?.data;

  if (!permsLoading && !canView) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have access to this page"
        description="Assigned Positions are restricted. Contact your administrator if you need access."
      />
    );
  }

  const scopedRecruiter = recruiterId ? d?.recruiters.find((r) => r.employeeId === recruiterId) : null;
  const positions = recruiterId ? (scopedRecruiter?.positions ?? []) : (d?.recruiters ?? []).flatMap((r) => r.positions);
  const heading = recruiterId ? (scopedRecruiter ? `${scopedRecruiter.name} — Assigned Positions` : "Assigned Positions") : "Assigned Positions — All Recruiters";
  const exportFileNamePrefix = recruiterId ? (scopedRecruiter?.name ?? "recruiter") : "all-recruiters";

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center gap-3">
        <Link href="/recruit/dashboard?tab=performance" className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-gray-500 hover:text-accent-700 shrink-0">
          <ArrowLeft size={13} /> Back to Team Performance
        </Link>
        <span className="text-gray-300">|</span>
        <h1 className="text-lg font-bold text-gray-900">{heading}</h1>
      </div>

      {isLoading || permsLoading ? (
        <SkeletonCards count={4} />
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <AssignedPositionsView positions={positions} canSeeAll={canSeeAll} exportFileNamePrefix={exportFileNamePrefix} showRecruiterColumn={!recruiterId} />
        </div>
      )}
    </div>
  );
}
