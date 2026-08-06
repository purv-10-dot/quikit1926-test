"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Target, Phone, Activity as ActivityIcon, CheckSquare, Sigma, RefreshCw } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const ME_API = "/api/activity-target/me";

type Status = "green" | "yellow" | "red";

interface Breakdown {
  calls: number;
  activities: number;
  completedTasks: number;
  total: number;
  weekTotal: number;
}
interface RecentRow {
  id: string;
  type: string;
  subject: string;
  occurredAtIso: string;
}
interface TypeProgress {
  activityTypeId: string;
  code: string;
  label: string;
  dailyTarget: number;
  actual: number;
  remaining: number;
  completionPct: number;
}
interface MyTarget {
  assigned: true;
  dailyTarget: number;
  todayActivities: number;
  remaining: number;
  completionPct: number;
  weeklyTarget: number;
  weeklyActivities: number;
  status: Status;
  breakdown: Breakdown;
  recentToday: RecentRow[];
  /** Per-activity-type progress; empty when no type targets are assigned. */
  typeProgress: TypeProgress[];
}
type MyTargetResult = { assigned: false } | MyTarget;

function clientTz(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Semantic status colors — hardcoded (data state), not accent-*.
const STATUS_META: Record<Status, { label: string; badge: string; bar: string; text: string }> = {
  green: { label: "On Target", badge: "bg-green-100 text-green-700", bar: "bg-green-500", text: "text-green-700" },
  yellow: { label: "At Risk", badge: "bg-yellow-100 text-yellow-700", bar: "bg-yellow-500", text: "text-yellow-700" },
  red: { label: "Below Target", badge: "bg-red-100 text-red-700", bar: "bg-red-500", text: "text-red-700" },
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MyActivityTargetClient() {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<MyTarget | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ME_API, {
        credentials: "include",
        headers: { "X-Client-TZ": clientTz() },
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? `Load failed (${res.status})`);
      const result = json.data as MyTargetResult;
      if (!result.assigned) {
        // No target assigned — this page is not for them.
        router.replace("/dashboard");
        return;
      }
      setData(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your activity target");
    } finally {
      setLoading(false);
    }
  }, [toast, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div className="m-4 h-40 animate-pulse rounded-xl bg-crm-panel sm:m-6" />;
  }
  if (!data) return null;

  const meta = STATUS_META[data.status];
  const barPct = Math.min(100, data.completionPct);

  const cards = [
    { label: "Daily Target", value: data.dailyTarget },
    { label: "Today's Activities", value: data.todayActivities, accent: true },
    { label: "Remaining", value: data.remaining },
    { label: "Completion %", value: `${data.completionPct}%`, accent: true },
    { label: "Weekly Target", value: data.weeklyTarget },
    { label: "Weekly Activities", value: data.weeklyActivities },
  ];

  const breakdownItems = [
    { label: "Calls", value: data.breakdown.calls, icon: Phone },
    { label: "Activities", value: data.breakdown.activities, icon: ActivityIcon },
    { label: "Completed Tasks", value: data.breakdown.completedTasks, icon: CheckSquare },
    { label: "Total Activities", value: data.breakdown.total, icon: Sigma, strong: true },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-crm-text sm:text-2xl">
            <Target size={22} className="text-crm-blue" />
            My Activity Target
          </h1>
          <p className="mt-1 text-sm text-crm-muted">Your daily and weekly activity progress.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}>{meta.label}</span>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="crm-card">
            <CardBody className="p-4">
              <div className="text-xs font-medium text-crm-muted">{c.label}</div>
              <div className={`mt-1 text-2xl font-bold tabular-nums ${c.accent ? meta.text : "text-crm-text"}`}>
                {c.value}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Progress */}
      <Card className="crm-card">
        <CardBody className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-crm-muted">
              Completed <span className="font-semibold text-crm-text">{data.todayActivities}</span> of{" "}
              {data.dailyTarget} · <span className="text-crm-text">{data.remaining}</span> remaining
            </span>
            <span className={`font-semibold ${meta.text}`}>{data.completionPct}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all ${meta.bar}`} style={{ width: `${barPct}%` }} />
          </div>
        </CardBody>
      </Card>

      {/* Per-activity-type progress ("Calls: 12 / 20") */}
      {(data.typeProgress ?? []).length > 0 && (
        <Card className="crm-card">
          <CardBody className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-crm-text">
              Activity Type Targets — Today
            </h2>
            <ul className="space-y-3">
              {data.typeProgress.map((t) => {
                // Semantic attainment colors (data state) — hardcoded per CLAUDE.md.
                const bar =
                  t.completionPct >= 100
                    ? "bg-green-500"
                    : t.completionPct >= 80
                      ? "bg-yellow-500"
                      : "bg-red-500";
                const text =
                  t.completionPct >= 100
                    ? "text-green-700"
                    : t.completionPct >= 80
                      ? "text-yellow-700"
                      : "text-red-700";
                return (
                  <li key={t.activityTypeId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium text-crm-text">{t.label}</span>
                      <span className="tabular-nums text-crm-muted">
                        <span className="font-semibold text-crm-text">{t.actual}</span> /{" "}
                        {t.dailyTarget}
                        <span className={`ml-2 font-semibold ${text}`}>{t.completionPct}%</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${bar}`}
                        style={{ width: `${Math.min(100, t.completionPct)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {/* Today's breakdown + recent */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="crm-card">
          <CardBody className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-crm-text">Today&apos;s Activity Breakdown</h2>
            <ul className="space-y-2">
              {breakdownItems.map((b) => {
                const Icon = b.icon;
                return (
                  <li
                    key={b.label}
                    className={`flex items-center justify-between rounded-lg border border-crm-border px-3 py-2.5 ${
                      b.strong ? "bg-crm-panel" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm text-crm-text">
                      <Icon size={15} className="text-crm-muted" />
                      {b.label}
                    </span>
                    <span className={`tabular-nums ${b.strong ? "text-base font-bold text-crm-text" : "font-semibold text-crm-text"}`}>
                      {b.value}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        <Card className="crm-card">
          <CardBody className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-crm-text">Recent Activities Today</h2>
            {data.recentToday.length === 0 ? (
              <p className="py-6 text-center text-sm text-crm-muted">No activities logged today yet.</p>
            ) : (
              <ul className="divide-y divide-crm-border">
                {data.recentToday.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-crm-text">{r.subject}</p>
                      <p className="text-xs text-crm-muted">{r.type}</p>
                    </div>
                    <span className="shrink-0 text-xs text-crm-muted">{fmtTime(r.occurredAtIso)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
