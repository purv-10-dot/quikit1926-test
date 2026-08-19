"use client";
import { useEffect, useMemo, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import LineAreaChart from "@/components/charts/LineAreaChart";
import BarChartSimple from "@/components/charts/BarChartSimple";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";
import { getLeadsData, type Lead, type LeadsData, type FunnelStage } from "@/lib/api/leads";

const ACCENT = "#6C5CE0";
const SOURCE_COLORS = ["#6C5CE0", "#16A34A", "#E8A33D", "#8B5CF6", "#DC2626"];
const AVATAR_PALETTE = ["#6C5CE0", "#16A34A", "#E8A33D", "#DC2626", "#0A66C2", "#8B5CF6", "#0866FF", "#D6249F"];

const STATUS_CLASS: Record<string, string> = {
  New: "lead-status-new",
  Contacted: "lead-status-contacted",
  Qualified: "lead-status-qualified",
  Customer: "lead-status-customer",
};

/** Sortable table columns, in reference order. */
const COLUMNS: Array<{ key: keyof Lead; label: string }> = [
  { key: "name", label: "Name" },
  { key: "company", label: "Company" },
  { key: "source", label: "Source" },
  { key: "status", label: "Status" },
  { key: "score", label: "Score" },
  { key: "owner", label: "Owner" },
  { key: "createdAt", label: "Created" },
];

function leadInitials(name: string): string {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

/** Deterministic per-name colour, so a lead keeps the same avatar across renders. */
function leadColor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
}

function PageHead() {
  return (
    <div className="page-head">
      <div>
        <div className="page-title">Leads</div>
        <p className="page-sub">Lead generation performance, synced from your CRM</p>
      </div>
    </div>
  );
}

/** Stepped funnel bars — widths relative to the first stage, min 16% so labels stay readable. */
function Funnel({ stages }: { stages: FunnelStage[] }) {
  const max = stages[0]?.value || 1;
  const shades = ["22", "55", "99", "CC", ""];
  return (
    <div>
      {stages.map((s, i) => (
        <div className="funnel-row" key={s.label}>
          <div className="funnel-stage-label">{s.label}</div>
          <div
            className="funnel-bar"
            style={{
              width: `${Math.max(16, (s.value / max) * 100)}%`,
              background: ACCENT + (shades[i] ?? ""),
              color: i >= 2 ? "#fff" : "#5445D6",
            }}
          >
            <span>{s.value.toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeadsPage() {
  const [data, setData] = useState<LeadsData | null>(null);
  const [error, setError] = useState(false);
  const [sort, setSort] = useState<{ key: keyof Lead | null; dir: 1 | -1 }>({ key: null, dir: 1 });

  useEffect(() => {
    getLeadsData().then(setData).catch(() => setError(true));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = [...data.leads];
    const { key, dir } = sort;
    if (!key) return list;
    return list.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [data, sort]);

  if (error) return (
    <div>
      <PageHead />
      <NotConnected icon="⚠️" title="Couldn't load leads" body="Something went wrong. Please refresh and try again." ctaHref="/leads" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <PageHead />
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  const { leadTrend, leadsBySource, leadFunnelStages } = data;

  // KPI derivations, matching the reference exactly.
  const newLeads = leadTrend[leadTrend.length - 1] ?? 0;
  const mqls = Math.round((leadsBySource["Paid Search"] ?? 0) + (leadsBySource["Paid Social"] ?? 0));
  const sqls = Math.round(mqls * 0.53);
  const firstStage = leadFunnelStages[0]?.value ?? 0;
  const lastStage = leadFunnelStages[4]?.value ?? 0;
  const conversionRate = firstStage > 0 ? ((lastStage / firstStage) * 100).toFixed(1) : "0.0";
  const first = leadTrend[0] ?? 0;
  const volumeDelta = first > 0 ? Math.round(((newLeads - first) / first) * 100) : 0;

  const sourceLabels = Object.keys(leadsBySource);
  const sourceValues = sourceLabels.map((s) => leadsBySource[s] ?? 0);

  const toggleSort = (key: keyof Lead) =>
    setSort((prev) => ({ key, dir: prev.key === key ? (prev.dir * -1) as 1 | -1 : 1 }));

  return (
    <div>
      <PageHead />
      {/* HubSpot specifically — it's the only CRM /api/leads reads today. */}
      {data.isSampleData && <SampleDataBanner platform="HubSpot" />}

      <div className="kpi-strip">
        <Kpi label="New leads" value={String(newLeads)} delta="▲ 9%" trend="up" sub="vs. last period" />
        <Kpi label="MQLs" value={String(mqls)} delta="▲ 6%" trend="up" sub="paid channels" />
        <Kpi label="SQLs" value={String(sqls)} delta="▲ 11%" trend="up" sub="sales-accepted" />
        <Kpi label="Lead-to-customer" value={`${conversionRate}%`} delta="▲ 0.4pt" trend="up" sub="full funnel" />
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-head">
            <h3>Lead volume</h3>
            <span className="pill pill-green">+{volumeDelta}%</span>
          </div>
          <p className="chart-sub">Last 6 weeks</p>
          <div style={{ position: "relative", height: 200 }}>
            <LineAreaChart labels={["Wk1", "Wk2", "Wk3", "Wk4", "Wk5", "Wk6"]} data={leadTrend} color={ACCENT} />
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head"><h3>Leads by source</h3></div>
          <p className="chart-sub">This period</p>
          <div style={{ position: "relative", height: 200 }}>
            <BarChartSimple labels={sourceLabels} data={sourceValues} colors={SOURCE_COLORS} />
          </div>
        </div>
      </div>

      <div className="chart-card" style={{ marginBottom: 16 }}>
        <div className="chart-head"><h3>Lead funnel</h3></div>
        <p className="chart-sub">New lead → customer, this period</p>
        <Funnel stages={leadFunnelStages} />
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <h3>Recent leads</h3>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>click a column to sort</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <span className="lead-avatar" style={{ background: leadColor(l.name) }}>{leadInitials(l.name)}</span>
                    {l.name}
                  </td>
                  <td>{l.company}</td>
                  <td>{l.source}</td>
                  <td><span className={`lead-status-pill ${STATUS_CLASS[l.status] ?? "lead-status-new"}`}>{l.status}</span></td>
                  <td>
                    <span className="lead-score-track">
                      <span className="lead-score-fill" style={{ width: `${l.score}%` }} />
                    </span>
                    {l.score}
                  </td>
                  <td>{l.owner}</td>
                  <td>{new Date(l.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
