"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLeadsData, type LeadsData } from "@/lib/api/leads";
import { getConnectors, connectUrl } from "@/lib/api/connectors";
import { crmConnectorIds } from "@/lib/mock/connectors";
import { useToastStore } from "@/store/useToastStore";
import Kpi from "@/components/ui/Kpi";
import Pill from "@/components/ui/Pill";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";
import LineAreaChart from "@/components/charts/LineAreaChart";
import BarChartSimple from "@/components/charts/BarChartSimple";
import FunnelChart from "@/components/overview/FunnelChart";
import LeadsTable from "@/components/leads/LeadsTable";
import type { Connector } from "@/types";

export default function LeadsPage() {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);
  const [data, setData] = useState<LeadsData | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);

  useEffect(() => {
    getLeadsData().then(setData);
    getConnectors().then(setConnectors);
  }, []);

  function connectCrm(id: string) {
    const url = connectUrl(id);
    if (!url) {
      showToast("This CRM connector is coming soon");
      return;
    }
    window.location.href = url; // real OAuth consent redirect
  }

  if (!data) return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Leads</div><p className="page-sub">Lead generation performance, synced from your CRM</p></div>
      </div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  const connectedCrms = connectors.filter((c) => crmConnectorIds.includes(c.id) && c.connected);

  // No CRM connected → just the connect prompt (no empty/zero cards).
  if (connectedCrms.length === 0) {
    return (
      <div>
        <div className="page-head">
          <div><div className="page-title">Leads</div><p className="page-sub">Lead generation performance, synced from your CRM</p></div>
        </div>
        <div className="team-banner">
          <div className="team-banner-text">No CRM connected. Connect one to sync real lead records, status, and scoring automatically.</div>
          <div className="team-banner-chips">
            {crmConnectorIds.map((id) => {
              const c = connectors.find((x) => x.id === id);
              if (!c) return null;
              return (
                <button key={id} className="btn btn-sm btn-primary" onClick={() => connectCrm(id)} type="button">
                  Connect {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const sourceLabels = Object.keys(data.leadsBySource);
  const sourceValues = sourceLabels.map((s) => data.leadsBySource[s] ?? 0);
  const sourceColors = ["#6C5CE0", "#16A34A", "#E8A33D", "#8B5CF6", "#DC2626"];

  // Real figures from the CRM funnel + trend.
  const trend = data.leadTrend;
  const newLeads = trend[trend.length - 1] ?? 0;
  const prevLeads = trend[trend.length - 2] ?? 0;
  const newDelta = prevLeads > 0 ? Math.round(((newLeads - prevLeads) / prevLeads) * 100) : 0;
  const volumeDelta = newDelta;
  const stage = (i: number) => data.leadFunnelStages[i]?.value ?? 0;
  const mqls = stage(1); // reached "Contacted" or beyond
  const sqls = stage(2); // reached "Qualified" or beyond
  const totalNew = stage(0);
  const customers = stage(4);
  const conversionRate = totalNew > 0 ? ((customers / totalNew) * 100).toFixed(1) : "0";
  const deltaStr = newDelta === 0 ? "" : `${newDelta > 0 ? "▲" : "▼"} ${Math.abs(newDelta)}%`;

  return (
    <div>
      <div className="page-head">
        <div><div className="page-title">Leads</div><p className="page-sub">Lead generation performance, synced from your CRM</p></div>
      </div>

      <div className="team-banner">
        <div className="team-synced-pill">
          <span className="platform-dot on" />
          Synced from {connectedCrms.map((c) => c.name).join(" & ")}
        </div>
        <button className="btn btn-sm" onClick={() => router.push("/integrations")} type="button">Manage in Integrations</button>
      </div>

      <div className="kpi-strip">
        <Kpi label="New leads" value={String(newLeads)} delta={deltaStr} trend={newDelta > 0 ? "up" : newDelta < 0 ? "down" : "flat"} sub="vs. last week" />
        <Kpi label="MQLs" value={String(mqls)} delta="" trend="flat" sub="reached contacted" />
        <Kpi label="SQLs" value={String(sqls)} delta="" trend="flat" sub="sales-qualified" />
        <Kpi label="Lead-to-customer" value={`${conversionRate}%`} delta="" trend="flat" sub="full funnel" />
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-head"><h3>Lead volume</h3>{volumeDelta !== 0 && <Pill tone={volumeDelta > 0 ? "green" : "red"}>{volumeDelta > 0 ? "+" : ""}{volumeDelta}%</Pill>}</div>
          <p className="chart-sub">Last 6 weeks</p>
          <div style={{ position: "relative", height: 200 }}>
            <LineAreaChart labels={["Wk1", "Wk2", "Wk3", "Wk4", "Wk5", "Wk6"]} data={data.leadTrend} />
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head"><h3>Leads by source</h3></div>
          <p className="chart-sub">This period</p>
          <div style={{ position: "relative", height: 200 }}>
            <BarChartSimple labels={sourceLabels} data={sourceValues} colors={sourceColors} />
          </div>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-head"><h3>Lead funnel</h3></div>
        <p className="chart-sub">New lead → customer, this period</p>
        <FunnelChart stages={data.leadFunnelStages} />
      </div>

      <LeadsTable leads={data.leads} />
    </div>
  );
}
