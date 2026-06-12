"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Analytics {
  quotesSent: number;
  winRatePct: number;
  avgDealSize: number;
  avgApprovalDelayHours: number;
  expiringThisWeek: number;
  forecastPipeline: number;
  funnel: { status: string; count: number; value: number }[];
  topProducts: { productName: string; revenue: number; count: number }[];
  topReps: { ownerName: string; wonCount: number; wonRevenue: number }[];
}

export function QuotesAnalyticsDashboard() {
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/quotes/analytics");
      const json = await res.json();
      if (!json.success) setError(json.error ?? "Failed");
      else setData(json.data);
    })();
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-crm-muted">Loading analytics…</p>;

  const kpis = [
    { label: "Quotes sent", value: data.quotesSent },
    { label: "Win rate", value: `${data.winRatePct}%` },
    { label: "Avg deal size", value: `₹${data.avgDealSize.toLocaleString("en-IN")}` },
    { label: "Expiring (7d)", value: data.expiringThisWeek },
    { label: "Pipeline value", value: `₹${data.forecastPipeline.toLocaleString("en-IN")}` },
    { label: "Avg approval (h)", value: data.avgApprovalDelayHours },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-lg border border-crm-border bg-white p-3 shadow-sm"
          >
            <p className="text-xs text-crm-muted">{k.label}</p>
            <p className="mt-1 text-lg font-semibold text-crm-text">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-crm-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">Quote funnel</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.funnel}>
                <XAxis dataKey="status" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#1d4ed8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-crm-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">Top products</h3>
          <ul className="space-y-2 text-sm">
            {data.topProducts.map((p) => (
              <li key={p.productName} className="flex justify-between">
                <span>{p.productName}</span>
                <span className="font-medium tabular-nums">
                  ₹{p.revenue.toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-crm-border bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold">Top sales reps (won)</h3>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.topReps.map((r) => (
            <li
              key={r.ownerName}
              className="flex justify-between rounded bg-crm-bg px-3 py-2 text-sm"
            >
              <span>{r.ownerName}</span>
              <span className="text-crm-muted">
                {r.wonCount} won · ₹{r.wonRevenue.toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
