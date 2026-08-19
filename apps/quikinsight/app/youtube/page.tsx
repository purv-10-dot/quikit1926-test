"use client";
import { useEffect, useState } from "react";
import SampleDataBanner from "@/components/ui/SampleDataBanner";
import { getYouTubeData, type YouTubeData } from "@/lib/api/youtube";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const YT_RED = "#FF0000";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function YouTubePage() {
  const [data, setData] = useState<YouTubeData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getYouTubeData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head"><div><div className="page-title">YouTube</div><p className="page-sub">Channel analytics</p></div></div>
      <NotConnected icon="⚠️" title="Couldn't load YouTube data" body="Something went wrong. Please refresh and try again." ctaHref="/youtube" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head"><div><div className="page-title">YouTube</div><p className="page-sub">Channel analytics</p></div></div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head"><div><div className="page-title">YouTube</div><p className="page-sub">Channel analytics</p></div></div>
      <NotConnected
        icon="▶️"
        title="YouTube not connected"
        body="Connect your YouTube channel to see subscribers, views, watch time, and top video performance."
        ctaHref="/integrations"
        ctaLabel="Connect YouTube"
      />
    </div>
  );

  return (
    <div>
      {data.isSampleData && <SampleDataBanner platform="YouTube" />}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: YT_RED, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M23.5 6.2a3.01 3.01 0 0 0-2.12-2.13C19.54 3.6 12 3.6 12 3.6s-7.54 0-9.38.5A3.01 3.01 0 0 0 .5 6.2C0 8.05 0 12 0 12s0 3.95.5 5.8a3.01 3.01 0 0 0 2.12 2.13C4.46 20.4 12 20.4 12 20.4s7.54 0 9.38-.5a3.01 3.01 0 0 0 2.12-2.12C24 15.95 24 12 24 12s0-3.95-.5-5.8zM9.75 15.52V8.48L15.86 12l-6.11 3.52z"/></svg>
          </div>
          <div>
            <div className="page-title">YouTube</div>
            <p className="page-sub">{data.channelName ?? "Channel analytics"}</p>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <Kpi label="Subscribers" value={fmt(data.subscribers ?? 0)} color={YT_RED} />
        <Kpi label="Total Views" value={fmt(data.totalViews ?? 0)} color={YT_RED} />
        <Kpi label="Videos" value={String(data.totalVideos ?? 0)} color={YT_RED} />
        <Kpi label="Watch Time" value={`${fmt(data.watchTimeHours ?? 0)}h`} color={YT_RED} />
        <Kpi label="Avg. View Duration" value={fmtTime(data.avgViewDuration ?? 0)} color={YT_RED} />
      </div>

      {(data.topVideos?.length ?? 0) > 0 && (
        <div className="chart-card" style={{ marginTop: 16 }}>
          <div className="chart-head"><h3>Top Videos</h3></div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
            <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Title", "Views", "Likes", "Comments", "Published"].map((h) => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: "var(--text-secondary)", fontSize: 12 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {data.topVideos!.map((v, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "7px 8px", color: "var(--text-primary)", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(v.views)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right" }}>{fmt(v.likes)}</td>
                  <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-muted)" }}>{fmt(v.comments)}</td>
                  <td style={{ padding: "7px 8px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{timeAgo(v.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
