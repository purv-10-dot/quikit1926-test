"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmptyState } from "@/components/hrms/empty-state";
import { PageBackground } from "@/components/hrms/page-background";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { LayoutDashboard, TrendingUp } from "lucide-react";
import { CompanyDashboardTab } from "../_components/company-dashboard-tab";
import { TeamPerformanceTab } from "../_components/team-performance-tab";

type WeeklyReportRow = Record<string, string | number>;
interface DashboardKpis {
  kpis: {
    openRequisitions: number; openPositions: number; inPipeline: number;
    interviewsThisWeek: number; offersOut: number; hiresMTD: number;
    avgTimeToHire: number; offersSentMTD: number; offersAcceptedMTD: number; acceptanceRate: number;
  };
}

type Tab = "overview" | "performance";

/** Recruitment Dashboard — "Company Dashboard" (hiring health) and "Team/My Performance" (recruiter workload) as tabs on one page. */
export default function RecruitDashboardPage() {
  const api = useApiClient();
  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  const canViewOverview = hasPermission("hrms.recruit.read") || hasPermission("hrms.recruit.write") || hasPermission("hrms.recruit.read_self");
  const canSeeAllPerf = hasPermission("hrms.recruit.performance.read");
  const canViewPerformance = canSeeAllPerf || hasPermission("hrms.recruit.performance.read_self");

  const [tab, setTab] = useState<Tab>(() => {
    const t = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    return t === "performance" ? "performance" : "overview";
  });
  // Placeholder the "My Home" tab's "Updated…" pill + recruiter filter portal into,
  // so they sit on the same line as the tab switcher instead of a row below it.
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);

  const firstVisible: Tab | null = canViewOverview ? "overview" : canViewPerformance ? "performance" : null;
  const visible: Record<Tab, boolean> = { overview: canViewOverview, performance: canViewPerformance };
  // Land on (and stay on) the first tab the user can actually see.
  useEffect(() => {
    if (!permsLoading && !visible[tab] && firstVisible) setTab(firstVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permsLoading, tab, canViewOverview, canViewPerformance, firstVisible]);

  if (!permsLoading && !firstVisible) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have access to the Recruitment Dashboard"
        description="Recruitment analytics are restricted. Contact your administrator if you need access."
      />
    );
  }

  return (
    <div className="w-full px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TabSwitcher
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          tabs={[
            ...(canViewOverview ? [{ value: "overview" as const, label: "Dashboard", icon: <LayoutDashboard size={14} /> }] : []),
            ...(canViewPerformance ? [{ value: "performance" as const, label: "My Home", icon: <TrendingUp size={14} /> }] : []),
          ]}
        />
        {tab === "overview" && canViewOverview && (
          <div className="flex items-center gap-2">
            <Link href="/recruit/pipeline" className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm">
              <TrendingUp size={13} /> Open Pipeline
            </Link>
            <ExcelExportButton<WeeklyReportRow>
              filename={`weekly-recruitment-report-${new Date().toISOString().slice(0, 10)}`}
              sheetName="Weekly Report"
              label="Generate Report"
              rows={[]}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg disabled:opacity-50"
              columns={[
                { header: "Metric", key: "metric", width: 32 },
                { header: "Value", key: "value", width: 18 },
              ]}
              getRows={async () => {
                const res = await api.get<DashboardKpis>("/api/v1/hrms/recruit/dashboard");
                const k = res.data?.kpis;
                if (!k) return [];
                const rows: WeeklyReportRow[] = [
                  { metric: "Report generated", value: new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
                  { metric: "Open Requisitions", value: k.openRequisitions },
                  { metric: "Open Positions", value: k.openPositions },
                  { metric: "In Pipeline (active candidates)", value: k.inPipeline },
                  { metric: "Interviews (This Week)", value: k.interviewsThisWeek },
                  { metric: "Offers Out (currently sent, awaiting response)", value: k.offersOut },
                  { metric: "Offers Sent (This Month)", value: k.offersSentMTD },
                  { metric: "Offers Accepted (This Month)", value: k.offersAcceptedMTD },
                  { metric: "Offer Acceptance Rate (This Month)", value: `${k.acceptanceRate}%` },
                  { metric: "Hires (This Month)", value: k.hiresMTD },
                  { metric: "Avg Time-to-Hire (days)", value: k.avgTimeToHire },
                ];
                return rows;
              }}
            />
          </div>
        )}
        {tab === "performance" && canViewPerformance && (
          <div ref={setToolbarEl} className="flex items-center gap-2 flex-nowrap overflow-x-auto" />
        )}
      </div>
      {tab === "overview" && canViewOverview && <CompanyDashboardTab />}
      {tab === "performance" && canViewPerformance && <TeamPerformanceTab toolbarContainer={toolbarEl} />}
    </div>
  );
}
