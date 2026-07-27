"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Wallet, TrendingUp, Users, AlertCircle, Settings2, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { useState } from "react";
import { KPI, ChartCard, Donut, INR, INR_LAKH } from "./_tabs/_shared";
import { PageBackground } from "@/components/hrms/page-background";

interface SummaryRes {
  lastSalaryProcessed: { amount: string | number; month: string; employeeCount: number } | null;
  upcomingSalary: { amount: string | number; month: string; employeeCount: number } | null;
  upcomingRevisions: { count: number; windowMonths: number };
  pendingRevisions: { count: number };
}

interface CompensationRes {
  totalCompensation: number;
  highestCompensation: { id?: string; key?: string; name: string; total: number } | null;
  lowestCompensation: { id?: string; key?: string; name: string; total: number } | null;
  byDepartment: { id: string; name: string; total: number }[];
  byLocation: { id: string; name: string; total: number }[];
}

interface SetupStatus {
  completedSteps: number;
  totalSteps: number;
  setupCompleted: boolean;
}

const TABS = [
  "Analytics",
  "Compensation Planning",
  "Budget Estimation",
  "Compare Compensation Cost",
  "Employee Competitiveness",
  "Geographical Differentials",
] as const;

const MONTH = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { month: "short", year: "numeric" }).toUpperCase() : "—";

const TabSkeleton = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 h-24 animate-pulse" />
      ))}
    </div>
    <div className="rounded-lg border border-gray-200 bg-white h-80 animate-pulse" />
  </div>
);

const CompensationPlanningTab = dynamic(() => import("./_tabs/compensation-planning"), {
  loading: () => <TabSkeleton />,
  ssr: false,
});
const BudgetEstimationTab = dynamic(() => import("./_tabs/budget-estimation"), {
  loading: () => <TabSkeleton />,
  ssr: false,
});
const CompareCompensationTab = dynamic(() => import("./_tabs/compare-compensation"), {
  loading: () => <TabSkeleton />,
  ssr: false,
});
const EmployeeCompetitivenessTab = dynamic(() => import("./_tabs/employee-competitiveness"), {
  loading: () => <TabSkeleton />,
  ssr: false,
});
const GeographicalDifferentialsTab = dynamic(() => import("./_tabs/geographical"), {
  loading: () => <TabSkeleton />,
  ssr: false,
});

const EMPTY_SUMMARY: SummaryRes = {
  lastSalaryProcessed: null,
  upcomingSalary: null,
  upcomingRevisions: { count: 0, windowMonths: 3 },
  pendingRevisions: { count: 0 },
};

