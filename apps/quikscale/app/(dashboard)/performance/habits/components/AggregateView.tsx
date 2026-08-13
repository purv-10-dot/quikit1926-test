"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Pencil,
  Play,
  Square as StopIcon,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  useHabitCampaign,
  useLaunchHabitCampaign,
  useCloseHabitCampaign,
  useDeleteHabitCampaign,
  useMyHabitResponse,
  useUpdateHabitCampaign,
} from "@/lib/hooks/useHabits";
import { toDateInputValue } from "@/lib/utils/dateUtils";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { notify } from "@/lib/utils/notify";
import { MyResponseModal } from "./MyResponseModal";
import { useConfirm } from "@quikit/ui";
import type { CampaignAggregate, HabitAggregate } from "@/lib/schemas/habitSchema";
import { LegacyAssessmentView } from "./LegacyAssessmentView";
import { ParticipationPanel } from "./ParticipationPanel";
import { TrendChart } from "./TrendChart";
import { ChecklistTable } from "./ChecklistTable";
import type { AdminCampaignRow } from "./types";

interface DetailResponse {
  campaign: AdminCampaignRow;
  legacy: boolean;
  aggregate?: CampaignAggregate;
  round?: number;
  totalRounds?: number;
  previousPct?: number | null;
}

interface Props {
  campaignId: string;
  onDeleted?: () => void;
}

