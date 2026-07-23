"use client";

import { useState, useEffect } from "react";
import { useCreatePriorityMulti } from "@/lib/hooks/usePriority";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { fiscalYearLabel, ALL_QUARTERS, getFiscalYear, getWeekDateRange, weeksArray } from "@/lib/utils/fiscal";
import { useTeams } from "@/lib/hooks/useTeams";
import { validatePriorityForm } from "@/lib/utils/priorityFormValidation";
import { UserSelect, RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton, DropdownPicker } from "@quikit/ui";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { TeamSelect } from "./TeamSelect";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useQuarterStartDates } from "@/lib/hooks/useQuarterStartDates";
import { useCustomQuarterSettings, useWeeklyMeetingDay } from "@/lib/hooks/useFeatureFlags";
import { humanizeApiError } from "@/lib/utils/humanizeError";
import { notify } from "@/lib/utils/notify";
import { PRIORITY_DEFAULT_STATUS } from "@/lib/constants/status";

interface Props {
  defaultYear?: number;
  defaultQuarter?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CURRENT_YEAR = getFiscalYear();

export function PriorityModal({ defaultYear, defaultQuarter, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    // Multi-owner: the server fans out one Priority row per selected owner.
    ownerIds: [] as string[],
    teamId: "",
    quarter: defaultQuarter ?? "Q1",
    year: String(defaultYear ?? CURRENT_YEAR),
    startWeek: "1",
    endWeek: "13",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // DB-scoped fiscal years via shared hook
  const { years: fyYears } = useFiscalYears();
  const yearOptions = fyYears.length ? fyYears : [CURRENT_YEAR];
  const { getStartDate: getQuarterStartDate, getEndDate: getQuarterEndDate, getWeekCount } = useQuarterStartDates();
  // Weeks in the selected quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = getWeekCount(parseInt(form.year) || CURRENT_YEAR, form.quarter);
  const weekOptions = weeksArray(weekCount);
  // Custom Quarter Settings: when on, week-date hints run from the configured
  // weekly meeting day (Thu→Wed etc.), with the final week clamped to the
  // quarter end. `effectiveMeetingDay` is null when the toggle is off → the
  // hints render exactly as before (legacy calendar weeks).
  const customQuarterOn = useCustomQuarterSettings();
  const rawMeetingDay = useWeeklyMeetingDay();
  const effectiveMeetingDay = customQuarterOn ? rawMeetingDay : null;
  const weekHint = (w: number) =>
    getWeekDateRange(
      parseInt(form.year),
      form.quarter,
      w,
      getQuarterStartDate(parseInt(form.year), form.quarter),
      effectiveMeetingDay,
      getQuarterEndDate(parseInt(form.year), form.quarter),
    );

  // Default the End Week to the quarter's last week once the count resolves —
  // unless the user already narrowed it. Keeps a custom 14-week quarter from
  // defaulting to week 13.
  const [endWeekTouched, setEndWeekTouched] = useState(false);
  useEffect(() => {
    if (!endWeekTouched) {
      setForm(f => ({ ...f, endWeek: String(weekCount) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekCount]);

  // Owner dropdown filtering:
  //   - Team selected → fetch members of that team (API filters server-side).
  //   - No team → fetch all tenant users so the Owner picker is never empty.
  // When user changes team, we clear the selected owners (handled in
  // handleTeamChange) since they may not belong to the new team.
  // Owner picker — DB-level infinite (25/page) + server search, team-aware.
  // This modal is create-only (owners start empty), so no selected-owner seed
  // is needed; the picked owners are always in the loaded/seen set.
  const [ownerSearch, setOwnerSearch] = useState("");
  const {
    users,
    isLoading: ownersLoading,
    hasNextPage: ownersHasMore,
    isFetchingNextPage: ownersLoadingMore,
    fetchNextPage: fetchMoreOwners,
  } = useInfiniteUsers(form.teamId || undefined, ownerSearch);
  const { data: teams = [] } = useTeams();
  const createPriority = useCreatePriorityMulti();

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function setOwners(ids: string[]) {
    setForm(f => ({ ...f, ownerIds: ids }));
    setErrors(e => { const n = { ...e }; delete n.ownerIds; return n; });
  }

  // Start Week change auto-bumps End Week if it would become invalid (< startWeek).
  // Keeps the End Week dropdown selection in sync with its filtered options.
  function handleStartWeekChange(val: string) {
    setForm(f => {
      const sw = parseInt(val);
      const ew = parseInt(f.endWeek);
      const nextEnd = !isNaN(sw) && !isNaN(ew) && ew < sw ? val : f.endWeek;
      return { ...f, startWeek: val, endWeek: nextEnd };
    });
    setErrors(e => { const n = { ...e }; delete n.startWeek; delete n.endWeek; return n; });
  }

  // Custom handler for team changes — clears the selected owners since they may
  // not belong to the new team. Empty team = no filtering, keep the selection.
  function handleTeamChange(newTeamId: string) {
    setForm(f => {
      // If no team selected or nothing picked yet, just update team.
      if (!newTeamId || f.ownerIds.length === 0) return { ...f, teamId: newTeamId };
      // Owners may or may not be in the new team — we won't know until the next
      // useInfiniteUsers query resolves. Clear defensively; the user re-picks.
      return { ...f, teamId: newTeamId, ownerIds: [] };
    });
    setErrors(e => { const n = { ...e }; delete n.teamId; delete n.ownerIds; return n; });
  }

  async function handleSubmit() {
    const errs = validatePriorityForm({
      name: form.name,
      ownerIds: form.ownerIds,
      quarter: form.quarter,
      startWeek: form.startWeek,
      endWeek: form.endWeek,
    });
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const result = await createPriority.mutateAsync({
        name: form.name.trim(),
        description: form.description || undefined,
        ownerIds: form.ownerIds,
        teamId: form.teamId || undefined,
        quarter: form.quarter,
        year: parseInt(form.year),
        startWeek: parseInt(form.startWeek),
        endWeek: parseInt(form.endWeek),
        overallStatus: PRIORITY_DEFAULT_STATUS,
      });
      // Report the fan-out result: N created, and any skipped as duplicates.
      const { created, skipped } = result;
      if (skipped > 0) {
        notify.success(
          `Created ${created} ${created === 1 ? "priority" : "priorities"}`,
          { description: `${skipped} skipped — an identical priority already exists for that owner.` },
        );
      } else if (created > 1) {
        notify.success(`Created ${created} priorities`);
      } else {
        notify.saved("Priority", "created");
      }
      onSuccess();
    } catch (err: unknown) {
      setErrors({ _: humanizeApiError(err, { context: "Priority", fallback: "Couldn't save the Priority. Please try again." }) });
      notify.error(err, { context: "Priority", fallback: "Couldn't save the Priority. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <RightPanel
      open
      onClose={onClose}
      size="sm"
      title="Add New Priority"
      subtitle={`${fiscalYearLabel(parseInt(form.year))} · ${form.quarter}`}
      footer={
        // Column wrapper pins the server-error banner directly above the
        // Cancel/Create row. Matches the pattern used by every form drawer.
        <div className="flex flex-col gap-2 w-full">
          <FormErrorBanner message={errors._} />
          <RightPanelFooter>
            <RightPanelCancelButton onClick={onClose} />
            <RightPanelSubmitButton
              onClick={handleSubmit}
              saving={saving}
              icon="plus"
              label="Create Priority"
            />
          </RightPanelFooter>
        </div>
      }
    >
      <>
          {/* Row 1: Team | Priority Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Team</label>
              <TeamSelect value={form.teamId} onChange={handleTeamChange} teams={teams} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Priority Name <span className="text-red-500">*</span>
              </label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="Enter priority name…"
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${errors.name ? "border-red-400" : "border-gray-200"}`} />
              {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
            </div>
          </div>

          {/* Row 2: Start Week | Owner */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Start Week <span className="text-red-500">*</span>
              </label>
              <DropdownPicker
                value={String(form.startWeek)}
                onChange={handleStartWeekChange}
                options={weekOptions.map(w => ({
                  value: String(w),
                  label: `Week ${w}`,
                  hint: weekHint(w),
                }))}
                searchable
              />
              {errors.startWeek && <p className="text-[10px] text-red-500 mt-0.5">{errors.startWeek}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Owner <span className="text-red-500">*</span>
              </label>
              <UserSelect
                mode="multi"
                values={form.ownerIds}
                onChange={setOwners}
                users={users}
                placeholder="Select owner(s)…"
                onSearchChange={setOwnerSearch}
                onLoadMore={fetchMoreOwners}
                hasMore={ownersHasMore}
                loadingMore={ownersLoadingMore}
                loading={ownersLoading}
                error={!!errors.ownerIds}
              />
              {errors.ownerIds && <p className="text-[10px] text-red-500 mt-0.5">{errors.ownerIds}</p>}
            </div>
          </div>

          {/* Row 3: Quarter | End Week */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Quarter <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <DropdownPicker
                  value={String(form.year)}
                  onChange={(v) => set("year", v)}
                  options={yearOptions.map(y => ({ value: String(y), label: fiscalYearLabel(y) }))}
                />
                <DropdownPicker
                  value={form.quarter}
                  onChange={(v) => set("quarter", v)}
                  options={ALL_QUARTERS.map(q => ({ value: q, label: q }))}
                />
              </div>
              {errors.quarter && <p className="text-[10px] text-red-500 mt-0.5">{errors.quarter}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                End Week <span className="text-red-500">*</span>
              </label>
              <DropdownPicker
                value={String(form.endWeek)}
                onChange={(v) => { setEndWeekTouched(true); set("endWeek", v); }}
                options={weekOptions.filter(w => w >= (parseInt(form.startWeek) || 1)).map(w => ({
                  value: String(w),
                  label: `Week ${w}`,
                  hint: weekHint(w),
                }))}
                searchable
              />
              {errors.endWeek && <p className="text-[10px] text-red-500 mt-0.5">{errors.endWeek}</p>}
            </div>
          </div>

        {/* Row 4: Description */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)}
            rows={3} placeholder="Enter description…"
            className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
        </div>
      </>
    </RightPanel>
  );
}
