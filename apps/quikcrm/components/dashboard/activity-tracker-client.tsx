"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw, Settings2, Target } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

const TRACKER_API = "/api/dashboard/activity-target-tracker";

type Status = "green" | "yellow" | "red";

interface TrackerRow {
  userId: string;
  name: string;
  email: string | null;
  dailyTarget: number;
  todayActivities: number;
  remaining: number;
  completionPct: number;
  weeklyTarget: number;
  weeklyActivities: number;
  status: Status;
}

interface TrackerDto {
  defaultDailyTarget: number;
  weeklyWorkingDays: number;
  rows: TrackerRow[];
}

function clientTz(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// Semantic status colors (data state — hardcoded per CLAUDE.md, NOT accent-*).
const STATUS_BADGE: Record<Status, string> = {
  green: "bg-green-100 text-green-700",
  yellow: "bg-yellow-100 text-yellow-700",
  red: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<Status, string> = {
  green: "On Target",
  yellow: "At Risk",
  red: "Below Target",
};
const STATUS_ROW: Record<Status, string> = {
  green: "",
  yellow: "bg-yellow-50/40",
  red: "bg-red-50/50",
};

function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ActivityTrackerClient() {
  const toast = useToast();
  const [data, setData] = useState<TrackerDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(TRACKER_API, {
        credentials: "include",
        headers: { "X-Client-TZ": clientTz() },
      });
      const json = await res.json();
      if (res.status === 403) throw new Error("Access restricted to administrators.");
      if (!res.ok || !json?.success) throw new Error(json?.error ?? `Load failed (${res.status})`);
      setData(json.data as TrackerDto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load tracker");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Org-wide roll-up for the summary indicator tiles (requirement #5).
  const summary = useMemo(() => {
    const rows = data?.rows ?? [];
    const dailyTarget = rows.reduce((s, r) => s + r.dailyTarget, 0);
    const todayActivities = rows.reduce((s, r) => s + r.todayActivities, 0);
    const weeklyTarget = rows.reduce((s, r) => s + r.weeklyTarget, 0);
    const weeklyActivities = rows.reduce((s, r) => s + r.weeklyActivities, 0);
    const remaining = Math.max(0, dailyTarget - todayActivities);
    const completionPct = dailyTarget > 0 ? Math.round((todayActivities / dailyTarget) * 100) : 100;
    const belowCount = rows.filter((r) => r.status === "red").length;
    return { dailyTarget, todayActivities, remaining, completionPct, weeklyTarget, weeklyActivities, belowCount };
  }, [data]);

  const tiles = [
    { label: "Daily Target", value: summary.dailyTarget },
    { label: "Today's Activities", value: summary.todayActivities },
    { label: "Remaining", value: summary.remaining },
    { label: "Completion %", value: `${summary.completionPct}%` },
    { label: "Weekly Target", value: summary.weeklyTarget },
    { label: "Weekly Activities", value: summary.weeklyActivities },
  ];

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-crm-text sm:text-2xl">
            <Target size={22} className="text-crm-blue" />
            Activity Target Tracker
          </h1>
          <p className="mt-1 text-sm text-crm-muted">
            Assigned salespeople only. Daily and weekly activity attainment, largest shortfall first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
          <Link
            href="/settings/activity-targets"
            className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
          >
            <Settings2 size={15} />
            Configure
          </Link>
        </div>
      </div>

      {/* Summary indicator tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <Card key={t.label} className="crm-card">
            <CardBody className="p-4">
              <div className="text-xs font-medium text-crm-muted">{t.label}</div>
              <div className="mt-1 text-2xl font-semibold text-crm-text">
                {loading ? "—" : t.value}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {!loading && summary.belowCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">{summary.belowCount}</span>{" "}
          salesperson{summary.belowCount === 1 ? "" : "s"} below 80% of the daily target.
        </div>
      )}

      {/* Tracker table */}
      <Card className="crm-card">
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Salesperson</TH>
                  <TH>Daily Target</TH>
                  <TH>Today&apos;s Activities</TH>
                  <TH>Remaining</TH>
                  <TH>Completion %</TH>
                  <TH>Weekly Target</TH>
                  <TH>Weekly Activities</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {loading && (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-crm-muted">
                      Loading…
                    </TD>
                  </TR>
                )}
                {!loading &&
                  (data?.rows ?? []).map((r) => (
                    <TR key={r.userId} className={STATUS_ROW[r.status]}>
                      <TD>
                        <span className="font-medium text-crm-text">{r.name}</span>
                        {r.email && <span className="block text-xs text-crm-muted">{r.email}</span>}
                      </TD>
                      <TD>{r.dailyTarget}</TD>
                      <TD className="font-medium">{r.todayActivities}</TD>
                      <TD>{r.remaining}</TD>
                      <TD>
                        <span
                          className={
                            r.status === "red"
                              ? "font-semibold text-red-600"
                              : r.status === "yellow"
                                ? "font-semibold text-yellow-700"
                                : "font-semibold text-green-700"
                          }
                        >
                          {r.completionPct}%
                        </span>
                      </TD>
                      <TD>{r.weeklyTarget}</TD>
                      <TD>{r.weeklyActivities}</TD>
                      <TD>
                        <StatusBadge status={r.status} />
                      </TD>
                    </TR>
                  ))}
                {!loading && (data?.rows ?? []).length === 0 && (
                  <TR>
                    <TD colSpan={8} className="py-8 text-center text-crm-muted">
                      No salespeople have a target assigned.{" "}
                      <Link href="/settings/activity-targets" className="text-crm-blue underline">
                        Assign targets
                      </Link>{" "}
                      to start tracking.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
