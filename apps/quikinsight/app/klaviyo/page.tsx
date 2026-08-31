"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { getKlaviyoData, type KlaviyoData } from "@/lib/api/klaviyo";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const KL_GREEN = "#1B845A";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function KlaviyoPage() {
  const [data, setData] = useState<KlaviyoData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getKlaviyoData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">Klaviyo</div><p className="page-sub">Email & SMS marketing</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load Klaviyo data" body="Something went wrong. Please refresh and try again." ctaHref="/klaviyo" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">Klaviyo</div><p className="page-sub">Email & SMS marketing</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">Klaviyo</div><p className="page-sub">Email & SMS marketing</p></div></div>
      <NotConnected
        icon="📧"
        title="Klaviyo not connected"
        body="Connect your Klaviyo account to see profile counts, flow performance, open rates, click rates, and revenue attributed to email."
        ctaHref="/integrations"
        ctaLabel="Connect Klaviyo"
      />
    </div>
  );

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="Klaviyo" />}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: KL_GREEN, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>
          </div>
          <div>
            <div className="page-title">Klaviyo</div>
            <p className="page-sub">{data.listName ?? "Email & SMS marketing"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Total Profiles" value={fmt(data.totalProfiles ?? 0)} color={KL_GREEN} />
        <Kpi label="Active Profiles" value={fmt(data.activeProfiles ?? 0)} color={KL_GREEN} />
        <Kpi label="Flows" value={String(data.totalFlows ?? 0)} color={KL_GREEN} />
        <Kpi label="Avg. Open Rate" value={`${((data.avgOpenRate ?? 0) * 100).toFixed(1)}%`} color={KL_GREEN} />
        <Kpi label="Avg. Click Rate" value={`${((data.avgClickRate ?? 0) * 100).toFixed(1)}%`} color={KL_GREEN} />
        <Kpi label="Revenue" value={fmtMoney(data.revenue ?? 0)} color={KL_GREEN} />
      </div>

      {(data.recentCampaigns?.length ?? 0) > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head"><h3>Recent Campaigns</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Campaign", "Sent", "Recipients", "Open Rate", "Click Rate", "Revenue"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.recentCampaigns!.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", color: "var(--text-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                  <td style={{ padding: "7px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{timeAgo(c.sentAt)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(c.recipients)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{(c.openRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{(c.clickRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmtMoney(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
