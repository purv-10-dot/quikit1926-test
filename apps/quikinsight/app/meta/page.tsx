"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getFacebookData, type FacebookData } from "@/lib/api/facebook";
import { getInstagramData, type InstagramData } from "@/lib/api/instagram";
import Kpi from "@/components/ui/Kpi";
import NotConnected from "@/components/ui/NotConnected";
import { SkeletonKpiStrip, SkeletonChartCards } from "@/components/ui/Skeleton";
import PeriodPicker from "@/components/ui/PeriodPicker";
import { resolvePeriod, periodLabel } from "@/lib/period/resolve";
import type { PeriodSpec } from "@/lib/period/types";

const FB_BLUE  = "#0866FF";
const IG_COLOR = "#E1306C";
const IG_GRAD  = "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)";

type Tab = "facebook" | "instagram";

/** This page's pre-existing default range (matches the connectors' own trailingWindow(7) fallback). */
const INITIAL_PERIOD: PeriodSpec = { preset: 7, compare: "none" };

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

function timeAgo(ts: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    {
      id: "facebook",
      label: "Facebook",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill={active === "facebook" ? FB_BLUE : "var(--text-muted)"}>
          <path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      ),
    },
    {
      id: "instagram",
      label: "Instagram",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill={active === "instagram" ? IG_COLOR : "var(--text-muted)"}>
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      ),
    },
  ];
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--hairline)", marginBottom: 20 }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            all: "unset", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 18px",
            fontSize: 13.5,
            fontWeight: active === t.id ? 600 : 400,
            color: active === t.id ? (t.id === "facebook" ? FB_BLUE : IG_COLOR) : "var(--text-secondary)",
            borderBottom: active === t.id ? `2px solid ${t.id === "facebook" ? FB_BLUE : IG_COLOR}` : "2px solid transparent",
            marginBottom: -1,
            transition: "color .15s, border-color .15s",
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Facebook panel ──────────────────────────────────────────────────────────

