"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { BarChart3, Users, UserMinus, TrendingUp, Briefcase, UserPlus } from "lucide-react";
import { BarChartView, MultiColorBar, LineChartView } from "@/components/hrms/charts";

interface Overview {
  headcount: { active: number; onLeave: number; newHiresThisMonth: number };
  workflows: { activeOnboardings: number; activeOffboardings: number };
  pending: { leaves: number; expenses: number; openRequisitions: number };
}

interface Headcount {
  total: number;
  byStatus: Array<{ status: string; count: number }>;
  byDepartment: Array<{ departmentName: string; count: number }>;
  byEmploymentType: Array<{ type: string; count: number }>;
  byWorkLocation: Array<{ location: string; count: number }>;
}

interface Attrition {
  totalExits: number; totalHired: number; activeHeadcount: number; attritionRate: number;
  byMonth: Array<{ month: string; count: number }>;
  byTenure: Record<string, number>;
}

export default function AnalyticsPage() {
  const api = useApiClient();

  const { data: overview } = useQuery({
    queryKey: ["analytics", "overview"],
    queryFn: () => api.get<Overview>("/api/v1/hrms/analytics/overview"),
  });

  const { data: headcount } = useQuery({
    queryKey: ["analytics", "headcount"],
    queryFn: () => api.get<Headcount>("/api/v1/hrms/analytics/headcount"),
  });

  const { data: attrition } = useQuery({
    queryKey: ["analytics", "attrition"],
    queryFn: () => api.get<Attrition>("/api/v1/hrms/analytics/attrition?months=12"),
  });

  const o = overview?.data;
  const h = headcount?.data;
  const a = attrition?.data;

  const deptData = (h?.byDepartment ?? []).map((d) => ({ name: d.departmentName, value: d.count }));
  const empTypeData = (h?.byEmploymentType ?? []).map((e) => ({ name: e.type, value: e.count }));
  const locData = (h?.byWorkLocation ?? []).map((l) => ({ name: l.location, value: l.count }));
  const monthData = (a?.byMonth ?? []).map((m) => ({ name: m.month, value: m.count }));
  const tenureData = Object.entries(a?.byTenure ?? {}).map(([k, v]) => ({ name: k, value: v }));

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 className="text-[#22c55e]" />
        <h1 className="text-page-title text-gray-900">HR Analytics</h1>
      </div>

      {o && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
          <StatCard icon={<Users size={16} />} label="Active Headcount" value={o.headcount.active} color="blue" />
          <StatCard icon={<UserPlus size={16} />} label="New Hires (Month)" value={o.headcount.newHiresThisMonth} color="green" />
          <StatCard icon={<UserMinus size={16} />} label="On Leave" value={o.headcount.onLeave} color="yellow" />
          <StatCard icon={<Briefcase size={16} />} label="Open Reqs" value={o.pending.openRequisitions} color="purple" />
          <StatCard icon={<TrendingUp size={16} />} label="Pending Leaves" value={o.pending.leaves} color="orange" />
          <StatCard icon={<TrendingUp size={16} />} label="Pending Expenses" value={o.pending.expenses} color="red" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {h && (
          <>
            <ChartCard title="Headcount by Department" subtitle={`${h.byDepartment.length} departments · ${h.total} total`}>
              {deptData.length > 0 ? (
                <MultiColorBar data={deptData} height={Math.max(220, deptData.length * 28)} layout="vertical" />
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Headcount by Status</h2>
              <div className="grid grid-cols-2 gap-2">
                {h.byStatus.map((s) => (
                  <div key={s.status} className="border border-gray-100 rounded-lg p-2">
                    <div className="text-xs text-gray-500">{s.status}</div>
                    <div className="text-xl font-bold">{s.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <ChartCard title="By Employment Type" subtitle={`${empTypeData.length} types`}>
              {empTypeData.length > 0 ? (
                <BarChartView data={empTypeData} height={220} color="#22c55e" showValues />
              ) : (
                <EmptyChart />
              )}
            </ChartCard>

            <ChartCard title="By Work Location" subtitle={`${locData.length} locations`}>
              {locData.length > 0 ? (
                <BarChartView data={locData} height={220} color="#10b981" showValues />
              ) : (
                <EmptyChart />
              )}
            </ChartCard>
          </>
        )}
      </div>

      {a && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Attrition (12 months)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div><div className="text-xs text-gray-500 uppercase">Attrition Rate</div><div className="text-2xl font-bold text-red-600">{a.attritionRate}%</div></div>
            <div><div className="text-xs text-gray-500 uppercase">Total Exits</div><div className="text-2xl font-bold">{a.totalExits}</div></div>
            <div><div className="text-xs text-gray-500 uppercase">Total Hired</div><div className="text-2xl font-bold text-green-600">{a.totalHired}</div></div>
            <div><div className="text-xs text-gray-500 uppercase">Net Change</div><div className="text-2xl font-bold">{a.totalHired - a.totalExits > 0 ? "+" : ""}{a.totalHired - a.totalExits}</div></div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Exits by Month</h3>
              {monthData.length > 0 ? (
                <LineChartView data={monthData} height={240} color="#ef4444" yLabel="Exits" />
              ) : (
                <EmptyChart />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Exits by Tenure</h3>
              {tenureData.length > 0 ? (
                <BarChartView data={tenureData} height={240} color="#f59e0b" showValues />
              ) : (
                <EmptyChart />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="mb-3">
        <h2 className="font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[200px] flex items-center justify-center text-xs text-gray-400 bg-gray-50 rounded">
      No data
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const bg: Record<string, string> = { blue: "bg-[#dcfce7] text-[#16a34a]", green: "bg-green-50 text-green-700", yellow: "bg-yellow-50 text-yellow-700", red: "bg-red-50 text-red-700", purple: "bg-purple-50 text-purple-700", orange: "bg-orange-50 text-orange-700" };
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
      <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${bg[color]}`}>{icon} {label}</div>
      <div className="font-serif-display text-xl md:text-2xl font-bold text-gray-900 mt-2">{value}</div>
    </div>
  );
}
