"use client";

import { Send, CheckCircle, Clock, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAutoReplyStats } from "@/lib/auto-reply/use-auto-reply-stats";
import { Skeleton } from "./primitives/Skeleton";

function KPICard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string;
  Icon: LucideIcon;
}) {
  return (
    <div
      style={{
        // Inner tile inside a parent glass card — a hair lighter than
        // the page so it reads as a sub-element of the card.
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 12,
        padding: "14px 16px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 12, color: "rgba(255, 255, 255, 0.65)" }}>
          {label}
        </span>
        <Icon size={16} color="rgba(255, 255, 255, 0.40)" />
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "#FFFFFF" }}>
        {value}
      </div>
    </div>
  );
}

function formatMs(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatPct(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function KpiStrip({
  brandId,
  activeRuleCount,
}: {
  brandId: string;
  activeRuleCount: number;
}) {
  const { data, loading } = useAutoReplyStats(brandId);

  if (loading) {
    return <Skeleton variant="kpi" count={4} />;
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 20,
        flexWrap: "wrap",
      }}
    >
      <KPICard
        label="Replies sent (7d)"
        value={String(data?.repliesSent ?? 0)}
        Icon={Send}
      />
      <KPICard
        label="Success rate"
        value={formatPct(data?.successRate ?? null)}
        Icon={CheckCircle}
      />
      <KPICard
        label="Avg response"
        value={formatMs(data?.avgResponseMs ?? null)}
        Icon={Clock}
      />
      <KPICard label="Active rules" value={String(activeRuleCount)} Icon={Zap} />
    </div>
  );
}
