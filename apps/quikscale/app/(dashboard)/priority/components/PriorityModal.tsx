"use client";

import { useState, useEffect } from "react";
import { useCreatePriority } from "@/lib/hooks/usePriority";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { fiscalYearLabel, ALL_QUARTERS, getFiscalYear, getWeekDateRange, weeksArray } from "@/lib/utils/fiscal";
import { useTeams } from "@/lib/hooks/useTeams";
import { UserPicker, RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton, DropdownPicker } from "@quikit/ui";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { TeamSelect } from "./TeamSelect";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useQuarterStartDates } from "@/lib/hooks/useQuarterStartDates";
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
    owner: "",
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
  const { getStartDate: getQuarterStartDate, getWeekCount } = useQuarterStartDates();
  // Weeks in the selected quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = getWeekCount(parseInt(form.year) || CURRENT_YEAR, form.quarter);
  const weekOptions = weeksArray(weekCount);

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
  // When user changes team, we clear `form.owner` if they're not in the
  // new team's member list (handled in handleTeamChange).
  // Owner picker — DB-level infinite (25/page) + server search, team-aware.
  // This modal is create-only (owner starts empty), so no selected-owner seed
  // is needed; the picked owner is always in the loaded set.
  const [ownerSearch, setOwnerSearch] = useState("");
  const {
    users,
    isLoading: ownersLoading,
    hasNextPage: ownersHasMore,
    isFetchingNextPage: ownersLoadingMore,
    fetchNextPage: fetchMoreOwners,
  } = useInfiniteUsers(form.teamId || undefined, ownerSearch);
  const { data: teams = [] } = useTeams();
  const createPriority = useCreatePriority();

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
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

  // Custom handler for team changes — clears owner if the current owner
  // isn't in the new team's members. Empty team = no filtering, keep owner.
  function handleTeamChange(newTeamId: string) {
    setForm(f => {
      // If no team selected or owner is blank, just update team
      if (!newTeamId || !f.owner) return { ...f, teamId: newTeamId };
      // Owner may or may not be in the new team — we won't know until the
      // next useUsers query resolves. Clear defensively; user re-picks.
      return { ...f, teamId: newTeamId, owner: "" };
    });
    setErrors(e => { const n = { ...e }; delete n.teamId; delete n.owner; return n; });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Priority name is required";
    if (!form.owner) errs.owner = "Owner is required";
    if (!form.quarter) errs.quarter = "Quarter is required";
    if (!form.startWeek) errs.startWeek = "Start week is required";
    if (!form.endWeek) errs.endWeek = "End week is required";
    const sw = parseInt(form.startWeek);
    const ew = parseInt(form.endWeek);
    if (sw && ew && sw > ew) errs.endWeek = "End week must be >= start week";
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      await createPriority.mutateAsync({
        name: form.name.trim(),
        description: form.description || undefined,
        owner: form.owner,
        teamId: form.teamId || undefined,
        quarter: form.quarter,
        year: parseInt(form.year),
        startWeek: parseInt(form.startWeek),
        endWeek: parseInt(form.endWeek),
        overallStatus: PRIORITY_DEFAULT_STATUS,
      } as any);
      notify.saved("Priority", "created");
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
                  hint: getWeekDateRange(parseInt(form.year), form.quarter, w, getQuarterStartDate(parseInt(form.year), form.quarter)),
                }))}
                searchable
              />
              {errors.startWeek && <p className="text-[10px] text-red-500 mt-0.5">{errors.startWeek}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Owner <span className="text-red-500">*</span>
              </label>
              <UserPicker
                value={form.owner}
                onChange={v => set("owner", v)}
                users={users}
                onSearchChange={setOwnerSearch}
                onLoadMore={fetchMoreOwners}
                hasMore={ownersHasMore}
                loadingMore={ownersLoadingMore}
                loading={ownersLoading}
                error={!!errors.owner}
              />
              {errors.owner && <p className="text-[10px] text-red-500 mt-0.5">{errors.owner}</p>}
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
                  hint: getWeekDateRange(parseInt(form.year), form.quarter, w, getQuarterStartDate(parseInt(form.year), form.quarter)),
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