function FacebookPanel({ period, rangeLabel }: { period: PeriodSpec; rangeLabel: string }) {
  const router = useRouter();
  const [data, setData] = useState<FacebookData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
    getFacebookData(period).then(setData).catch(() => setError(true));
  }, [period]);

  if (error) return <NotConnected icon="⚠️" title="Couldn't load Facebook data" body="Something went wrong. Please refresh and try again." ctaHref="/meta" ctaLabel="Retry" />;
  if (!data) return <><SkeletonKpiStrip /><div style={{ marginTop: 16 }}><SkeletonChartCards /></div></>;
  if (!data.connected) return (
    <NotConnected
      icon="👤"
      title="Facebook not connected"
      body="Connect your Facebook page to see fans, reach, impressions, and post performance."
      ctaHref="/integrations"
      ctaLabel="Connect Facebook"
    />
  );

  const engRate = Number(data.engagementRate ?? 0);

  return (
    <>
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: FB_BLUE, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>{data.pageName ?? "Facebook"}</h1>
            <p className="page-sub" style={{ margin: 0 }}>Page analytics · {rangeLabel}</p>
          </div>
        </div>
        <div className="greet-actions">
          <button className="btn" type="button" onClick={() => router.push("/integrations")}>Reconnect</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push("/ask-ai")}>✦ Ask AI</button>
        </div>
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <Kpi label="Page Fans"     value={fmt(data.fans ?? 0)}            delta="" trend="flat" sub="total followers" />
        <Kpi label="Reach"         value={fmt(data.reach ?? 0)}           delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Impressions"   value={fmt(data.impressions ?? 0)}     delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Engaged Users" value={fmt(data.engagedUsers ?? 0)}    delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Eng. Rate"     value={`${engRate.toFixed(1)}%`}       delta="" trend={engRate >= 3 ? "up" : engRate >= 1 ? "flat" : "down"} sub="reach basis" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="chart-card">
          <div className="chart-head"><h3>Engagement breakdown</h3></div>
          <p className="chart-sub">Post interactions — {rangeLabel}</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Reach",         value: data.reach ?? 0,           color: FB_BLUE  },
              { label: "Impressions",   value: data.impressions ?? 0,     color: "#0084FF" },
              { label: "Engaged Users", value: data.engagedUsers ?? 0,    color: "#6B40CC" },
              { label: "Post Engage.",  value: data.postEngagements ?? 0, color: "#16A34A" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head"><h3>Top posts by reach</h3></div>
          <p className="chart-sub">{rangeLabel}, sorted by impressions</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {(data.topPosts ?? []).slice(0, 5).map((post, i) => (
              <div key={post.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "var(--canvas)", borderRadius: 8 }}>
                {post.thumbnail && <img src={post.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {post.message || <span style={{ color: "var(--text-muted)" }}>No caption</span>}
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(post.timestamp)}</span>
                    <span style={{ fontSize: 11, color: FB_BLUE, fontWeight: 600 }}>{fmt(post.reach)} reach</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmt(post.engagement)} eng.</span>
                  </div>
                </div>
              </div>
            ))}
            {(data.topPosts ?? []).length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No recent posts found.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Instagram panel ─────────────────────────────────────────────────────────

function InstagramPanel({ period, rangeLabel }: { period: PeriodSpec; rangeLabel: string }) {
  const router = useRouter();
  const [data, setData] = useState<InstagramData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
    getInstagramData(period).then(setData).catch(() => setError(true));
  }, [period]);

  if (error) return <NotConnected icon="⚠️" title="Couldn't load Instagram data" body="Something went wrong. Please refresh and try again." ctaHref="/meta" ctaLabel="Retry" />;
  if (!data) return <><SkeletonKpiStrip /><div style={{ marginTop: 16 }}><SkeletonChartCards /></div></>;
  if (!data.connected) return (
    <NotConnected
      icon="📸"
      title="Instagram not connected"
      body="Connect your Facebook page with a linked Instagram business account to see reach, impressions, and post analytics."
      ctaHref="/integrations"
      ctaLabel="Connect via Facebook"
    />
  );

  const engRate = Number(data.engagementRate ?? 0);

  return (
    <>
      <div className="greet-row">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: IG_GRAD, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
          </div>
          <div>
            <h1 className="greeting" style={{ fontSize: 22 }}>{data.username ? `@${data.username}` : "Instagram"}</h1>
            <p className="page-sub" style={{ margin: 0 }}>Account analytics · {rangeLabel}</p>
          </div>
        </div>
        <div className="greet-actions">
          <button className="btn" type="button" onClick={() => router.push("/integrations")}>Reconnect</button>
          <button className="btn btn-primary" type="button" onClick={() => router.push("/ask-ai")}>✦ Ask AI</button>
        </div>
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        <Kpi label="Followers"     value={fmt(data.followers ?? 0)}      delta="" trend="flat" sub="total" />
        <Kpi label="Reach"         value={fmt(data.reach ?? 0)}          delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Impressions"   value={fmt(data.impressions ?? 0)}    delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Profile Views" value={fmt(data.profileViews ?? 0)}   delta="" trend="flat" sub={rangeLabel} />
        <Kpi label="Eng. Rate"     value={`${engRate.toFixed(1)}%`}      delta="" trend={engRate >= 3 ? "up" : engRate >= 1 ? "flat" : "down"} sub="reach basis" />
      </div>

      {data.insightsNotice && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "-6px 0 16px" }}>{data.insightsNotice}</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="chart-card">
          <div className="chart-head"><h3>Audience metrics</h3></div>
          <p className="chart-sub">Account-level performance overview</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 8 }}>
            {[
              { label: "Followers",         value: data.followers ?? 0,       color: IG_COLOR  },
              { label: "Reach",             value: data.reach ?? 0,           color: "#8B5CF6" },
              { label: "Impressions",       value: data.impressions ?? 0,     color: "#0EA5E9" },
              { label: "Accounts Engaged",  value: data.accountsEngaged ?? 0, color: "#16A34A" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--canvas)", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: item.color }}>{fmt(item.value)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <div className="chart-head"><h3>Top posts by reach</h3></div>
          <p className="chart-sub">{rangeLabel}, sorted by reach</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {(data.topPosts ?? []).slice(0, 5).map((post, i) => (
              <div key={post.id || i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "var(--canvas)", borderRadius: 8 }}>
                {post.thumbnail && <img src={post.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.45, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                    {post.message || <span style={{ color: "var(--text-muted)" }}>No caption</span>}
                  </p>
                  <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{timeAgo(post.timestamp)}</span>
                    <span style={{ fontSize: 11, color: IG_COLOR, fontWeight: 600 }}>{fmt(post.reach)} reach</span>
                    {post.mediaType && <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--border)", borderRadius: 4, padding: "1px 6px" }}>{post.mediaType}</span>}
                  </div>
                </div>
              </div>
            ))}
            {(data.topPosts ?? []).length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>No recent posts found.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function MetaPage() {
  const [tab, setTab] = useState<Tab>("facebook");
  const [period, setPeriod] = useState<PeriodSpec>(INITIAL_PERIOD);
  const rangeLabel = periodLabel(resolvePeriod(period));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="page-title">Meta</div>
          <p className="page-sub">Facebook &amp; Instagram analytics</p>
        </div>
        <PeriodPicker value={period} onChange={setPeriod} allowCompare={false} />
      </div>
      <TabBar active={tab} onChange={setTab} />
      {tab === "facebook"
        ? <FacebookPanel period={period} rangeLabel={rangeLabel} />
        : <InstagramPanel period={period} rangeLabel={rangeLabel} />}
    </div>
  );
}