export default function PayrollAnalyticsPage() {
  const api = useApiClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Analytics");

  const setupQ = useQuery({
    queryKey: ["payroll", "setup", "status"],
    queryFn: () => api.get<SetupStatus>("/api/v1/hrms/payroll/setup/status"),
    staleTime: 5 * 60_000,
  });
  const summaryQ = useQuery({
    queryKey: ["payroll", "analytics", "summary"],
    queryFn: () => api.get<SummaryRes>("/api/v1/hrms/payroll/analytics/summary"),
    enabled: tab === "Analytics",
  });
  const compQ = useQuery({
    queryKey: ["payroll", "analytics", "compensation"],
    queryFn: () => api.get<CompensationRes>("/api/v1/hrms/payroll/analytics/compensation"),
    enabled: tab === "Analytics",
  });

  const setup = setupQ.data?.data;
  const apiSummary = summaryQ.data?.data;
  const apiComp = compQ.data?.data;

  const summary = apiSummary ?? EMPTY_SUMMARY;
  const hasData = !!(apiSummary?.lastSalaryProcessed || apiSummary?.upcomingSalary);

  const deptData = (apiComp?.byDepartment ?? []).map((d) => ({ name: d.name, value: d.total }));
  const locData = (apiComp?.byLocation ?? []).map((d) => ({ name: d.name, value: d.total }));
  const totalComp = apiComp?.totalCompensation ?? 0;
  const highest = apiComp?.highestCompensation ?? null;
  const lowest = apiComp?.lowestCompensation ?? null;

  return (
    <div className="w-full px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Wallet size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Payroll</h1>
            <p className="text-xs text-gray-500 mt-1">Analytics, compensation and payroll operations.</p>
          </div>
        </div>
        <Link
          href="/payroll/setup"
          className="btn btn-primary"
        >
          <Settings2 size={13} /> Payroll Setup
          {setup && !setup.setupCompleted && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-[11px] font-semibold">
              {setup.completedSteps}/{setup.totalSteps}
            </span>
          )}
        </Link>
      </div>

      {setup && !setup.setupCompleted && (
        <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-amber-600" size={18} />
            <div>
              <p className="text-sm font-semibold text-amber-900">Finish payroll setup to start processing salaries</p>
              <p className="text-xs text-amber-700">
                {setup.completedSteps} of {setup.totalSteps} steps completed
              </p>
            </div>
          </div>
          <Link href="/payroll/setup" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900 hover:underline">
            Continue setup <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {!hasData && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 flex items-center gap-2">
          <AlertCircle size={12} /> No payroll data yet — analytics populate after first pay run completes.
        </div>
      )}

      <div className="border-b border-gray-200">
        <div className="flex gap-4 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-active={tab === t}
              className={clsx(
                "tab-underline whitespace-nowrap py-3 px-1 text-[13px] font-semibold -mb-px",
                tab === t ? "text-[#22c55e] font-semibold" : "text-gray-500 hover:text-gray-700",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "Analytics" && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPI
              label="Last Salary Processed"
              top={MONTH(summary.lastSalaryProcessed?.month)}
              value={summary.lastSalaryProcessed ? INR.format(Number(summary.lastSalaryProcessed.amount)) : "—"}
              hint={summary.lastSalaryProcessed ? `${summary.lastSalaryProcessed.employeeCount} employees` : "No pay runs yet"}
            />
            <KPI
              label="Upcoming Salary"
              top={MONTH(summary.upcomingSalary?.month)}
              value={summary.upcomingSalary ? INR.format(Number(summary.upcomingSalary.amount)) : "—"}
              hint={summary.upcomingSalary ? `${summary.upcomingSalary.employeeCount} employees` : "Not scheduled"}
            />
            <KPI
              label="Upcoming Revisions"
              top={`${summary.upcomingRevisions.windowMonths} MONTHS`}
              value={String(summary.upcomingRevisions.count)}
              linkLabel="View Employees"
              href="/org-chart"
            />
            <KPI
              label="Pending Revisions"
              value={String(summary.pendingRevisions.count)}
              linkLabel="View Employees"
              href="/org-chart"
            />
          </div>

          <section>
            <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Compensation Summary</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Compensation Distribution by Department">
                {deptData.length > 0 ? (
                  <div className="grid grid-cols-5 gap-4 items-center">
                    <div className="col-span-3 h-64"><Donut data={deptData} /></div>
                    <div className="col-span-2 space-y-3 text-sm">
                      <Stat label="Total Compensation" value={INR_LAKH(totalComp)} />
                      {highest && <Stat label="Highest" value={`${highest.name} (${INR_LAKH(highest.total)})`} />}
                      {lowest && <Stat label="Lowest" value={`${lowest.name} (${INR_LAKH(lowest.total)})`} />}
                    </div>
                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-gray-400">No data</div>
                )}
              </ChartCard>
              <ChartCard title="Compensation Distribution by Location">
                {locData.length > 0 ? (
                  <div className="h-64"><Donut data={locData} /></div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-xs text-gray-400">No data</div>
                )}
              </ChartCard>
            </div>
          </section>

          <section>
            <h2 className="text-[13px] font-semibold text-gray-900 mb-3">6-Month Trend</h2>
            <ChartCard title="Monthly Payroll & Headcount">
              <div className="h-40 flex items-center justify-center text-xs text-gray-400">
                No trend data — populates after multiple pay runs.
              </div>
            </ChartCard>
          </section>

          <section>
            <h2 className="text-[13px] font-semibold text-gray-900 mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <QuickLink href="/payroll/setup" icon={<Settings2 size={16} />} label="Payroll Setup" />
              <QuickLink href="/org-chart" icon={<Users size={16} />} label="People" />
              <QuickLink href="/reports" icon={<TrendingUp size={16} />} label="Reports" />
              <QuickLink href="/settings/audit-log" icon={<AlertCircle size={16} />} label="Audit Log" />
            </div>
          </section>
        </>
      )}

      {tab === "Compensation Planning" && <CompensationPlanningTab />}
      {tab === "Budget Estimation" && <BudgetEstimationTab />}
      {tab === "Compare Compensation Cost" && <CompareCompensationTab />}
      {tab === "Employee Competitiveness" && <EmployeeCompetitivenessTab />}
      {tab === "Geographical Differentials" && <GeographicalDifferentialsTab />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="group rounded-lg border border-gray-200 bg-white p-3 flex items-center gap-2 hover:border-[#86efac] hover:shadow-sm transition">
      <span className="text-[#22c55e]">{icon}</span>
      <span className="text-sm font-medium text-gray-800 group-hover:text-[#22c55e]">{label}</span>
    </Link>
  );
}
