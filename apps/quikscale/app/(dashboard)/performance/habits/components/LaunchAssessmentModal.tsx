"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Lock, X } from "lucide-react";
import { useCreateHabitCampaign } from "@/lib/hooks/useHabits";
import { FilterPicker, userToFilterOption } from "@quikit/ui";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { useUserOptions } from "@/lib/hooks/useUserOption";
import { useTeams } from "@/lib/hooks/useTeams";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useQuarterStartDates } from "@/lib/hooks/useQuarterStartDates";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { toDateInputValue } from "@/lib/utils/dateUtils";
import { getFiscalQuarter, getFiscalYear } from "@/lib/utils/fiscal";
import {
  getQuarterPeriodStatus,
  isQuarterSelectable,
  formatQuarterDateRange,
  type QuarterPeriodStatus,
} from "@/lib/utils/habitQuarterPeriod";
import type { AdminCampaignRow } from "./types";

const ALL_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;
type QuarterKey = (typeof ALL_QUARTERS)[number];

// Fiscal calendar-month fallback labels for tenants that haven't configured
// Quarter Settings yet (Q1 = Apr per the app's April-based fiscal year), so
// the modal is never blank on a fresh org. Real ranges come from QuarterSetting.
const FALLBACK_RANGE: Record<QuarterKey, string> = {
  Q1: "Apr – Jun",
  Q2: "Jul – Sep",
  Q3: "Oct – Dec",
  Q4: "Jan – Mar",
};

interface Props {
  onClose: () => void;
  onCreated?: (id: string) => void;
  existingRows?: AdminCampaignRow[];
}

interface QuarterInfo {
  status: QuarterPeriodStatus | null;
  selectable: boolean;
  rangeLabel: string;
}

