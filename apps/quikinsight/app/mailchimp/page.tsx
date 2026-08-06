"use client";
import { useEffect, useState } from "react";
import { getMailchimpData, type MailchimpData } from "@/lib/api/mailchimp";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const MC_YELLOW = "#FFE01B";
const MC_DARK   = "#241C15";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function MailchimpPage() {
  const [data, setData] = useState<MailchimpData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getMailchimpData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">Mailchimp</div><p className="page-sub">Email marketing analytics</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load Mailchimp data" body="Something went wrong. Please refresh and try again." ctaHref="/mailchimp" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">Mailchimp</div><p className="page-sub">Email marketing analytics</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">Mailchimp</div><p className="page-sub">Email marketing analytics</p></div></div>
      <NotConnected
        icon="✉️"
        title="Mailchimp not connected"
        body="Connect your Mailchimp audience to see subscriber counts, open rates, click rates, and campaign performance."
        ctaHref="/integrations"
        ctaLabel="Connect Mailchimp"
      />
    </div>
  );

  return (
    <div>
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: MC_YELLOW, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={MC_DARK}><path d="M21.6 8.4c-.4-.5-1-.8-1.7-.8-.3 0-.6.1-.9.2-.6-2.2-2.6-3.8-5-3.8-1.2 0-2.4.4-3.3 1.1-.5-.3-1-.5-1.6-.5-1.5 0-2.7 1.1-2.9 2.5-1.5.6-2.5 2-2.5 3.7 0 2.2 1.8 4 4 4h12c1.7 0 3-1.3 3-3 0-.9-.4-1.7-1.1-2.4z"/></svg>
          </div>
          <div>
            <div className="page-title">Mailchimp</div>
            <p className="page-sub">{data.audienceName ?? "Email marketing analytics"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Contacts" value={fmt(data.totalContacts ?? 0)} color={MC_DARK} />
        <Kpi label="Campaigns" value={String(data.totalCampaigns ?? 0)} color={MC_DARK} />
        <Kpi label="Avg. Open Rate" value={`${((data.avgOpenRate ?? 0) * 100).toFixed(1)}%`} color={MC_DARK} />
        <Kpi label="Avg. Click Rate" value={`${((data.avgClickRate ?? 0) * 100).toFixed(1)}%`} color={MC_DARK} />
        <Kpi label="Unsubscribes" value={fmt(data.unsubscribes ?? 0)} color="#EA4335" />
      </div>

      {(data.recentCampaigns?.length ?? 0) > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head"><h3>Recent Campaigns</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Campaign", "Sent", "Recipients", "Open Rate", "Click Rate"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.recentCampaigns!.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", color: "var(--text-primary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</td>
                  <td style={{ padding: "7px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{timeAgo(c.sentAt)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(c.recipients)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{(c.openRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{(c.clickRate * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
