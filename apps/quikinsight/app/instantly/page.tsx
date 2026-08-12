"use client";
import { useEffect, useState } from "react";
import { getInstantlyData, type InstantlyData } from "@/lib/api/instantly";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const IN_PURPLE = "#6C5CE0";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const color = s === "active" || s === "sending" ? "#16A34A" : s === "paused" ? "#D97706" : "#6B7280";
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: `${color}18`, borderRadius: 5, padding: "2px 7px", textTransform: "capitalize" }}>{s}</span>
  );
}

export default function InstantlyPage() {
  const [data, setData] = useState<InstantlyData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getInstantlyData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">Instantly</div><p className="page-sub">Cold outreach analytics</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load Instantly data" body="Something went wrong. Please refresh and try again." ctaHref="/instantly" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">Instantly</div><p className="page-sub">Cold outreach analytics</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">Instantly</div><p className="page-sub">Cold outreach analytics</p></div></div>
      <NotConnected
        icon="🚀"
        title="Instantly not connected"
        body="Connect your Instantly workspace to see campaign send volume, open rates, reply rates, and bounce rates."
        ctaHref="/integrations"
        ctaLabel="Connect Instantly"
      />
    </div>
  );

  return (
    <div>
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: IN_PURPLE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </div>
          <div>
            <div className="page-title">Instantly</div>
            <p className="page-sub">{data.workspaceName ?? "Cold outreach analytics"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Campaigns" value={String(data.totalCampaigns ?? 0)} color={IN_PURPLE} />
        <Kpi label="Emails Sent" value={fmt(data.emailsSent ?? 0)} color={IN_PURPLE} />
        <Kpi label="Open Rate" value={`${((data.openRate ?? 0) * 100).toFixed(1)}%`} color={IN_PURPLE} />
        <Kpi label="Reply Rate" value={`${((data.replyRate ?? 0) * 100).toFixed(1)}%`} color={IN_PURPLE} />
        <Kpi label="Bounce Rate" value={`${((data.bounceRate ?? 0) * 100).toFixed(1)}%`} color="#EA4335" />
      </div>

      {(data.recentCampaigns?.length ?? 0) > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head"><h3>Campaigns</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Campaign", "Status", "Sent", "Opened", "Replied", "Bounced"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.recentCampaigns!.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", color: "var(--text-primary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</td>
                  <td style={{ padding: "7px 8px" }}>{statusBadge(c.status)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(c.sent)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(c.opened)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(c.replied)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "#EA4335" }}>{fmt(c.bounced)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
