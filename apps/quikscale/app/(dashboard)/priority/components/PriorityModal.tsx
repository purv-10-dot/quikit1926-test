"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useCreatePriority } from "@/lib/hooks/usePriority";
import { useUsers } from "@/lib/hooks/useUsers";
import { useQueryClient } from "@tanstack/react-query";
import { fiscalYearLabel, ALL_QUARTERS, getFiscalYear, getWeekDateRange } from "@/lib/utils/fiscal";
import { useTeams, type Team } from "@/lib/hooks/useTeams";
import { UserPicker, RightPanel, RightPanelFooter, RightPanelCancelButton, RightPanelSubmitButton, DropdownPicker } from "@quikit/ui";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useQuarterStartDates } from "@/lib/hooks/useQuarterStartDates";
import { humanizeApiError } from "@/lib/utils/humanizeError";

interface Props {
  defaultYear?: number;
  defaultQuarter?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CURRENT_YEAR = getFiscalYear();
const WEEK_OPTIONS = Array.from({ length: 13 }, (_, i) => i + 1);

// ── Team select with inline Add New ──────────────────────────────────────────

function TeamSelect({ value, onChange, teams }: { value: string; onChange: (id: string) => void; teams: Team[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    setAdding(false);
    setNewName("");
    setErr("");
  }, []);
  useClickOutside(ref, handleClose);

  useEffect(() => {
    if (adding) setTimeout(() => inputRef.current?.focus(), 50);
  }, [adding]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) { setErr("Team name is required"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Failed to create team");
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      onChange(data.data.id);
      setOpen(false);
      setAdding(false);
      setNewName("");
    } catch (e: unknown) {
      setErr(humanizeApiError(e, { context: "team", fallback: "Couldn't create the team. Please try again." }));
    } finally {
      setSaving(false);
    }
  }

  const selectedTeam = teams.find(t => t.id === value);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white text-left ${open ? "border-accent-400 ring-1 ring-accent-400" : "border-gray-200"}`}>
        <span className={selectedTeam ? "text-gray-800" : "text-gray-400"}>
          {selectedTeam ? selectedTeam.name : "No team"}
        </span>
        <svg className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 max-h-52 overflow-y-auto">
          {/* No team option */}
          <button type="button" onClick={() => { onChange(""); setOpen(false); }}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${value === "" ? "font-semibold text-gray-800" : "text-gray-500"}`}>
            No team
          </button>

          {/* Existing teams */}
          {teams.map(t => (
            <button key={t.id} type="button" onClick={() => { onChange(t.id); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center justify-between ${value === t.id ? "font-semibold text-gray-800" : "text-gray-700"}`}>
              {t.name}
              {value === t.id && (
                <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}

          {/* Divider + Add New */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            {!adding ? (
              <button type="button" onClick={() => setAdding(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-accent-600 hover:bg-accent-50 transition-colors flex items-center gap-1.5 font-medium">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add New Team
              </button>
            ) : (
              <div className="px-2 pb-2 pt-1 space-y-1.5">
                <input ref={inputRef} value={newName} onChange={e => { setNewName(e.target.value); setErr(""); }}
                  onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setAdding(false); setNewName(""); } }}
                  placeholder="Team name…"
                  className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400" />
                {err && <p className="text-[10px] text-red-500">{err}</p>}
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { setAdding(false); setNewName(""); setErr(""); }}
                    className="flex-1 py-1 text-xs border border-gray-200 rounded text-gray-500 hover:bg-gray-50 transition-colors">
                    Cancel
                  </button>
                  <button type="button" onClick={handleCreate} disabled={saving}
                    className="flex-1 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50 transition-colors font-medium">
                    {saving ? "..." : "Add"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
  const { getStartDate: getQuarterStartDate } = useQuarterStartDates();

  // Owner dropdown filtering:
  //   - Team selected → fetch members of that team (API filters server-side).
  //   - No team → fetch all tenant users so the Owner picker is never empty.
  // When user changes team, we clear `form.owner` if they're not in the
  // new team's member list (handled in handleTeamChange).
  const { data: users = [] } = useUsers(form.teamId || undefined);
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
        overallStatus: "not-started",
      } as any);
      onSuccess();
    } catch (err: unknown) {
      setErrors({ _: humanizeApiError(err, { context: "Priority", fallback: "Couldn't save the Priority. Please try again." }) });
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
        <RightPanelFooter>
          <RightPanelCancelButton onClick={onClose} />
          <RightPanelSubmitButton
            onClick={handleSubmit}
            saving={saving}
            icon="plus"
            label="Create Priority"
          />
        </RightPanelFooter>
      }
    >
      <>
        {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
              {errors._}
            </div>
          )}

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
                options={WEEK_OPTIONS.map(w => ({
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
              <UserPicker value={form.owner} onChange={v => set("owner", v)} users={users} error={!!errors.owner} />
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
                onChange={(v) => set("endWeek", v)}
                options={WEEK_OPTIONS.filter(w => w >= (parseInt(form.startWeek) || 1)).map(w => ({
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
