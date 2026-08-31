"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Settings2, Target, HelpCircle } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";

const TRACKER_API = "/api/dashboard/activity-target-tracker";

type Status = "green" | "yellow" | "red";

interface TypeProgress {
  activityTypeId: string;
  code: string;
  label: string;
  dailyTarget: number;
  actual: number;
  remaining: number;
  completionPct: number;
}

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
  /** Per-activity-type progress; empty when no type targets are assigned. */
  typeProgress: TypeProgress[];
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

/**
 * Per-activity-type progress chips — "Calls: 12 / 20". Type labels come from
 * the org's activity types, so a new type appears here with no code change.
 * Colors are semantic (attainment state), hardcoded per CLAUDE.md.
 */
function TypeProgressChips({ rows }: { rows: TypeProgress[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {rows.map((t) => {
        const tone =
          t.completionPct >= 100
            ? "border-green-200 bg-green-50 text-green-700"
            : t.completionPct >= 80
              ? "border-yellow-200 bg-yellow-50 text-yellow-700"
              : "border-red-200 bg-red-50 text-red-700";
        return (
          <span
            key={t.activityTypeId}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
            title={`${t.label}: ${t.actual} of ${t.dailyTarget} (${t.completionPct}%) · ${t.remaining} remaining`}
          >
            {t.label}:
            <span className="tabular-nums font-semibold">
              {t.actual} / {t.dailyTarget}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Plain-language explanation of the tracker math. Kept in sync with
 * `computeAttainment` (activity-target-status.ts) and the three counted
 * sources in activity-target-count.ts — if either changes, update this copy.
 */
function CompletionHelp() {
  return (
    <div className="space-y-3 text-sm text-crm-muted">
      <p>
        Completion % shows how much of a salesperson&apos;s daily target they have finished
        so far today.
      </p>
      <p>
        Formula used:
        <span className="ml-1 font-medium text-crm-text">
          (Today&apos;s Activities ÷ Daily Target) × 100
        </span>
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <span className="font-medium text-crm-text">Daily Target:</span> the number of
          activities assigned to that salesperson for one day, set on the Activity Targets
          settings page.
        </li>
        <li>
          <span className="font-medium text-crm-text">Today&apos;s Activities:</span> everything
          they completed today — logged activities, call logs, and tasks marked
          &ldquo;Completed&rdquo; — added together.
        </li>
        <li>
          <span className="font-medium text-crm-text">Remaining:</span> target minus activities
          done. It never goes below zero.
        </li>
      </ul>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          Beating the target is allowed — the percentage can go above 100%. Doing 15 activities
          against a target of 10 shows <span className="font-medium text-crm-text">150%</span>.
        </li>
        <li>
          The result is rounded to a whole number, so 7 of 9 activities shows{" "}
          <span className="font-medium text-crm-text">78%</span>.
        </li>
        <li>
          If the daily target is 0, we cannot divide by zero, so Completion % is shown as{" "}
          <span className="font-medium text-crm-text">100%</span> with an
          &ldquo;On Target&rdquo; status. This keeps someone with no meaningful target from
          being flagged as behind.
        </li>
        <li>
          Salespeople with <span className="font-medium text-crm-text">no target assigned</span>{" "}
          do not appear on this page at all, and are left out of the totals at the top.
        </li>
      </ul>
      <p>
        <span className="font-medium text-crm-text">Status</span> comes from the same
        percentage: <span className="font-medium text-crm-text">On Target</span> at 100% or
        more, <span className="font-medium text-crm-text">At Risk</span> from 80% to 99%, and{" "}
        <span className="font-medium text-crm-text">Below Target</span> under 80%.
      </p>
      <p>
        The <span className="font-medium text-crm-text">Completion %</span> tile at the top of
        the page uses the same formula for the whole team: everyone&apos;s activities added up,
        divided by everyone&apos;s targets added up. It is not an average of the individual
        percentages, so one very high performer does not pull the team number up as much as
        you might expect.
      </p>
      <p>
        Today and this week follow your own time zone, and the week starts on Monday.
      </p>
    </div>
  );
}

export function ActivityTrackerClient() {
  const toast = useToast();
  const router = useRouter();
  const [data, setData] = useState<TrackerDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);

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
    { label: "Team Daily Target", value: summary.dailyTarget },
    { label: "Today's Activities", value: summary.todayActivities },
    { label: "Remaining", value: summary.remaining },
    { label: "Team Completion", value: `${summary.completionPct}%` },
    { label: "Team Weekly Target", value: summary.weeklyTarget },
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
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-crm-border px-2 text-xs font-medium text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
              aria-label="How is Completion % calculated?"
              title="How is Completion % calculated?"
            >
              <HelpCircle size={18} />
              How is this calculated?
            </button>
          </h1>
          <p className="mt-1 text-sm text-crm-muted">
            Assigned salespeople only. Daily and weekly activity attainment, largest shortfall first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-crm-border px-3 py-2 text-sm font-medium text-crm-text transition hover:bg-crm-panel"
          >
            <ArrowLeft size={15} />
            Back
          </button>
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
                  <TH>
                    <span className="inline-flex items-center gap-1">
                      Completion %
                      <button
                        type="button"
                        onClick={() => setHelpOpen(true)}
                        className="inline-flex text-crm-muted transition hover:text-crm-text"
                        aria-label="How is Completion % calculated?"
                        title="How is Completion % calculated?"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </span>
                  </TH>
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
                        <TypeProgressChips rows={r.typeProgress ?? []} />
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

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="How is Completion % Calculated?"
      >
        <CompletionHelp />
      </Modal>
    </div>
  );
}
