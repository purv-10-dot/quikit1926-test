"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLinkedInData, type LinkedInData } from "@/lib/api/linkedin";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";

const LI_BLUE = "#0A66C2";

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Horizontal ranked-bar card for audience demographic segments */
function DemoCard({ title, items, color }: { title: string; items: { name: string; count: number }[]; color: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="chart-card">
      <div className="chart-head">
        <h3>{title}</h3>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400 }}>organic followers</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
        {items.map((item, idx) => {
          const pct = Math.round((item.count / max) * 100);
          return (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "140px 1fr 40px", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>
                {item.name}
              </span>
              <div style={{ height: 10, borderRadius: 5, background: "var(--canvas)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, borderRadius: 5, background: color, transition: "width 0.4s ease" }} />
              </div>
              <span style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {item.count.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LinkedInPage() {
  const router = useRouter();
  const [data, setData] = useState<LinkedInData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getLinkedInData().then(setData).catch(() => setError(true));
  }, []);

  if (error) return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">LinkedIn</div>
          <p className="page-sub">Company page analytics</p>
        </div>
      </div>
      <NotConnected icon="⚠️" title="Couldn't load LinkedIn data" body="Something went wrong. Please refresh and try again." ctaHref="/linkedin" ctaLabel="Retry" />
    </div>
  );

  if (!data) return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">LinkedIn</div>
          <p className="page-sub">Company page analytics</p>
        </div>
      </div>
      <SkeletonKpiStrip />
      <div style={{ marginTop: 16 }}><SkeletonChartCards /></div>
    </div>
  );

  if (!data.connected) return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">LinkedIn</div>
          <p className="page-sub">Company page analytics</p>
        </div>
      </div>
      <NotConnected
        icon="💼"
        title="LinkedIn not connected"
        body="Connect your LinkedIn company page to see follower growth, impressions, post analytics, and audience demographics."
        ctaHref="/integrations"
        ctaLabel="Connect LinkedIn"
      />
    </div>
  );

  const engRate = Number(data.engagementRate ?? 0);
  const topIndustries = (data.followersByIndustry ?? []).slice(0, 6);
  const topSeniorities = (data.followersBySeniority ?? []).slice(0, 6);
  const topGeos = (data.followersByGeo ?? []).slice(0, 6);
  const topFunctions = (data.followersByFunction ?? []).slice(0, 6);

  return (
    <div>
      {/* ── Header ── */}
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: LI_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>{data.organizationName ?? "LinkedIn"}</h1>
            <p className="page-sub" style={{ margin: 0 }}>
              Company page analytics · last 7 days
              {data.websiteUrl && <> · <a href={data.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ color: LI_BLUE }}>{data.websiteUrl.replace(/^https?:\/\//, "")}</a></>}
            </p>
          </div>
        </div>
        <div className="greet-actions">
          <button className="btn" type="button" onClick={() => router.push("/integrations")}>Reconnect</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push("/ask-ai")}>✦ Ask AI</button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(6, 1fr)" }}>
        <Kpi label="Followers"   value={fmt(data.followers ?? 0)}   delta="" trend="flat" sub="total organic" />
        <Kpi label="Impressions" value={fmt(data.impressions ?? 0)} delta="" trend="flat" sub="last 7 days" />
        <Kpi label="Engagements" value={fmt(data.engagements ?? 0)} delta="" trend="flat" sub="last 7 days" />
        <Kpi label="Eng. Rate"   value={`${engRate.toFixed(1)}%`}   delta="" trend={engRate >= 2 ? "up" : engRate >= 1 ? "flat" : "down"} sub="impressions basis" />
        <Kpi label="Page Views"  value={fmt(data.pageViews ?? 0)}   delta="" trend="flat" sub="last 30 days" />
        <Kpi label="Video Views" value={fmt(data.videoViews ?? 0)}  delta="" trend="flat" sub="last 30 days" />
      </div>

      {/* ── Post engagement breakdown ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="chart-card">
          <div className="chart-head"><h3>Post engagement breakdown</h3></div>
          <p className="chart-sub">Clicks, shares, reactions and comments — last 7 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Clicks",    value: data.clicks    ?? 0, color: "#0A66C2" },
              { label: "Shares",    value: data.shares    ?? 0, color: "#5AA6E8" },
              { label: "Reactions", value: data.reactions ?? 0, color: "#7B4FB5" },
              { label: "Comments",  value: data.comments  ?? 0, color: "#16A34A" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-head"><h3>Page analytics</h3></div>
          <p className="chart-sub">Page views and visitor breakdown — last 30 days</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Total Views",     value: data.pageViews      ?? 0 },
              { label: "Unique Visitors", value: data.uniqueVisitors ?? 0 },
              { label: "Mobile Views",    value: data.mobilePageViews ?? 0 },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
          {(data.videoViews ?? 0) > 0 && (
            <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--canvas)", borderRadius: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Video views</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmt(data.videoViews ?? 0)}</div>
              </div>
              {(data.videoWatchTimeSeconds ?? 0) > 0 && (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Watch time</div>
                  <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmtTime(data.videoWatchTimeSeconds ?? 0)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Demographics ── */}
      <div className="reco-head"><h3>Audience demographics</h3><span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>organic followers by segment</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        {topIndustries.length > 0 && (
          <DemoCard title="By industry" items={topIndustries} color={LI_BLUE} />
        )}
        {topSeniorities.length > 0 && (
          <DemoCard title="By seniority" items={topSeniorities} color="#5AA6E8" />
        )}
        {topGeos.length > 0 && (
          <DemoCard title="By country" items={topGeos} color="#7B4FB5" />
        )}
        {topFunctions.length > 0 && (
          <DemoCard title="By job function" items={topFunctions} color="#16A34A" />
        )}
      </div>

      {/* ── Recent posts ── */}
      {(data.recentPosts ?? []).length > 0 && (
        <>
          <div className="reco-head"><h3>Recent posts</h3></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
            {(data.recentPosts ?? []).map((post, i) => (
              <div key={post.id || i} className="chart-card" style={{ padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: LI_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "white", fontSize: 13, fontWeight: 700 }}>
                  {i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 }}>
                    {post.text || <span style={{ color: "var(--text-muted)" }}>No text preview available</span>}
                    {post.text && post.text.length >= 120 && "…"}
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    {post.publishedAt > 0 && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{timeAgo(post.publishedAt)}</span>
                    )}
                    {post.feedDistribution && (
                      <span style={{ fontSize: 11.5, color: "var(--text-muted)", background: "var(--canvas)", borderRadius: 6, padding: "1px 7px" }}>{post.feedDistribution}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Org description / specialties ── */}
      {(data.description || (data.specialties ?? []).length > 0) && (
        <div className="chart-card" style={{ marginBottom: 18 }}>
          <div className="chart-head"><h3>Company profile</h3></div>
          {data.description && (
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, margin: "12px 0 0" }}>{data.description}</p>
          )}
          {(data.specialties ?? []).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {(data.specialties ?? []).map((s) => (
                <span key={s} style={{ fontSize: 12, background: "var(--canvas)", border: "1px solid var(--border)", borderRadius: 20, padding: "4px 12px", color: "var(--text-secondary)" }}>{s}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
