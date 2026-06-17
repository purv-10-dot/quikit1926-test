"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { BarChart3 } from "lucide-react";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { ExpenseTabs } from "../_components/expense-tabs";
import { PageHeader } from "@/components/hrms/ui/page-header";

interface Report {
  totals: { claims: number; totalAmount: number; avgAmount: number };
  byCategory: Array<{ category: string; count: number; total: number }>;
  byStatus: Array<{ status: string; count: number; total: number }>;
  byMonth: Array<{ month: string; total: number; count: number }>;
}

export default function ExpenseReportsPage() {
  const api = useApiClient();
  const [range, setRange] = useState({ from: "", to: "" });

  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);

  const { data, isLoading } = useQuery({
    queryKey: ["expense-reports", range],
    queryFn: () => api.get<Report>(`/api/v1/hrms/expenses/reports?${qs.toString()}`),
  });

  const r = data?.data;

  return (
    <div className="w-full px-6 py-6">
      <PageHeader
        icon={<BarChart3 size={28} className="text-[#3b82f6]" />}
        title="Expense reports"
        subtitle="Spend breakdown by category, status, month."
        actions={
          <div className="flex items-center gap-2">
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm" />
            <span className="text-gray-400">→</span>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm" />
          </div>
        }
      />
      <div className="mb-5"><ExpenseTabs /></div>

      {isLoading ? <SkeletonCards count={3} /> : !r ? null : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase">Total Claims</div>
              <div className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">{r.totals.claims}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase">Total Amount</div>
              <div className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">₹{r.totals.totalAmount.toLocaleString("en-IN")}</div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="text-xs text-gray-500 uppercase">Avg / Claim</div>
              <div className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">₹{Math.round(r.totals.avgAmount).toLocaleString("en-IN")}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium">By Category</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {r.byCategory.map((c) => (
                    <tr key={c.category}>
                      <td className="px-4 py-2">{c.category}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{c.count} claims</td>
                      <td className="px-4 py-2 text-right font-medium">₹{c.total.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium">By Status</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {r.byStatus.map((s) => (
                    <tr key={s.status}>
                      <td className="px-4 py-2">{s.status}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{s.count}</td>
                      <td className="px-4 py-2 text-right font-medium">₹{s.total.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden md:col-span-2">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium">By Month</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {r.byMonth.map((m) => (
                    <tr key={m.month}>
                      <td className="px-4 py-2 font-mono">{m.month}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{m.count} claims</td>
                      <td className="px-4 py-2 text-right font-medium">₹{m.total.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