export function AggregateView({ campaignId, onDeleted }: Props) {
  const { data, isLoading } = useHabitCampaign(campaignId);
  const launch = useLaunchHabitCampaign(campaignId);
  const close = useCloseHabitCampaign(campaignId);
  const remove = useDeleteHabitCampaign();
  const confirm = useConfirm();
  const [showFillModal, setShowFillModal] = useState(false);

  const isLegacy = (data as DetailResponse | undefined)?.legacy === true;
  const { data: myResponse } = useMyHabitResponse(campaignId, !isLegacy);
  const adminHasSubmitted = !!myResponse;

  if (isLoading) return <DetailSkeleton />;
  const detail = data as DetailResponse | undefined;
  if (!detail) return null;

  if (detail.legacy) {
    return <LegacyAssessmentView campaign={detail.campaign} onDeleted={onDeleted} />;
  }

  const { campaign, aggregate } = detail;
  const round = detail.round ?? 1;
  const totalRounds = detail.totalRounds ?? 1;
  const previousPct = detail.previousPct ?? null;
  if (!aggregate) return null;

  async function handleDelete() {
    const label =
      totalRounds > 1
        ? `${campaign.quarter} ${campaign.year} · Round ${round}`
        : `${campaign.quarter} ${campaign.year}`;
    if (
      !(await confirm({
        title: `Delete ${label} campaign?`,
        description:
          "All responses will be deleted. This cannot be undone. Other rounds for this quarter remain.",
        confirmLabel: "Delete",
        tone: "danger",
      }))
    )
      return;
    await remove.mutateAsync(campaign.id);
    onDeleted?.();
  }

  const totalOutOf40 = aggregate.totalOutOf40;
  // Only show the round-over-round delta when BOTH this round and the
  // previous one have actual responses — otherwise "-35 vs last round"
  // misleads (we'd be comparing 0 to whatever the previous score was).
  const showDelta =
    previousPct !== null && previousPct > 0 && aggregate.respondentCount > 0;
  const previousOutOf40 = showDelta ? Math.round((previousPct as number) * 40) : null;
  const deltaPts = showDelta
    ? Math.round((aggregate.overallPct - (previousPct as number)) * 40)
    : null;

  // RAG colour the hero score so a glance at the big number tells you whether
  // the org is in good shape. Reference design uses red for <50%, amber for
  // 50–79%, green for ≥80% — matches the campaign's own RAG palette.
  const heroPct = aggregate.respondentCount > 0 ? aggregate.overallPct : null;
  const heroColor =
    heroPct === null
      ? "text-gray-900"
      : heroPct >= 0.8
        ? "text-green-600"
        : heroPct >= 0.5
          ? "text-amber-600"
          : "text-red-500";
  const deadlineLabel = campaign.deadline
    ? new Date(campaign.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const statusLabel =
    campaign.status === "active"
      ? "Active"
      : campaign.status === "draft"
        ? "Draft"
        : "Final";
  const subTitleParts: string[] = [];
  if (totalRounds > 1) subTitleParts.push(`Round ${round} of ${totalRounds}`);
  if (campaign.status === "draft") subTitleParts.push("Not launched");
  else if (campaign.status === "active" && deadlineLabel) subTitleParts.push(`Due ${deadlineLabel}`);
  else if (campaign.status === "closed" && deadlineLabel) subTitleParts.push(`Closed · ${deadlineLabel}`);

  return (
    <div className="px-4 sm:px-8 py-4 sm:py-6 w-full">
      <section className="mb-6 sm:mb-8">
        <div className="flex flex-col xl:flex-row xl:items-start gap-6 xl:gap-10">
          <div className="xl:w-64 flex-shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
              {campaign.quarter} {campaign.year}
              {subTitleParts.length > 0 && (
                <span className="text-gray-400"> · {subTitleParts.join(" · ")}</span>
              )}
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <span
                className={`text-5xl sm:text-6xl xl:text-7xl font-bold tracking-tight tabular-nums leading-none ${heroColor}`}
              >
                {totalOutOf40}
              </span>
              <span className="text-base text-gray-500 font-medium pb-2">of 40</span>
            </div>
            {deltaPts !== null && previousOutOf40 !== null && (
              <div className="mt-2 flex flex-col">
                <span
                  className={`inline-flex items-center gap-1 text-base font-bold tabular-nums ${
                    deltaPts > 0
                      ? "text-green-600"
                      : deltaPts < 0
                        ? "text-red-500"
                        : "text-gray-500"
                  }`}
                >
                  {deltaPts > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : deltaPts < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : null}
                  {deltaPts > 0 ? "+" : ""}
                  {deltaPts}
                </span>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  vs last round ({previousOutOf40})
                </span>
              </div>
            )}

            <ScoreContext
              statusLabel={statusLabel}
              status={campaign.status}
              deadlineLabel={deadlineLabel}
              respondents={aggregate.respondentCount}
              campaignId={campaign.id}
              deadlineISO={campaign.deadline ?? null}
            />

            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {campaign.status === "active" && !adminHasSubmitted && (
                <button
                  onClick={() => setShowFillModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Fill my response
                </button>
              )}
              {campaign.status === "active" && adminHasSubmitted && (
                <span className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg">
                  <Check className="h-3.5 w-3.5" /> You submitted
                </span>
              )}
              {campaign.status === "draft" && (
                <button
                  onClick={() => launch.mutate()}
                  disabled={launch.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm disabled:opacity-50 transition-colors"
                >
                  <Play className="h-3.5 w-3.5" /> Launch campaign
                </button>
              )}
              {campaign.status === "active" && (
                <button
                  onClick={() => close.mutate()}
                  disabled={close.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <StopIcon className="h-3.5 w-3.5" /> Close campaign
                </button>
              )}
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete"
                aria-label="Delete campaign"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col xl:flex-row gap-6 xl:gap-6 items-start">
            <div className="flex-1 min-w-0">
              <ScoreBreakdown perHabit={aggregate.perHabit} respondentCount={aggregate.respondentCount} />
            </div>
            <div className="w-full xl:w-72 flex-shrink-0">
              <HighlightsCard aggregate={aggregate} />
            </div>
          </div>
        </div>
      </section>

      {/* Single-column below xl: (1280px) — on 13" laptops the right rail
          beside the table would crush both columns. From xl: up the rail
          becomes a sticky sidebar to the right of the long checklist. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,_1fr)_20rem] gap-4 sm:gap-5 items-start">
        <div className="space-y-4 sm:space-y-5 min-w-0">
          <ChecklistTable
            aggregate={aggregate}
            campaignId={campaign.id}
            campaignLabel={
              totalRounds > 1
                ? `${campaign.quarter} ${campaign.year} · Round ${round}`
                : `${campaign.quarter} ${campaign.year}`
            }
          />
        </div>
        <aside className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4 sm:gap-5 min-w-0 xl:sticky xl:top-4 xl:self-start">
          <TrendChart highlightId={campaign.id} />
          <ParticipationPanel campaignId={campaign.id} />
        </aside>
      </div>

      {showFillModal && (
        <MyResponseModal
          campaignId={campaign.id}
          campaignLabel={
            totalRounds > 1
              ? `${campaign.quarter} ${campaign.year} · Round ${round}`
              : `${campaign.quarter} ${campaign.year}`
          }
          onClose={() => setShowFillModal(false)}
          onSubmitted={() => setShowFillModal(false)}
        />
      )}
    </div>
  );
}

/**
 * Score breakdown: 10 columns, one per habit. Each column communicates
 * two dimensions of data at once:
 *
 *   1. A 4-dot strip at the top — one dot per sub-item, coloured by its
 *      agreement % (green/amber/red). Shows the texture of "where is the
 *      weakness inside this habit?"
 *   2. A solid bar below, height proportional to the habit's overall score
 *      (out of 4). Colour by the habit's RAG. Lets execs scan the worst
 *      habits by silhouette alone.
 *
 * The combined view scans like a small-multiples chart: the dots tell you
 * "is this habit uniformly strong/weak or is one sub-item dragging it down",
 * the bar tells you "how bad overall".
 */
function ScoreBreakdown({
  perHabit,
  respondentCount,
}: {
  perHabit: HabitAggregate[];
  respondentCount: number;
}) {
  const hasData = respondentCount > 0;
  return (
    <div className="w-full">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Score breakdown
        </h3>
        <span className="text-[10px] text-gray-400">per habit, max 4</span>
      </div>
      <div className="grid grid-cols-10 gap-1 sm:gap-1.5 items-end">
        {perHabit.map((h, idx) => (
          <BarColumn key={h.key} habit={h} idx={idx + 1} hasData={hasData} />
        ))}
      </div>
      {hasData && (
        <div className="mt-4 flex items-center justify-between gap-3 flex-wrap text-[10px] text-gray-500">
          <div className="flex items-center gap-3 flex-wrap">
            <LegendChip color="bg-green-500" label="3.0–4.0 Strong" />
            <LegendChip color="bg-amber-400" label="1.8–2.9 OK" />
            <LegendChip color="bg-red-400" label="< 1.8 Risk" />
          </div>
          <div className="inline-flex items-center gap-1.5">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            </span>
            <span>per statement</span>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function BarColumn({ habit, idx, hasData }: { habit: HabitAggregate; idx: number; hasData: boolean }) {
  const score = habit.pct * 4;
  const heightPct = hasData ? Math.max(8, (habit.pct) * 100) : 0;
  const habitTone = !hasData
    ? "from-gray-100 to-gray-100"
    : habit.pct >= 0.8
      ? "from-green-400 to-green-500"
      : habit.pct >= 0.5
        ? "from-amber-300 to-amber-400"
        : "from-red-300 to-red-400";
  const scoreColor = !hasData
    ? "text-gray-400"
    : habit.pct >= 0.8
      ? "text-green-700"
      : habit.pct >= 0.5
        ? "text-amber-700"
        : "text-red-600";

  return (
    <div className="flex flex-col items-center group">
      <div className="flex gap-0.5 mb-1.5 h-1.5">
        {habit.subItems.map((s) => {
          const dot = !hasData
            ? "bg-gray-200"
            : s.total === 0
              ? "bg-gray-200"
              : s.pct >= 0.8
                ? "bg-green-500"
                : s.pct >= 0.5
                  ? "bg-amber-400"
                  : "bg-red-400";
          return (
            <span
              key={s.index}
              className={`h-1.5 w-1.5 rounded-full ${dot}`}
              title={`${idx}.${s.index + 1}: ${s.total === 0 ? "no responses" : `${s.yes}/${s.total} (${Math.round(s.pct * 100)}%)`}`}
            />
          );
        })}
      </div>
      <div className="w-full h-28 sm:h-32 bg-gray-50 rounded-md flex items-end overflow-hidden">
        <div
          className={`w-full bg-gradient-to-t ${habitTone} rounded-md transition-[height] duration-500 ease-out group-hover:brightness-95`}
          style={{ height: `${heightPct}%` }}
          title={hasData ? `Habit ${idx}: ${score.toFixed(1)} of 4 (${Math.round(habit.pct * 100)}%)` : "no responses"}
        />
      </div>
      <div className={`text-xs font-bold tabular-nums mt-2 ${scoreColor}`}>
        {hasData ? score.toFixed(1) : "—"}
      </div>
      <div className="text-[10px] text-gray-400 tabular-nums">{idx}</div>
    </div>
  );
}

/**
 * Small meta strip rendered under the hero score. Surfaces respondent count
 * and the most relevant lifecycle date (deadline / closed-on) so the hero
 * column carries weight even when no action buttons are shown (closed state).
 *
 * The deadline is editable in place for draft + active campaigns (this view is
 * already admin-gated at the page level, and the PUT route re-checks). A closed
 * campaign's date is historical, so it stays read-only.
 */
function ScoreContext({
  status,
  statusLabel,
  deadlineLabel,
  respondents,
  campaignId,
  deadlineISO,
}: {
  status: "draft" | "active" | "closed";
  statusLabel: string;
  deadlineLabel: string | null;
  respondents: number;
  campaignId: string;
  deadlineISO: string | null;
}) {
  const canEditDeadline = status !== "closed";
  return (
    <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[11px] text-gray-500">
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-medium ${
          status === "active"
            ? "bg-green-50 border-green-200 text-green-700"
            : status === "draft"
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-blue-50 border-blue-200 text-blue-700"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            status === "active" ? "bg-green-500" : status === "draft" ? "bg-amber-500" : "bg-blue-500"
          }`}
        />
        {statusLabel}
      </span>
      <span className="tabular-nums">
        {respondents} {respondents === 1 ? "respondent" : "respondents"}
      </span>
      {canEditDeadline ? (
        <DeadlineEditor
          campaignId={campaignId}
          deadlineISO={deadlineISO}
          deadlineLabel={deadlineLabel}
        />
      ) : (
        deadlineLabel && <span className="text-gray-400">· Closed {deadlineLabel}</span>
      )}
    </div>
  );
}

const PAST_DEADLINE_LOCKED_MESSAGE =
  'Deadline can\'t be moved to a past date — "Add Past Week Data" is disabled. Enable it in Settings → Configurations.';

/**
 * Inline "Due <date>" with an edit affordance.
 *
 * Reading state shows the formatted date plus a pencil; editing swaps in a
 * native date picker with Save / Cancel. Saving an EMPTY value clears the
 * deadline (the API's `deadline` is nullable), which is the only way to remove
 * one once set.
 *
 * The API takes a full ISO datetime while `<input type="date">` yields
 * `YYYY-MM-DD`, so the value is widened on save and narrowed on load — the same
 * conversion LaunchAssessmentModal does when creating a campaign.
 *
 * Past dates are gated by the org's `add_past_week_data` config flag — the same
 * toggle KPI and Priority already honour for their past-week edits. When it's
 * off the picker's `min` is today, so a past deadline can't be chosen. The PUT
 * route re-checks, so this is UX, not the enforcement point.
 */
export function DeadlineEditor({
  campaignId,
  deadlineISO,
  deadlineLabel,
}: {
  campaignId: string;
  deadlineISO: string | null;
  deadlineLabel: string | null;
}) {
  const update = useUpdateHabitCampaign(campaignId);
  const { canAddPastWeek, loaded: flagsLoaded } = usePastWeekFlags();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => toDateInputValue(deadlineISO));

  // Only clamp once the flags have actually resolved — otherwise the default
  // `false` would briefly lock the picker for orgs that DO allow past dates.
  const minDate = flagsLoaded && !canAddPastWeek ? toDateInputValue(new Date().toISOString()) : undefined;

  function startEditing() {
    // Re-seed from the server value so a cancelled edit never leaks forward.
    setValue(toDateInputValue(deadlineISO));
    setEditing(true);
  }

  async function save() {
    // `min` on the input already blocks this via the picker, but a browser
    // that doesn't enforce `min` on typed/pasted input needs a real guard.
    if (pastDatesLocked && value && value < todayStr) {
      notify.error(new Error(PAST_DEADLINE_LOCKED_MESSAGE));
      return;
    }
    try {
      await update.mutateAsync({
        deadline: value ? new Date(value).toISOString() : null,
      });
      setEditing(false);
    } catch (err) {
      notify.error(err, {
        context: "deadline",
        fallback: "Couldn't update the deadline. Please try again.",
      });
    }
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 text-gray-400">
        {deadlineLabel ? <>· Due {deadlineLabel}</> : <>· No deadline</>}
        <button
          type="button"
          onClick={startEditing}
          title={deadlineLabel ? "Edit deadline" : "Set deadline"}
          aria-label={deadlineLabel ? "Edit deadline" : "Set deadline"}
          className="p-0.5 rounded hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-gray-400">·</span>
      <input
        type="date"
        autoFocus
        value={value}
        min={minDate}
        title={minDate ? "Past dates are disabled — enable “Add Past Week Data” in Settings → Configurations" : undefined}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          if (e.key === "Escape") setEditing(false);
        }}
        disabled={update.isPending}
        min={pastDatesLocked ? todayStr : undefined}
        title={pastDatesLocked ? PAST_DEADLINE_LOCKED_MESSAGE : undefined}
        aria-label="Deadline"
        className="px-1.5 py-0.5 text-[11px] border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent-400 disabled:bg-gray-50"
      />
      <button
        type="button"
        onClick={() => void save()}
        disabled={update.isPending}
        className="px-1.5 py-0.5 text-[10px] font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded disabled:opacity-50 transition-colors"
      >
        {update.isPending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={update.isPending}
        className="px-1.5 py-0.5 text-[10px] font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50 transition-colors"
      >
        Cancel
      </button>
    </span>
  );
}

/**
 * Compact insights panel that fills the empty space to the right of the
 * breakdown bars. Three quick reads:
 *   - Strongest habit (highest %)
 *   - Habit needing attention (lowest %)
 *   - RAG distribution count (how many of the 10 are strong / OK / risk)
 *
 * Hidden when there are no responses yet — without data these would all
 * collapse to the same habit which adds noise instead of insight.
 */
function HighlightsCard({ aggregate }: { aggregate: CampaignAggregate }) {
  const hasData = aggregate.respondentCount > 0;
  if (!hasData) return null;

  const sorted = [...aggregate.perHabit].sort((a, b) => b.pct - a.pct);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const strong = aggregate.perHabit.filter((h) => h.pct >= 0.8).length;
  const ok = aggregate.perHabit.filter((h) => h.pct >= 0.5 && h.pct < 0.8).length;
  const risk = aggregate.perHabit.filter((h) => h.pct < 0.5).length;

  return (
    <aside className="w-full xl:w-60 bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex-shrink-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-3">
        Highlights
      </h3>

      <div className="space-y-3">
        <HighlightRow
          icon={<TrendingUp className="h-3.5 w-3.5 text-green-600" />}
          iconBg="bg-green-50"
          label="Strongest"
          title={best.label}
          metric={`${(best.pct * 4).toFixed(1)} / 4`}
          metricClass="text-green-700"
        />
        <HighlightRow
          icon={<AlertTriangle className="h-3.5 w-3.5 text-red-600" />}
          iconBg="bg-red-50"
          label="Needs attention"
          title={worst.label}
          metric={`${(worst.pct * 4).toFixed(1)} / 4`}
          metricClass="text-red-700"
        />
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
          Distribution
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <DistCell value={strong} label="Strong" tone="green" />
          <DistCell value={ok} label="OK" tone="amber" />
          <DistCell value={risk} label="Risk" tone="red" />
        </div>
      </div>
    </aside>
  );
}

function HighlightRow({
  icon,
  iconBg,
  label,
  title,
  metric,
  metricClass,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  title: string;
  metric: string;
  metricClass: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={`h-7 w-7 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
        <p className="text-[12px] font-semibold text-gray-900 leading-tight mt-0.5 line-clamp-2">
          {title}
        </p>
        <p className={`text-[11px] font-bold tabular-nums mt-0.5 ${metricClass}`}>{metric}</p>
      </div>
    </div>
  );
}

function DistCell({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "green" | "amber" | "red";
}) {
  const palette = {
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  }[tone];
  return (
    <div className={`text-center rounded-md py-1.5 ${palette}`}>
      <p className="text-base font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[9px] uppercase tracking-wider mt-1 opacity-80">{label}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="px-4 sm:px-8 py-6 w-full space-y-4">
      <div className="h-40 bg-white border border-gray-200 rounded-2xl animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-4">
        <div className="h-96 bg-white border border-gray-200 rounded-2xl animate-pulse" />
        <div className="space-y-4">
          <div className="h-48 bg-white border border-gray-200 rounded-2xl animate-pulse" />
          <div className="h-48 bg-white border border-gray-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}
