"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  CalendarClock,
  CheckCircle2,
  LayoutGrid,
  Plus,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformRow {
  platform: string;
  count: number;
  pct: number;
  color: string;
}

interface VelocityPoint {
  week: string;
  created: number;
  published: number;
}

interface DashboardStats {
  totalPosts: number;
  scheduledPosts: number;
  publishedPosts: number;
  thisWeekPosts: number;
  percentChange: number;
  platformDistribution: PlatformRow[];
  weeklyVelocity: VelocityPoint[];
}

// ---------------------------------------------------------------------------
// Platform display names
// ---------------------------------------------------------------------------

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  x: "X (Twitter)",
  youtube: "YouTube",
  google_business: "Google Business",
  google: "Google Business",
  tiktok: "TikTok",
};

function platformLabel(p: string) {
  return PLATFORM_LABELS[p?.toLowerCase()] ?? p;
}

// ---------------------------------------------------------------------------
// SVG Donut Chart
// ---------------------------------------------------------------------------

function DonutChart({ data, total }: { data: PlatformRow[]; total: number }) {
  const cx = 80;
  const cy = 80;
  const r = 54;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * r;

  const segments: { color: string; dashLen: number; rotate: number; label: string }[] = [];
  let cumulativePct = 0;

  data.forEach((row) => {
    const pct = total > 0 ? row.count / total : 0;
    const dashLen = pct * circumference;
    const rotate = -90 + cumulativePct * 360;
    cumulativePct += pct;
    segments.push({ color: row.color, dashLen, rotate, label: row.platform });
  });

  // Empty state
  if (data.length === 0 || total === 0) {
    return (
      <svg viewBox="0 0 160 160" width={160} height={160}>
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={strokeWidth}
        />
        <text x={cx} y={cy + 5} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize={12}>
          No data
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 160 160" width={160} height={160}>
      {/* Background ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth={strokeWidth}
      />
      {segments.map((seg, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${seg.dashLen} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="butt"
          transform={`rotate(${seg.rotate}, ${cx}, ${cy})`}
        />
      ))}
      {/* Centre label */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={18}
        fontWeight={600}
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        fill="rgba(255,255,255,0.50)"
        fontSize={10}
      >
        posts
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SVG Line Chart (Content Velocity)
// ---------------------------------------------------------------------------

function VelocityChart({ data }: { data: VelocityPoint[] }) {
  // viewBox 600×160 (3.75:1) instead of 340×160 (2.1:1) — at the
  // dashboard's typical right-card width (~700px) this renders the
  // chart as a flatter ~187px tall band instead of a ~330px tall one,
  // bringing it closer to the donut card's natural height. Fonts and
  // strokes are sized in viewBox units, so a wider viewBox also makes
  // them visually smaller — fontSize 10 here renders at ~12px on a
  // 700px-wide card, matching the dashboard's "small/muted meta"
  // typography token.
  const W = 600;
  const H = 160;
  const PAD = { top: 14, right: 16, bottom: 30, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const AXIS_FONT_SIZE = 10;
  const AXIS_FILL = "rgba(255, 255, 255, 0.40)";

  const maxVal = Math.max(
    1,
    ...data.map((d) => d.created),
    ...data.map((d) => d.published)
  );

  const xStep = chartW / Math.max(data.length - 1, 1);

  const toX = (i: number) => PAD.left + i * xStep;
  const toY = (v: number) => PAD.top + chartH - (v / maxVal) * chartH;

  const createdPoints = data.map((d, i) => `${toX(i)},${toY(d.created)}`).join(" ");
  const publishedPoints = data.map((d, i) => `${toX(i)},${toY(d.published)}`).join(" ");

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
      {/* Grid lines */}
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={toY(tick)}
            y2={toY(tick)}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth={1}
          />
          <text
            x={PAD.left - 6}
            y={toY(tick) + 4}
            textAnchor="end"
            fill={AXIS_FILL}
            fontSize={AXIS_FONT_SIZE}
          >
            {tick}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text
          key={i}
          x={toX(i)}
          y={H - 6}
          textAnchor="middle"
          fill={AXIS_FILL}
          fontSize={AXIS_FONT_SIZE}
        >
          {d.week}
        </text>
      ))}

      {/* Created line (coral) */}
      <polyline
        points={createdPoints}
        fill="none"
        stroke="#F472B6"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Published line (green) */}
      <polyline
        points={publishedPoints}
        fill="none"
        stroke="#22C55E"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots — created */}
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.created)} r={3} fill="#F472B6" />
      ))}

      {/* Dots — published */}
      {data.map((d, i) => (
        <circle key={i} cx={toX(i)} cy={toY(d.published)} r={3} fill="#22C55E" />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  href,
  icon,
  percentChange,
}: {
  label: string;
  value: number;
  href: string;
  icon: React.ReactNode;
  percentChange?: number;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
      style={{
        flex: 1,
        minWidth: 0,
        background: "rgba(33, 33, 33, 0.14)",
        border: "1px solid rgba(255, 255, 255, 0.10)",
        borderRadius: 16,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        padding: "20px 20px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(33, 33, 33, 0.20)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "rgba(33, 33, 33, 0.14)";
      }}
    >
      {/* Icon row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {icon}
        </div>
        {percentChange !== undefined && (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              fontSize: 11,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 9999,
              background:
                percentChange >= 0
                  ? "rgba(34,197,94,0.18)"
                  : "rgba(239,68,68,0.18)",
              color: percentChange >= 0 ? "#22C55E" : "#EF4444",
            }}
          >
            {percentChange >= 0 ? (
              <TrendingUp size={11} />
            ) : (
              <TrendingDown size={11} />
            )}
            {Math.abs(percentChange)}%
          </span>
        )}
      </div>

      {/* Count */}
      <div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: "#ffffff",
            lineHeight: 1,
          }}
        >
          {value.toLocaleString()}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            color: "rgba(255,255,255,0.55)",
            fontWeight: 400,
          }}
        >
          {label}
        </div>
      </div>

      {/* Click link */}
      <div
        style={{
          fontSize: 12,
          color: "rgba(255,255,255,0.35)",
          marginTop: "auto",
        }}
      >
        Click to view →
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/stats", { credentials: "include" })
      .then((r) => r.json()).then(unwrap)
      .then((data) => setStats(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalPlatformPosts =
    stats?.platformDistribution?.reduce((s, p) => s + p.count, 0) ?? 0;

  // Show skeleton pulse while loading
  const Skeleton = ({ w = "100%", h = 20 }: { w?: number | string; h?: number }) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: "rgba(255,255,255,0.08)",
        animation: "qs-pulse 1.4s ease-in-out infinite",
      }}
    />
  );

  return (
    <>
      {/* Pulse keyframe */}
      <style>{`
        @keyframes qs-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
      `}</style>

      {/* Outer page wrapper — no padding/margin/max-width. The
          dashboard layout shell owns all outer spacing. */}
      <div>
        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 500,
                color: "#ffffff",
                margin: 0,
              }}
            >
              Dashboard
            </h1>
            <p
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.45)",
                marginTop: 4,
              }}
            >
              Overview of your brand performance
            </p>
          </div>

          <Link
            href="/dashboard/posts/create"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 18px",
              borderRadius: 10,
              background: "#ffffff",
              color: "#0a0a0a",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            <Plus size={15} />
            Create Post
          </Link>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display: "flex", gap: 14, marginBottom: 24 }}>
          {loading ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  // Match the real KpiCard's primary-glass tint so the
                  // wallpaper shows through and dimensions don't shift
                  // when stats arrive.
                  style={{
                    flex: 1,
                    height: 160,
                    borderRadius: 16,
                    background: "rgba(33, 33, 33, 0.14)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    animation: "qs-pulse 1.4s ease-in-out infinite",
                  }}
                />
              ))}
            </>
          ) : (
            <>
              <KpiCard
                label="Total Posts Created"
                value={stats?.totalPosts ?? 0}
                href="/dashboard/content-hub"
                icon={<LayoutGrid size={17} />}
                percentChange={stats?.percentChange}
              />
              <KpiCard
                label="Scheduled Posts"
                value={stats?.scheduledPosts ?? 0}
                href="/dashboard/content-hub?filter=scheduled"
                icon={<CalendarClock size={17} />}
              />
              <KpiCard
                label="Posts Published"
                value={stats?.publishedPosts ?? 0}
                href="/dashboard/content-hub?filter=published"
                icon={<CheckCircle2 size={17} />}
              />
              <KpiCard
                label="Posts This Week"
                value={stats?.thisWeekPosts ?? 0}
                href="/dashboard/content-hub?filter=week"
                icon={
                  <svg
                    width={17}
                    height={17}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                  </svg>
                }
              />
            </>
          )}
        </div>

        {/* ── Charts row ── */}
        {/*
          flex-wrap + min-width:0 on each child fixes the overflow that
          let the velocity SVG bleed off the right edge of the viewport
          on narrow widths. flexBasis 360px on both cards means they
          stack vertically once the viewport can't fit them side by
          side (≤ 736px including 16px gap).
        */}
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          {/* Left — Platform Distribution */}
          <div
            // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
            style={{
              flex: "1 1 360px",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              background: "rgba(33, 33, 33, 0.14)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 16,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
              padding: "20px 20px 16px",
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#ffffff",
                marginBottom: 20,
              }}
            >
              Platform Performance
            </p>

            {loading ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Skeleton w={160} h={160} />
                <Skeleton h={14} />
                <Skeleton h={14} />
                <Skeleton h={14} />
              </div>
            ) : (
              <>
                {/* Donut */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                  <DonutChart data={stats?.platformDistribution ?? []} total={totalPlatformPosts} />
                </div>

                {/* Table */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(stats?.platformDistribution ?? []).length === 0 ? (
                    <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, textAlign: "center" }}>
                      No posts yet
                    </p>
                  ) : (
                    (stats?.platformDistribution ?? []).map((row) => (
                      <div
                        key={row.platform}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        {/* Color dot */}
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: row.color,
                            flexShrink: 0,
                          }}
                        />
                        {/* Name */}
                        <span
                          style={{
                            flex: 1,
                            fontSize: 12,
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          {platformLabel(row.platform)}
                        </span>
                        {/* % bar */}
                        <div
                          style={{
                            width: 60,
                            height: 4,
                            borderRadius: 9999,
                            background: "rgba(255,255,255,0.10)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${row.pct}%`,
                              height: "100%",
                              background: row.color,
                              borderRadius: 9999,
                            }}
                          />
                        </div>
                        {/* Pct */}
                        <span
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.55)",
                            width: 32,
                            textAlign: "right",
                          }}
                        >
                          {row.pct}%
                        </span>
                        {/* Count */}
                        <span
                          style={{
                            fontSize: 12,
                            color: "rgba(255,255,255,0.40)",
                            width: 24,
                            textAlign: "right",
                          }}
                        >
                          {row.count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right — Content Velocity */}
          <div
            // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
            style={{
              flex: "2 1 360px",
              minWidth: 0,
              maxWidth: "100%",
              overflow: "hidden",
              background: "rgba(33, 33, 33, 0.14)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 16,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
              padding: "20px 20px 16px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <p style={{ fontSize: 14, fontWeight: 500, color: "#ffffff" }}>
                Platform Performance
              </p>

              {/* Legend */}
              <div style={{ display: "flex", gap: 16 }}>
                <span
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.60)" }}
                >
                  <span style={{ width: 20, height: 2, background: "#F472B6", display: "inline-block", borderRadius: 9999 }} />
                  Created
                </span>
                <span
                  style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "rgba(255,255,255,0.60)" }}
                >
                  <span style={{ width: 20, height: 2, background: "#22C55E", display: "inline-block", borderRadius: 9999 }} />
                  Published
                </span>
              </div>
            </div>

            {loading ? (
              <div style={{ height: 160, animation: "qs-pulse 1.4s ease-in-out infinite", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }} />
            ) : (
              <VelocityChart data={stats?.weeklyVelocity ?? []} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