export function LaunchAssessmentModal({ onClose, onCreated, existingRows = [] }: Props) {
  const create = useCreateHabitCampaign();
  const { years: fiscalYears } = useFiscalYears();
  const { quarters: configuredQuarters, isLoading: quartersLoading } = useQuarterStartDates();
  const { canAddPastQuarterHabit, canAddPastWeek, loaded: pastWeekFlagsLoaded } = usePastWeekFlags();

  // Mirrors DeadlineEditor in AggregateView: when "Add Past Week Data" is
  // disabled, the deadline picker's `min` is today so a past deadline can't
  // be chosen. Only clamp once flags have resolved, else the default `false`
  // would briefly lock the picker for orgs that DO allow past dates.
  const deadlineMinDate =
    pastWeekFlagsLoaded && !canAddPastWeek ? toDateInputValue(new Date().toISOString()) : undefined;

  const fallbackYear = getFiscalYear();

  // Year dropdown options — configured fiscal years (source of truth), with a
  // calendar window fallback only while/if nothing is configured.
  const years = useMemo(
    () =>
      fiscalYears.length > 0
        ? [...fiscalYears].sort((a, b) => a - b)
        : Array.from({ length: 6 }, (_, i) => fallbackYear - 2 + i),
    [fiscalYears, fallbackYear],
  );

  // (year:quarter) → real configured start/end dates.
  const quarterByKey = useMemo(() => {
    const map = new Map<string, { startDate: string; endDate: string }>();
    for (const q of configuredQuarters) {
      map.set(`${q.fiscalYear}:${q.quarter}`, { startDate: q.startDate, endDate: q.endDate });
    }
    return map;
  }, [configuredQuarters]);

  const [year, setYear] = useState<number>(() => fallbackYear);
  const [quarter, setQuarter] = useState<QuarterKey | null>(() => getFiscalQuarter());
  const [deadline, setDeadline] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Team + Owner scope. Mirrors the Priority page: the owner list is every
  // member until a team is picked, after which it narrows to that team's
  // members (`useInfiniteUsers` does the filtering server-side).
  const [teamId, setTeamId] = useState<string>("");
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [ownerSearch, setOwnerSearch] = useState("");
  const { data: teams = [] } = useTeams();
  const {
    users: ownerUsers,
    isLoading: ownersLoading,
    hasNextPage: ownersHasMore,
    isFetchingNextPage: ownersLoadingMore,
    fetchNextPage: fetchMoreOwners,
  } = useInfiniteUsers(teamId || undefined, ownerSearch);
  const selectedOwnerOptions = useUserOptions(ownerIds);

  /**
   * Changing the team clears the owner selection — the previously picked
   * people may not belong to the new team, and silently keeping them would
   * notify users outside the chosen scope.
   */
  function handleTeamChange(next: string) {
    setTeamId(next);
    setOwnerIds([]);
  }

  const userTouched = useRef(false);
  const hydrated = useRef(false);

  // Classify a quarter for a given year from its configured dates. Unconfigured
  // quarters can't be classified → shown with the calendar fallback label and
  // left selectable (preserves behavior for fresh orgs).
  function periodFor(y: number, q: QuarterKey): QuarterInfo {
    const row = quarterByKey.get(`${y}:${q}`);
    if (!row) return { status: null, selectable: true, rangeLabel: FALLBACK_RANGE[q] };
    const status = getQuarterPeriodStatus(row.startDate, row.endDate);
    return {
      status,
      selectable: isQuarterSelectable({ status, canAddPastQuarter: canAddPastQuarterHabit }),
      rangeLabel: formatQuarterDateRange(row.startDate, row.endDate),
    };
  }

  // One-time default: once the configured quarters settle, jump to the quarter
  // that contains today; if today is outside every configured quarter, land on
  // the latest fiscal year's first selectable quarter. Never overrides a manual
  // pick, and leaves the calendar fallback untouched on a fresh org.
  useEffect(() => {
    if (hydrated.current || quartersLoading) return;
    hydrated.current = true;
    if (userTouched.current || configuredQuarters.length === 0) return;

    const today = new Date();
    const current = configuredQuarters.find(
      (q) => getQuarterPeriodStatus(q.startDate, q.endDate, today) === "current",
    );
    if (current) {
      setYear(current.fiscalYear);
      setQuarter(current.quarter as QuarterKey);
      return;
    }

    const latestYear = Math.max(...configuredQuarters.map((q) => q.fiscalYear));
    setYear(latestYear);
    setQuarter(ALL_QUARTERS.find((q) => periodFor(latestYear, q).selectable) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quartersLoading, configuredQuarters]);

  // Per-quarter round context ("1 round done" / "Open campaign" / "Not started")
  // from existing campaigns — unchanged semantics, layered under the period tag.
  const quarterStatus = useMemo(() => {
    const map: Record<string, { closed: number; open: number }> = {};
    for (const r of existingRows) {
      if (r.isLegacy || r.year !== year) continue;
      const entry = (map[r.quarter] ??= { closed: 0, open: 0 });
      if (r.status === "closed") entry.closed += 1;
      else entry.open += 1;
    }
    return map;
  }, [existingRows, year]);

  function handleYearChange(nextYear: number) {
    userTouched.current = true;
    setYear(nextYear);
    // Keep the current quarter if it's still selectable for the new year,
    // otherwise move to the first selectable one (or none).
    const stillOk = quarter ? periodFor(nextYear, quarter).selectable : false;
    if (!stillOk) {
      setQuarter(ALL_QUARTERS.find((q) => periodFor(nextYear, q).selectable) ?? null);
    }
  }

  function handleQuarterClick(q: QuarterKey) {
    if (!periodFor(year, q).selectable) return;
    userTouched.current = true;
    setQuarter(q);
  }

  const selectedInfo = quarter ? periodFor(year, quarter) : null;
  // Owners are mandatory — an assessment must name who is being asked to fill
  // it. The server enforces the same rule (launchCampaignSchema).
  const canCreate = !!quarter && !!selectedInfo?.selectable && ownerIds.length > 0;
  const noneSelectable = ALL_QUARTERS.every((q) => !periodFor(year, q).selectable);

  async function handleSave() {
    if (!quarter || !canCreate) return;
    setError(null);
    try {
      const result = (await create.mutateAsync({
        quarter,
        year,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
        notes: notes || null,
        teamId: teamId || null,
        // Empty = org-wide, which is what the API and participation panel
        // already treat as the default.
        participantUserIds: ownerIds,
      })) as { id: string };
      onCreated?.(result.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 sm:px-6 pt-5 pb-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900 tracking-tight">
              New Habits Assessment
            </h2>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
              Create a draft. Launch it (make it visible to members) any time after.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 sm:px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2.5">
              Quarter
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {ALL_QUARTERS.map((q) => {
                const info = periodFor(year, q);
                const stat = quarterStatus[q];
                const isSelected = quarter === q;
                const disabled = !info.selectable;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleQuarterClick(q)}
                    disabled={disabled}
                    aria-disabled={disabled}
                    title={disabled ? "This quarter has ended — enable 'Add Past Quarter Habit' in Settings to assess it." : undefined}
                    className={`relative text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? "border-accent-500 ring-1 ring-accent-200 bg-accent-50/40 shadow-sm"
                        : disabled
                        ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                        : "border-gray-200 hover:border-gray-300 bg-white"
                    }`}
                  >
                    <div className="absolute top-2 right-2">
                      {disabled ? (
                        <Lock className="h-3.5 w-3.5 text-gray-400" />
                      ) : (
                        <RadioDot selected={isSelected} />
                      )}
                    </div>
                    <div
                      className={`text-base font-bold tracking-tight ${
                        isSelected ? "text-accent-700" : "text-gray-900"
                      }`}
                    >
                      {q}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{info.rangeLabel}</div>
                    {info.status && (
                      <div className="mt-1">
                        <PeriodTag status={info.status} locked={disabled} />
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1 text-[10px]">
                      <QuarterStatusDot status={stat} />
                      <span className="text-gray-500">{quarterStatusLabel(stat)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {noneSelectable && (
              <p className="mt-2 text-[11px] text-amber-600 leading-relaxed">
                Every quarter in {year} has ended. Enable{" "}
                <span className="font-semibold">Add Past Quarter Habit</span> in Settings →
                Configurations to assess a past quarter.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Year
              </label>
              <select
                value={year}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400 tabular-nums"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Deadline <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <input
                type="date"
                value={deadline}
                min={deadlineMinDate}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
              />
            </div>
          </div>

          {/* Team + Owner scope. Leaving both empty keeps the assessment
              org-wide (every active member), which is the original behaviour. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Team <span className="text-gray-400 normal-case">(optional)</span>
              </label>
              <FilterPicker
                value={teamId}
                onChange={handleTeamChange}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                allLabel="All teams"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
                Owners <span className="text-red-500">*</span>
              </label>
              <FilterPicker
                multiple
                values={ownerIds}
                onChangeMultiple={setOwnerIds}
                options={ownerUsers.map(userToFilterOption)}
                selectedOptions={selectedOwnerOptions}
                onSearchChange={setOwnerSearch}
                onLoadMore={fetchMoreOwners}
                hasMore={ownersHasMore}
                loadingMore={ownersLoadingMore}
                loading={ownersLoading}
                allLabel="All people"
              />
            </div>
          </div>
          <p
            className={`-mt-2 text-[11px] ${ownerIds.length > 0 ? "text-gray-400" : "text-red-500"}`}
          >
            {ownerIds.length > 0
              ? `${ownerIds.length} ${ownerIds.length === 1 ? "person" : "people"} will be asked to fill this assessment and notified by email.`
              : "Select at least one owner — they'll be asked to fill this assessment and notified by email."}
          </p>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
              Notes for members <span className="text-gray-400 normal-case">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g. Please fill before Tuesday's leadership meeting."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 sm:px-6 py-3 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={create.isPending || !canCreate}
            className="px-4 py-2 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {create.isPending ? "Creating…" : "Create draft"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={`h-3.5 w-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
        selected ? "border-accent-600" : "border-gray-300"
      }`}
    >
      {selected && <span className="h-1.5 w-1.5 rounded-full bg-accent-600" />}
    </span>
  );
}

function PeriodTag({ status, locked }: { status: QuarterPeriodStatus; locked: boolean }) {
  if (status === "current") {
    return (
      <span className="text-[9px] font-semibold uppercase tracking-wide text-green-600">Current</span>
    );
  }
  if (status === "future") {
    return (
      <span className="text-[9px] font-semibold uppercase tracking-wide text-blue-600">Upcoming</span>
    );
  }
  return (
    <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
      {locked ? "Past · locked" : "Past"}
    </span>
  );
}

function QuarterStatusDot({ status }: { status?: { closed: number; open: number } }) {
  if (!status) return <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />;
  if (status.open > 0) return <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />;
}

function quarterStatusLabel(status?: { closed: number; open: number }): string {
  if (!status) return "Not started";
  if (status.open > 0) return status.open === 1 ? "Open campaign" : `${status.open} open`;
  return status.closed === 1 ? "1 round done" : `${status.closed} rounds done`;
}
