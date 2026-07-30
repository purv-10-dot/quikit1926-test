"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCreateKPI, useUpdateKPI } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import { useCanEditKPI } from "@/lib/hooks/useCanEditKPI";
import { humanizeApiError } from "@/lib/utils/humanizeError";
import { notify } from "@/lib/utils/notify";
import type { KPIRow as KPI } from "@/lib/types/kpi";
import type { User } from "@/lib/types/kpi";
import { fiscalYearLabel, MEASUREMENT_UNITS, KPI_TYPES, ALL_QUARTERS, weeksArray, weekDateLabel } from "@/lib/utils/fiscal";
import { CURRENCIES, getScales, getMultiplier, formatActual, shortScaleLabel, scaleDownForDisplay, scaleUpFromInput } from "@/lib/utils/currency";
import { UnitSelect } from "./UnitSelect";
import { QuarterField } from "./QuarterField";
import { UserPicker, UserMultiPicker, RightPanel, RightPanelFooter, DropdownPicker } from "@quikit/ui";
import { FormErrorBanner } from "@/components/forms/FormErrorBanner";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { useCurrentWeek, useWeekLabels, useQuarterWeekCount, useQuarterPosition } from "@/lib/hooks/useCurrentWeek";
import { isWeekInPast } from "@/lib/utils/weekLock";
import { Lock, ChevronDown } from "lucide-react";
import {
  buildBreakdown,
  buildOwnerBreakdown,
  redistributeOwnerRemainder,
  distributeContributionsEven,
  applyWeeklyEdit,
  sumBreakdown,
  checkBreakdownBalance,
  isTargetValueLocked,
  isStandaloneCellEditable,
  TARGET_LOCK_TIP,
  type DivisionType,
} from "./kpiModalHelpers";
import { WeeklyScroller } from "./WeeklyScroller";

interface Props {
  mode: "create" | "edit";
  kpi?: KPI;
  /** "individual" (default) shows the owner picker; "team" hides it and requires teamId. */
  scope?: "individual" | "team";
  /** Required when scope === "team" and mode === "create". */
  teamId?: string;
  defaultYear?: number;
  defaultQuarter?: string;
  /** Optional hex tint for success/error toasts (e.g. the team's color in Teams KPI). */
  tint?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();

/* ── Component ─────────────────────────────────────────────────────────── */

export function KPIModal({ mode, kpi, scope, teamId, defaultYear, defaultQuarter, tint, onClose, onSuccess }: Props) {
  // Determine whether this modal instance operates in team-level scope.
  // Priority: explicit `scope` prop > existing kpi.kpiLevel (in edit mode) > default "individual"
  const isTeamScope = scope === "team" || kpi?.kpiLevel === "team";

  // Edit permission (edit mode only). Create is always allowed.
  const canEditItem = useCanEditKPI(kpi);
  const readOnly = mode === "edit" && !canEditItem;

  const [form, setForm] = useState(() => {
    const measurementUnit = kpi?.measurementUnit ?? "Number";
    const currency = kpi?.currency ?? "USD";
    const savedScale = (measurementUnit === "Currency" ? kpi?.targetScale : null) ?? "";
    const multiplier = measurementUnit === "Currency" ? getMultiplier(currency, savedScale) : 1;
    const storedTarget = kpi?.target ?? 0;
    const displayTarget = multiplier > 1 ? storedTarget / multiplier : storedTarget;
    const divisionType = (kpi?.divisionType as "Cumulative" | "Standalone") ?? "Cumulative";

    // Restore saved weekly targets or build fresh. Restore maps over the saved
    // keys directly so a custom quarter's full week set (>13) is preserved; the
    // fresh path defaults to 13 and the weekCount effect rebuilds it once the
    // quarter's real week count resolves.
    const savedWeeklyTargets = kpi?.weeklyTargets as Record<string, number> | null | undefined;
    const weeklyBreakdown: Record<number, string> = savedWeeklyTargets
      ? Object.fromEntries(Object.keys(savedWeeklyTargets).map(k => [Number(k), String(savedWeeklyTargets[k] ?? "")]))
      : buildBreakdown(divisionType, storedTarget, measurementUnit);

    // Restore saved per-owner weekly targets (team KPI only).
    // Stored shape: { userId: { "1": value, "2": value, ... } }
    const savedOwnerTargets = kpi?.weeklyOwnerTargets as Record<string, Record<string, number>> | null | undefined;
    const weeklyOwnerBreakdown: Record<string, Record<number, string>> = {};
    if (savedOwnerTargets) {
      for (const [ownerId, weekMap] of Object.entries(savedOwnerTargets)) {
        weeklyOwnerBreakdown[ownerId] = Object.fromEntries(
          Object.keys(weekMap).map(k => [Number(k), String(weekMap[k] ?? "")])
        ) as Record<number, string>;
      }
    }

    return {
      name: kpi?.name ?? "",
      description: kpi?.description ?? "",
      owner: kpi?.owner ?? "",
      // Team KPI multi-owner state
      ownerIds: (kpi?.ownerIds ?? []) as string[],
      // Contributions stored as string (for live editing) — parsed to number on save
      ownerContributions: Object.fromEntries(
        Object.entries((kpi?.ownerContributions ?? {}) as Record<string, number>).map(
          ([id, pct]) => [id, String(pct)]
        )
      ) as Record<string, string>,
      // Per-owner Individual KPI name override. Empty → child uses team's name.
      ownerKpiNames: {} as Record<string, string>,
      weeklyOwnerBreakdown,
      teamId: kpi?.teamId ?? teamId ?? "",
      quarter: kpi?.quarter ?? defaultQuarter ?? "Q1",
      year: String(kpi?.year ?? defaultYear ?? CURRENT_YEAR),
      measurementUnit,
      // Show the saved target — including exactly 0 (a valid zero goal). Only a
      // fresh create (no kpi) or a genuinely unset target starts blank. A bare
      // `> 0` check here blanked the edit form for zero-target KPIs.
      target: kpi?.target != null ? String(displayTarget) : "",
      status: kpi?.status ?? "active",
      currency,
      targetScale: savedScale,
      // Unit label (Number KPIs only) from Unit Master; "" = none.
      unit: kpi?.unit ?? "",
      // Scaled-display toggle: default ON for a Currency KPI that has a scale
      // (so breakdown/Updates/Stats + grid/cards all read in the unit), else OFF.
      scaledDisplay: kpi?.scaledDisplay ?? (measurementUnit === "Currency" && !!savedScale),
      divisionType,
      reverseColor: kpi?.reverseColor ?? false,
      frequency: (kpi?.frequency as "daily" | "weekly" | "monthly" | "yearly" | undefined) ?? "weekly",
      kpiType: (kpi?.kpiType as "NA" | "Leading" | "Lagging" | undefined) ?? "NA",
      weeklyBreakdown,
    };
  });

  // Team scope: owners are members of the selected team (bounded list) — keep
  // load-all. Individual scope: owner is picked from ALL org users, so use a
  // DB-level infinite picker (25/page + server search) instead of loading the
  // whole org. The single-owner picker (non-team) consumes `infiniteOwners`;
  // the team multi-select + contribution rows consume the bounded `teamMembers`.
  const { data: teamMembers = [] } = useUsers(isTeamScope ? (form.teamId || undefined) : undefined);
  const [ownerSearch, setOwnerSearch] = useState("");
  const infiniteOwners = useInfiniteUsers(undefined, ownerSearch);
  const users = isTeamScope ? teamMembers : infiniteOwners.users;
  // Seed the current owner so the (edit-mode, disabled) picker shows their name
  // even when they're not in the first loaded page.
  const ownerSeed = useMemo(
    () =>
      kpi?.owner_user
        ? [{
            id: kpi.owner_user.id,
            firstName: kpi.owner_user.firstName,
            lastName: kpi.owner_user.lastName,
            email: (kpi.owner_user as { email?: string }).email ?? "",
          }]
        : [],
    [kpi?.owner_user],
  );
  const { data: teams = [] } = useTeams();
  const currentTeam = teams.find(t => t.id === form.teamId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // While a breakdown cell is focused we show the user's raw keystrokes instead
  // of the reformatted/derived value. Reformatting to toFixed(2) on every
  // keystroke made multi-digit entry impossible (e.g. "22" snapped back to
  // "2.00" because the caret landed after the ".00"). The change handlers still
  // run live (clamp + redistribution + final formatting) — this is display-only.
  const [editingCell, setEditingCell] = useState<{ key: string; raw: string } | null>(null);

  // Team picker dropdown state (create mode, team scope)
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const teamPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (teamPickerRef.current && !teamPickerRef.current.contains(e.target as Node)) {
        setTeamPickerOpen(false);
        setTeamSearch("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Owner contribution + per-owner breakdown helpers ──
  // Pure formulas live in `./kpiModalHelpers`; this component owns only the
  // state-mutating functions that call them.

  function setOwnerIds(ids: string[]) {
    setForm(f => {
      // Auto-distribute contributions equally whenever the owner list changes.
      // In edit mode the modal's initial state reads kpi.ownerContributions directly
      // without calling this setter, so existing saved contributions are preserved on open.
      const newContribs = distributeContributionsEven(ids);
      const next = { ...f, ownerIds: ids, ownerContributions: newContribs };
      next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
    setErrors(e => { const n = { ...e }; delete n.ownerIds; delete n.ownerContributions; return n; });
  }

  /** Fill in per-owner cells for any owners who don't yet have a breakdown. */
  function seedMissingOwnerBreakdowns() {
    setForm(f => {
      const newBreakdown = { ...f.weeklyOwnerBreakdown };
      const tNum = (() => {
        const n = parseFloat(f.target) || 0;
        if (f.measurementUnit !== "Currency") return n;
        return n * getMultiplier(f.currency, f.targetScale);
      })();
      for (const id of f.ownerIds) {
        const existing = newBreakdown[id];
        if (!existing || Object.keys(existing).length === 0) {
          const pct = parseFloat(f.ownerContributions[id]) || 0;
          newBreakdown[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek, weekCount);
        }
      }
      return { ...f, weeklyOwnerBreakdown: newBreakdown };
    });
  }

  /** Recompute all per-owner cells from scratch (destructive — overrides manual edits). */
  function resetOwnerBreakdownsFromFormula() {
    setForm(f => {
      const newBreakdown: Record<string, Record<number, string>> = {};
      const tNum = (() => {
        const n = parseFloat(f.target) || 0;
        if (f.measurementUnit !== "Currency") return n;
        return n * getMultiplier(f.currency, f.targetScale);
      })();
      for (const id of f.ownerIds) {
        const pct = parseFloat(f.ownerContributions[id]) || 0;
        newBreakdown[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek, weekCount);
      }
      return { ...f, weeklyOwnerBreakdown: newBreakdown };
    });
  }

  /**
   * Edit a single (ownerId, week) cell. In Cumulative mode this redistributes the owner's
   * remaining sub-target across their later weeks — only this owner's row is affected;
   * other owners are untouched. In Standalone mode just updates that cell.
   */
  function setOwnerWeekCell(ownerId: string, weekNumber: number, rawVal: string) {
    setForm(f => {
      const totalTargetNum = actualNum(f);
      const pct = parseFloat(f.ownerContributions[ownerId]) || 0;
      const ownerSubTarget = totalTargetNum * (pct / 100);
      const isWhole = f.measurementUnit === "Number";
      const existingRow = f.weeklyOwnerBreakdown[ownerId] ?? {};

      // Clamp: no negatives, and cannot exceed remaining owner budget
      // No upper clamp — an over-sub-target entry stays as typed so the
      // breakdown-balance indicator can WARN; redistribution still zeroes the
      // later weeks (remaining goes to 0) and the sum surfaces as "over".
      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;

      const val = rawVal === "" ? "" : (isWhole ? String(Math.round(parsed)) : parsed.toFixed(2));
      let ownerRow = { ...existingRow, [weekNumber]: val };

      if (f.divisionType === "Cumulative") {
        ownerRow = redistributeOwnerRemainder(ownerRow, weekNumber, ownerSubTarget, f.measurementUnit, weekCount);
      }

      return {
        ...f,
        weeklyOwnerBreakdown: { ...f.weeklyOwnerBreakdown, [ownerId]: ownerRow },
      };
    });
  }

  /**
   * Edit the total row for a week. The new total is split across owners by their
   * contribution %. Each owner then redistributes their remaining sub-target across
   * their own later weeks (Cumulative). Per-owner sub-targets are preserved.
   * In Standalone mode each owner's single cell is set and no redistribution happens.
   */
  function setTeamTotalWeekCell(weekNumber: number, rawVal: string) {
    setForm(f => {
      const totalTargetNum = actualNum(f);
      const isWhole = f.measurementUnit === "Number";

      // No upper clamp — an over-target total stays as typed so the balance
      // indicator can WARN; per-owner redistribution handles the rest.
      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;

      const totalNum = parsed;
      const newOwnerBreakdown: Record<string, Record<number, string>> = { ...f.weeklyOwnerBreakdown };

      for (const id of f.ownerIds) {
        const pct = parseFloat(f.ownerContributions[id]) || 0;
        const ownerCellVal = totalNum * (pct / 100);
        const formattedVal = isWhole ? String(Math.round(ownerCellVal)) : ownerCellVal.toFixed(2);
        let ownerRow = { ...(newOwnerBreakdown[id] ?? {}), [weekNumber]: formattedVal };

        if (f.divisionType === "Cumulative") {
          const ownerSubTarget = totalTargetNum * (pct / 100);
          ownerRow = redistributeOwnerRemainder(ownerRow, weekNumber, ownerSubTarget, f.measurementUnit, weekCount);
        }

        newOwnerBreakdown[id] = ownerRow;
      }

      return { ...f, weeklyOwnerBreakdown: newOwnerBreakdown };
    });
  }

  /**
   * Compute the full per-owner breakdown from a given form state. Used inline by
   * setters that change target/contribution/division/unit/currency/scale so that
   * the total row and per-owner rows auto-update like Individual KPI does.
   */
  function computeAllOwnerBreakdowns(f: {
    ownerIds: string[];
    ownerContributions: Record<string, string>;
    target: string;
    measurementUnit: string;
    currency: string;
    targetScale: string;
    divisionType: "Cumulative" | "Standalone";
  }): Record<string, Record<number, string>> {
    const tNum = f.measurementUnit === "Currency"
      ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
      : parseFloat(f.target) || 0;
    const out: Record<string, Record<number, string>> = {};
    for (const id of f.ownerIds) {
      const pct = parseFloat(f.ownerContributions[id]) || 0;
      // Re-derive each owner row from formula: past = 0, distribute owner
      // sub-target across [firstEditableWeek..13] with residue on Week 13.
      out[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek, weekCount);
    }
    return out;
  }

  function setContribution(id: string, val: string) {
    setForm(f => {
      const newContribs = { ...f.ownerContributions, [id]: val };
      // Re-seed per-owner breakdown with the new contribution mix (like setTarget does for individual)
      const newOwnerBreakdown = computeAllOwnerBreakdowns({
        ownerIds: f.ownerIds,
        ownerContributions: newContribs,
        target: f.target,
        measurementUnit: f.measurementUnit,
        currency: f.currency,
        targetScale: f.targetScale,
        divisionType: f.divisionType,
      });
      return { ...f, ownerContributions: newContribs, weeklyOwnerBreakdown: newOwnerBreakdown };
    });
    setErrors(e => { const n = { ...e }; delete n.ownerContributions; return n; });
  }

  function distributeContributionsEvenly() {
    setForm(f => {
      if (f.ownerIds.length === 0) return f;
      const newContribs = distributeContributionsEven(f.ownerIds);
      const newOwnerBreakdown = computeAllOwnerBreakdowns({
        ownerIds: f.ownerIds,
        ownerContributions: newContribs,
        target: f.target,
        measurementUnit: f.measurementUnit,
        currency: f.currency,
        targetScale: f.targetScale,
        divisionType: f.divisionType,
      });
      return { ...f, ownerContributions: newContribs, weeklyOwnerBreakdown: newOwnerBreakdown };
    });
  }

  const contributionSum = Object.values(form.ownerContributions).reduce(
    (s, v) => s + (parseFloat(v) || 0), 0
  );
  const contributionSumValid = Math.abs(contributionSum - 100) <= 0.5 && form.ownerIds.length > 0;

  // On mount (edit mode with existing KPI), seed any owners that have empty breakdown rows.
  // The setters (setTarget/setContribution/setOwnerIds/etc.) already re-seed on any relevant
  // change, so this effect is only needed to catch the initial state where an edited KPI
  // has owners but no weeklyOwnerTargets yet (legacy data).
  useEffect(() => {
    if (!isTeamScope || form.ownerIds.length === 0) return;
    const needsSeed = form.ownerIds.some(
      id => !form.weeklyOwnerBreakdown[id] || Object.keys(form.weeklyOwnerBreakdown[id]).length === 0
    );
    if (needsSeed) seedMissingOwnerBreakdowns();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Past-week feature flags
  const { canAddPastWeek, loaded: flagsLoaded } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(parseInt(form.year) || null, form.quarter);
  // Quarter/year position so a fully-past quarter treats ALL its weeks as past
  // (the clamped `currentWeek` mis-reads a past quarter's last week as current).
  const createQuarterPos = useQuarterPosition(parseInt(form.year) || null, form.quarter);
  const isWeekPast = (w: number): boolean => isWeekInPast(createQuarterPos ?? "current", w, currentWeek);
  const weekLabels = useWeekLabels(parseInt(form.year) || null, form.quarter);
  // Weeks in the selected quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = useQuarterWeekCount(parseInt(form.year) || null, form.quarter);
  // The Target Breakdown (weekly *targets*) is gated by "Add Past Week Data"
  // (canAddPastWeek) in BOTH create and edit modes. "Edit Past Week Data"
  // governs only the weekly *values* on the LogModal Updates tab, not targets.
  // Only evaluate after flags have loaded — before that, default is false anyway.
  const pastWeekAllowed = flagsLoaded && canAddPastWeek;
  // Editing the Target Value redistributes the weekly Target Breakdown across
  // ALL weeks (including past ones). When "Add Past Week Data" is off, those
  // past-week cells are locked — so the target itself is locked in edit mode to
  // avoid silently rewriting locked cells. Create mode is always editable.
  // Shared with LogModal's EditTab via `isTargetValueLocked`.
  const targetLocked = isTargetValueLocked({ isEditMode: mode === "edit", flagsLoaded, canAddPastWeek });

  /** Resolve display-target → actual stored number (handles Currency scale multiplier). */
  function actualNum(f: typeof form): number {
    const base = parseFloat(f.target) || 0;
    if (f.measurementUnit !== "Currency") return base;
    return base * getMultiplier(f.currency, f.targetScale);
  }

  // First editable week for target distribution — blocked weeks get 0.
  // Distribution always starts at the current week, even when the past-week
  // data flag is enabled (the flag controls *editability* of past cells, not
  // default distribution). Standalone mode ignores this — every week gets the
  // full target.
  // Exception: in past-week mode, a fully-PAST selected quarter has every week
  // open for retroactive planning, so distribute across all weeks (week 1)
  // instead of dumping the whole target on the clamped last week.
  const firstEditableWeek = (pastWeekAllowed && createQuarterPos === "past")
    ? 1
    : ((currentWeek !== null && currentWeek > 1) ? currentWeek : 1);

  // When firstEditableWeek resolves (async from API), recalculate the breakdown.
  //  - Create mode: always re-derive so blocked weeks get 0 and editable weeks share the target.
  //  - Edit mode: only re-derive for Standalone, where the past=0 / current..13=target invariant
  //    must hold regardless of what was saved under older logic. Cumulative edit mode keeps the
  //    saved DB breakdown (per-week target plan) untouched.
  const firstEditableWeekResolved = useRef(false);
  useEffect(() => {
    if (firstEditableWeekResolved.current || firstEditableWeek <= 1) return;
    firstEditableWeekResolved.current = true;
    setForm(f => {
      const allowRebuild = mode === "create" || f.divisionType === "Standalone";
      if (!allowRebuild) return f;
      const tNum = f.measurementUnit === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      if (tNum <= 0) return f;
      const next = {
        ...f,
        weeklyBreakdown: buildBreakdown(f.divisionType, tNum, f.measurementUnit, firstEditableWeek, weekCount),
      };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEditableWeek]);

  // Custom Quarter Settings: when the quarter's week count resolves to a
  // non-default value, rebuild the breakdown so the grid has the right number
  // of cells. Create mode + Standalone only (Cumulative edit keeps the saved
  // per-week plan; its saved targets already match its quarter's week count).
  const weekCountResolved = useRef(false);
  useEffect(() => {
    if (weekCountResolved.current || weekCount === 13) return;
    weekCountResolved.current = true;
    setForm(f => {
      const allowRebuild = mode === "create" || f.divisionType === "Standalone";
      if (!allowRebuild) return f;
      const tNum = f.measurementUnit === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      if (tNum <= 0) return f;
      const next = {
        ...f,
        weeklyBreakdown: buildBreakdown(f.divisionType, tNum, f.measurementUnit, firstEditableWeek, weekCount),
      };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekCount]);

  // Quarter change (past-week mode only). Rebuilding the weekly breakdown for
  // the NEW quarter can't happen synchronously here — the derived
  // `firstEditableWeek` + `weekCount` for the new quarter resolve async from the
  // quarter-settings cache — so we flag the switch and let the effect below
  // rebuild once they settle. See the effect keyed on [form.quarter, …].
  const quarterTouchedRef = useRef(false);
  useEffect(() => {
    if (!quarterTouchedRef.current) return;
    setForm(f => {
      const tNum = f.measurementUnit === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      if (tNum <= 0) return f;
      const next = {
        ...f,
        weeklyBreakdown: buildBreakdown(f.divisionType, tNum, f.measurementUnit, firstEditableWeek, weekCount),
      };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.quarter, firstEditableWeek, weekCount]);

  const createKPI = useCreateKPI();
  const updateKPI = useUpdateKPI(kpi?.id ?? "");

  /* ── Field helpers ── */

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  /** Change the KPI's quarter (only reachable when "Add Past Week Data" is on). */
  function setQuarter(q: string) {
    quarterTouchedRef.current = true;
    setForm(f => ({ ...f, quarter: q }));
    setErrors(e => { const n = { ...e }; delete n.quarter; return n; });
  }

  function setMeasurementUnit(val: string) {
    setForm(f => {
      const n = val === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      const next = { ...f, measurementUnit: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, val, firstEditableWeek, weekCount) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setCurrency(val: string) {
    setForm(f => {
      const validScale = getScales(val).find(s => s.label === f.targetScale) ? f.targetScale : "";
      const n = (parseFloat(f.target) || 0) * getMultiplier(val, validScale);
      const next = { ...f, currency: val, targetScale: validScale, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek, weekCount) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setTargetScale(val: string) {
    setForm(f => {
      const n = (parseFloat(f.target) || 0) * getMultiplier(f.currency, val);
      const next = { ...f, targetScale: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek, weekCount) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setDivisionType(dt: "Cumulative" | "Standalone") {
    setForm(f => {
      const next = { ...f, divisionType: dt, weeklyBreakdown: buildBreakdown(dt, actualNum(f), f.measurementUnit, firstEditableWeek, weekCount) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setTarget(val: string) {
    setForm(f => {
      const n = f.measurementUnit === "Currency"
        ? (parseFloat(val) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(val) || 0;
      // Editing the target re-derives the WHOLE breakdown:
      // past weeks (1..firstEditableWeek-1) → 0, target distributes across
      // [firstEditableWeek..13] with residue on Week 13. Applies in both
      // create and edit forms — the previous distribution (which may have
      // populated past weeks under older logic) is overwritten.
      const next = {
        ...f,
        target: val,
        weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek, weekCount),
      };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setWeekBreakdown(w: number, rawVal: string) {
    // `actualNum` applies the currency scale. clampToTarget=false → an
    // over-target entry stays as typed so the balance indicator can WARN
    // instead of silently capping it (the OPSP export keeps the default clamp).
    setForm(f => ({
      ...f,
      weeklyBreakdown: applyWeeklyEdit(f.weeklyBreakdown, w, rawVal, actualNum(f), f.measurementUnit, f.divisionType, weekCount, false),
    }));
  }

  function validate() {
    const errs: Record<string, string> = {};

    // Required-field gates (apply to both Individual and Team KPI). Surfaced
    // inline as red asterisks + per-field error text so users never round-trip
    // to the server for missing-field errors.
    if (!form.name.trim()) errs.name = "Please enter a KPI name.";
    if (!form.quarter) errs.quarter = "Please select a quarter.";
    if (!form.frequency) errs.frequency = "Please choose a frequency.";

    const targetNum = parseFloat(form.target);
    // Target is required but may be 0 (e.g. a "zero defects" KPI). Only empty,
    // non-numeric, or negative values are rejected. The whole breakdown/calc
    // stack (buildBreakdown, checkBreakdownBalance, colorLogic) already treats
    // target ≤ 0 safely, so 0 flows through without special-casing here.
    if (form.target === "" || isNaN(targetNum) || targetNum < 0) {
      errs.target = "Please enter a target value of 0 or greater.";
    }
    if (!form.divisionType) errs.divisionType = "Please choose a division type.";
    if (form.reverseColor === undefined || form.reverseColor === null) {
      errs.reverseColor = "Please choose a color-coding direction.";
    }

    if (isTeamScope) {
      if (!form.teamId) errs.teamId = "Please select a team.";
      if (form.ownerIds.length === 0) errs.ownerIds = "Please pick at least one owner for this Team KPI.";
      if (form.ownerIds.length > 0) {
        const sum = Object.values(form.ownerContributions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        if (Math.abs(sum - 100) > 0.5) {
          errs.ownerContributions = `Contributions must sum to 100% (currently ${sum.toFixed(1)}%).`;
        }
        for (const id of form.ownerIds) {
          const v = parseFloat(form.ownerContributions[id]);
          if (isNaN(v) || v < 0) {
            errs.ownerContributions = "Each owner must have a valid contribution %.";
            break;
          }
        }
      }
    } else {
      if (!form.owner) errs.owner = "Please select an owner for this KPI.";
    }

    // Cumulative: the weekly breakdown must total the target exactly. `balance`
    // is null for Standalone (exempt) and computed against the raw target.
    if (balance && balance.status !== "balanced") {
      const unit = breakdownUnit ? ` ${breakdownUnit}` : "";
      const dispSum = toDisp(String(balance.sum));
      const dispTgt = toDisp(String(scaledTarget));
      const dispDiff = toDisp(String(Math.abs(balance.remaining)));
      errs._ = balance.status === "under"
        ? `Weekly targets total ${dispSum}${unit} — ${dispDiff}${unit} short of the ${dispTgt}${unit} target. Adjust the weekly cells so they add up to the target.`
        : `Weekly targets total ${dispSum}${unit} — ${dispDiff}${unit} over the ${dispTgt}${unit} target. Reduce the weekly cells so they add up to the target.`;
    }
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const isCurr = form.measurementUnit === "Currency";
      const multiplier = isCurr ? getMultiplier(form.currency, form.targetScale) : 1;
      const targetNum = form.target ? (parseFloat(form.target) || 0) * multiplier : undefined;
      // Parse ownerContributions from string map to number map
      const parsedContribs: Record<string, number> = {};
      if (isTeamScope) {
        for (const id of form.ownerIds) {
          parsedContribs[id] = parseFloat(form.ownerContributions[id]) || 0;
        }
      }

      const payload = {
        name: form.name.trim(),
        description: form.description || undefined,
        kpiLevel: isTeamScope ? ("team" as const) : ("individual" as const),
        owner: isTeamScope ? null : form.owner,
        ownerIds: isTeamScope ? form.ownerIds : undefined,
        ownerContributions: isTeamScope ? parsedContribs : undefined,
        teamId: form.teamId || undefined,
        quarter: form.quarter as "Q1" | "Q2" | "Q3" | "Q4",
        year: parseInt(form.year),
        measurementUnit: form.measurementUnit as "Number" | "Percentage" | "Currency",
        target: targetNum,
        quarterlyGoal: targetNum,
        qtdGoal: targetNum,
        status: form.status as "active" | "paused" | "completed",
        divisionType: form.divisionType,
        currency: isCurr ? form.currency : null,
        targetScale: isCurr ? form.targetScale : null,
        // Unit label only applies to Number KPIs.
        unit: form.measurementUnit === "Number" ? (form.unit || null) : null,
        // Only meaningful for a Currency KPI with a scale; force false otherwise.
        scaledDisplay: isCurr && !!form.targetScale ? form.scaledDisplay : false,
        reverseColor: form.reverseColor,
        frequency: form.frequency,
        kpiType: form.kpiType as "NA" | "Leading" | "Lagging",
        // In team scope: derive weeklyTargets (total per week) as the live sum of per-owner cells.
        // In individual scope: use the editable weeklyBreakdown as-is.
        weeklyTargets: isTeamScope && form.ownerIds.length > 0
          ? Object.fromEntries(
              weeksArray(weekCount).map(w => {
                const sum = form.ownerIds.reduce(
                  (s, id) => s + (parseFloat(form.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0),
                  0
                );
                return [String(w), sum];
              })
            )
          : Object.fromEntries(
              weeksArray(weekCount).map(w => [String(w), parseFloat(form.weeklyBreakdown[w]) || 0])
            ),
        // Per-owner weekly targets — only for team scope
        weeklyOwnerTargets: isTeamScope && form.ownerIds.length > 0
          ? Object.fromEntries(
              form.ownerIds.map(id => [
                id,
                Object.fromEntries(
                  weeksArray(weekCount).map(w => [String(w), parseFloat(form.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0])
                ),
              ])
            )
          : undefined,
        // Per-owner Individual KPI name overrides — only owners with a non-empty
        // entry are sent. Server falls back to the Team KPI's name for the rest.
        ownerKpiNames: (() => {
          if (!isTeamScope || form.ownerIds.length === 0) return undefined;
          const out: Record<string, string> = {};
          for (const id of form.ownerIds) {
            const v = (form.ownerKpiNames[id] ?? "").trim();
            if (v.length > 0) out[id] = v;
          }
          return Object.keys(out).length > 0 ? out : undefined;
        })(),
      };
      if (mode === "create") {
        await createKPI.mutateAsync(payload);
      } else {
        // Strip immutable fields on edit — owner, measurementUnit, currency cannot change.
        // ownerIds + ownerContributions remain editable for team KPIs. Quarter (and its
        // year) are immutable UNLESS "Add Past Week Data" is on, in which case the user
        // could pick a different quarter via the dropdown, so we send them through.
        const { quarter, year, measurementUnit: _mu, currency: _c, owner: _o, ...rest } = payload;
        const editPayload = pastWeekAllowed ? { ...rest, quarter, year } : rest;
        await updateKPI.mutateAsync(editPayload);
      }
      notify.saved(isTeamScope ? "Team KPI" : "Individual KPI", mode === "create" ? "created" : "updated", { tint });
      onSuccess();
    } catch (err: unknown) {
      const message = humanizeApiError(err, { context: "KPI", fallback: "Couldn't save the KPI. Please try again." });
      setErrors({ _: message });
      notify.error(err, { context: "KPI", fallback: "Couldn't save the KPI. Please try again.", tint });
    } finally {
      setSaving(false);
    }
  }

  /* ── Derived ── */
  const isCurrency = form.measurementUnit === "Currency";
  const currencyObj = CURRENCIES.find(c => c.code === form.currency) ?? CURRENCIES[0];
  const scales = getScales(form.currency);
  const scaledTarget = isCurrency
    ? (parseFloat(form.target) || 0) * getMultiplier(form.currency, form.targetScale)
    : parseFloat(form.target) || 0;

  // Show the weekly Target-Breakdown grid whenever a VALID non-negative target
  // is entered — including exactly 0 (a zero goal spreads 0 across every week).
  // Still hidden while the field is empty/invalid so a fresh form stays clean.
  const targetEntered = form.target.trim() !== "" && !isNaN(parseFloat(form.target));
  const showBreakdown = targetEntered && scaledTarget >= 0;

  // Scaled-display: when the toggle is on for a Currency KPI with a scale, the
  // weekly breakdown cells SHOW + ACCEPT values in the scale unit (e.g. Cr)
  // while `form.weeklyBreakdown` stays RAW. Passthrough when off / no scale.
  const breakdownScaleMult = isCurrency && form.scaledDisplay ? getMultiplier(form.currency, form.targetScale) : 1;
  const toDisp = (raw: number | string) =>
    breakdownScaleMult > 1
      ? scaleDownForDisplay(raw, form.currency, form.targetScale)
      : (typeof raw === "string" ? raw : String(raw));
  const toRaw = (input: string) =>
    breakdownScaleMult > 1 ? scaleUpFromInput(input, form.currency, form.targetScale) : input;
  // Number KPI unit-of-measure (from Unit Master, e.g. "lb"). Shown as a plain
  // suffix — Number values are NOT scaled, so no prefix / no value conversion.
  const numberUnit = form.measurementUnit === "Number" ? (form.unit || "") : "";
  // Cell suffix: currency scale unit when scaled, else the Number unit.
  const breakdownUnit = breakdownScaleMult > 1 ? shortScaleLabel(form.targetScale) : numberUnit;
  // Currency symbol prefix shown on each scaled breakdown cell (₹2, $9, …).
  // Currency-scaled only — Number unit cells carry no prefix.
  const breakdownPrefix = breakdownScaleMult > 1 ? currencyObj.symbol : "";
  // Scaled currency cells hold small numbers (e.g. "100") but a wide unit suffix
  // ("100 Cr"), so shrink the INPUT to leave room. Number cells keep full width
  // (raw values can be large) — gate on the currency scale, not the suffix.
  const cellMinW = breakdownScaleMult > 1 ? "min-w-[48px]" : "min-w-[72px]";
  // Full raw rupee value behind a SCALED currency cell, en-IN formatted (tooltip).
  const rawTip = (raw: number | string): string | undefined => {
    if (breakdownScaleMult <= 1) return undefined;
    const n = typeof raw === "string" ? parseFloat(raw) : raw;
    if (!Number.isFinite(n)) return undefined;
    return `= ${formatActual(n, currencyObj.symbol, form.currency)}`;
  };

  // ── Breakdown balance (Cumulative only) ──
  // The weekly cells must sum to the target. Team scope sums every owner cell;
  // individual sums the single breakdown row. Standalone is exempt (each week
  // carries the full target). Drives the live "Remaining" indicator + submit gate.
  const breakdownSum = isTeamScope && form.ownerIds.length > 0
    ? form.ownerIds.reduce(
        (s, id) => s + sumBreakdown(form.weeklyOwnerBreakdown[id] ?? {}),
        0,
      )
    : sumBreakdown(form.weeklyBreakdown);
  const balance = form.divisionType === "Cumulative"
    ? checkBreakdownBalance(breakdownSum, scaledTarget)
    : null;

  const panelTitle =
    mode === "create"
      ? isTeamScope
        ? "Add Team KPI"
        : "Add New KPI"
      : isTeamScope
        ? "Edit Team KPI"
        : "Edit KPI";
  const panelSubtitle = `${fiscalYearLabel(parseInt(form.year))} · ${form.quarter}`;
  const submitLabel =
    mode === "create"
      ? isTeamScope
        ? "Create Team KPI"
        : "Create KPI"
      : "Save Changes";

  return (
    <RightPanel
      open
      onClose={onClose}
      size={isTeamScope ? "lg" : "sm"}
      title={panelTitle}
      subtitle={panelSubtitle}
      footer={
        // Column wrapper pins the server-error banner directly above the
        // Cancel/Create buttons so it's visible without scrolling — long forms
        // had users missing the old top-of-body banner.
        <div className="flex flex-col gap-2 w-full">
          <FormErrorBanner message={errors._} />
          <RightPanelFooter>
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || readOnly}
              title={readOnly ? "Only the creator, assignee, team head, or an admin can edit this KPI" : undefined}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving && (
                <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {submitLabel}
            </button>
          </RightPanelFooter>
        </div>
      }
    >
          {readOnly && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
              Read-only — only the creator, assignee, team head, or an admin can edit this KPI.
            </div>
          )}

          {/* KPI Name + Team/Owner */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                KPI Name <span className="text-red-500">*</span>
              </label>
              <input value={form.name} onChange={e => set("name", e.target.value)}
                placeholder="Enter KPI name…"
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${errors.name ? "border-red-400" : "border-gray-200"}`} />
              {errors.name && <p className="text-[10px] text-red-500 mt-0.5">{errors.name}</p>}
            </div>
            {isTeamScope ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Team <span className="text-red-500">*</span>
                </label>
                {mode === "edit" ? (
                  /* Read-only on edit */
                  <div className="flex items-center gap-2 px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50">
                    {currentTeam?.color && (
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentTeam.color }} />
                    )}
                    <span className="text-gray-700 font-medium truncate">
                      {currentTeam?.name ?? "—"}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400 flex-shrink-0">Team KPI</span>
                  </div>
                ) : (
                  /* Searchable single-select dropdown on create */
                  <div ref={teamPickerRef} className="relative">
                    <button
                      type="button"
                      onClick={() => { setTeamPickerOpen(o => !o); setTeamSearch(""); }}
                      className={`w-full flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-xs bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-accent-400 ${
                        errors.teamId ? "border-red-400" : "border-gray-200"
                      }`}
                    >
                      {currentTeam ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentTeam.color || "#0066cc" }} />
                          <span className="text-gray-700 font-medium truncate">{currentTeam.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">Select a team…</span>
                      )}
                      <ChevronDown className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${teamPickerOpen ? "rotate-180" : ""}`} />
                    </button>

                    {teamPickerOpen && (
                      <div className="absolute top-full left-0 mt-1 z-[250] bg-white border border-gray-200 rounded-xl shadow-lg w-full min-w-[240px]">
                        <div className="p-2 border-b border-gray-100">
                          <input
                            autoFocus
                            value={teamSearch}
                            onChange={e => setTeamSearch(e.target.value)}
                            placeholder="Search…"
                            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                          />
                        </div>
                        <div className="max-h-60 overflow-y-auto py-1">
                          {(() => {
                            const filtered = teamSearch.trim()
                              ? teams.filter(t => t.name.toLowerCase().includes(teamSearch.toLowerCase()))
                              : teams;
                            if (filtered.length === 0) {
                              return <p className="px-3 py-3 text-xs text-gray-400 text-center">No teams match.</p>;
                            }
                            return filtered.sort((a, b) => a.name.localeCompare(b.name)).map(t => {
                              const isSelected = t.id === form.teamId;
                              return (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => {
                                    setForm(f => ({ ...f, teamId: t.id, ownerIds: [], ownerContributions: {} }));
                                    setTeamPickerOpen(false);
                                    setTeamSearch("");
                                  }}
                                  className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors ${isSelected ? "bg-accent-50" : ""}`}
                                >
                                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color || "#0066cc" }} />
                                  <span className={`text-xs font-medium truncate ${isSelected ? "text-accent-700" : "text-gray-800"}`}>{t.name}</span>
                                </button>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {errors.teamId && <p className="text-[10px] text-red-500 mt-0.5">{errors.teamId}</p>}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Owner <span className="text-red-500">*</span>
                </label>
                <UserPicker
                  value={form.owner}
                  onChange={v => set("owner", v)}
                  users={users}
                  selectedUsers={ownerSeed}
                  onSearchChange={setOwnerSearch}
                  onLoadMore={infiniteOwners.fetchNextPage}
                  hasMore={infiniteOwners.hasNextPage}
                  loadingMore={infiniteOwners.isFetchingNextPage}
                  loading={infiniteOwners.isLoading}
                  error={!!errors.owner}
                  disabled={mode === "edit"}
                />
                {errors.owner && <p className="text-[10px] text-red-500 mt-0.5">{errors.owner}</p>}
              </div>
            )}
          </div>

          {/* Team KPI: Select KPI Owners (multi-select).
              The Contribution % per Owner block is rendered below, AFTER the Target Value field. */}
          {isTeamScope && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                KPI Owner <span className="text-red-500">*</span>
              </label>
              <UserMultiPicker
                values={form.ownerIds}
                onChange={setOwnerIds}
                users={users}
                placeholder={form.teamId ? "Select team members who own this KPI…" : "Select a team first"}
                error={!!errors.ownerIds}
              />
              {errors.ownerIds && <p className="text-[10px] text-red-500 mt-0.5">{errors.ownerIds}</p>}
              {!errors.ownerIds && form.ownerIds.length === 0 && (
                <p className="text-[10px] text-gray-400 mt-0.5">Only active members of this team can be selected.</p>
              )}
            </div>
          )}

          {/* Quarter (editable dropdown when "Add Past Week Data" is on) + Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <QuarterField
                year={parseInt(form.year)}
                quarter={form.quarter}
                editable={pastWeekAllowed}
                onChange={setQuarter}
                error={errors.quarter}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Frequency <span className="text-red-500">*</span>
              </label>
              <DropdownPicker
                value={form.frequency}
                onChange={(v) => set("frequency", v)}
                options={[
                  { value: "daily",   label: "Daily"   },
                  { value: "weekly",  label: "Weekly"  },
                  { value: "monthly", label: "Monthly" },
                  { value: "yearly",  label: "Yearly"  },
                ]}
              />
              {errors.frequency && <p className="text-[10px] text-red-500 mt-0.5">{errors.frequency}</p>}
            </div>
          </div>

          {/* Measurement Unit + Currency */}
          <div className={`grid gap-3 ${isCurrency ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Measurement Unit <span className="text-red-500">*</span>
              </label>
              <DropdownPicker
                value={form.measurementUnit}
                onChange={(v) => setMeasurementUnit(v)}
                options={MEASUREMENT_UNITS.map(u => ({ value: u, label: u }))}
                disabled={mode === "edit"}
              />
            </div>
            {isCurrency && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <DropdownPicker
                  value={form.currency}
                  onChange={(v) => setCurrency(v)}
                  options={CURRENCIES.map(c => ({
                    value: c.code,
                    label: `${c.symbol} ${c.code} — ${c.name}`,
                  }))}
                  searchable
                  disabled={mode === "edit"}
                />
              </div>
            )}
          </div>

          {/* KPI Type — Leading (predictive input) vs Lagging (outcome); NA = unset. */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                KPI Type
              </label>
              <DropdownPicker
                value={form.kpiType}
                onChange={(v) => set("kpiType", v)}
                options={KPI_TYPES.map(t => ({ value: t, label: t }))}
              />
              {errors.kpiType && <p className="text-[10px] text-red-500 mt-0.5">{errors.kpiType}</p>}
            </div>
          </div>

          {/* Target Value */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Target Value <span className="text-red-500">*</span>
            </label>
            <div className={`flex rounded-lg border overflow-hidden focus-within:ring-1 focus-within:ring-accent-400 focus-within:border-accent-400 ${errors.target ? "border-red-300" : "border-gray-200"} ${targetLocked ? "bg-gray-50" : ""}`}>
              {isCurrency && (
                <span className="flex items-center px-2.5 bg-gray-50 border-r border-gray-200 text-xs text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                  {currencyObj.symbol}
                </span>
              )}
              <input type="number" min="0" value={form.target} onChange={e => setTarget(e.target.value)}
                readOnly={readOnly || targetLocked}
                title={targetLocked ? TARGET_LOCK_TIP : undefined}
                placeholder="0"
                className={`flex-1 px-3 py-2 text-xs focus:outline-none min-w-0 ${targetLocked ? "bg-gray-50 text-gray-500 cursor-not-allowed" : "bg-white"}`} />
              {isCurrency && (
                <select value={form.targetScale} onChange={e => setTargetScale(e.target.value)}
                  disabled={readOnly || targetLocked}
                  className={`border-l border-gray-200 pl-2 pr-1 py-2 text-xs focus:outline-none text-gray-600 flex-shrink-0 ${targetLocked ? "bg-gray-50 cursor-not-allowed" : "bg-white cursor-pointer"}`}>
                  {scales.map(s => (
                    <option key={s.label} value={s.label}>{s.label || "—"}</option>
                  ))}
                </select>
              )}
              {/* Number KPIs: unit-of-measurement dropdown (from Unit Master). */}
              {form.measurementUnit === "Number" && (
                <UnitSelect value={form.unit} onChange={v => set("unit", v)} disabled={readOnly || targetLocked} />
              )}
            </div>
            {targetLocked && (
              <p className="text-[10px] text-amber-600 mt-0.5">{TARGET_LOCK_TIP}</p>
            )}
            {errors.target && <p className="text-[10px] text-red-500 mt-0.5">{errors.target}</p>}
            {isCurrency && form.targetScale && scaledTarget > 0 && (
              <p className="text-[10px] text-gray-400 mt-1">
                = {formatActual(scaledTarget, currencyObj.symbol, form.currency)}
              </p>
            )}
          </div>

          {/* Contribution % per Owner — only in team scope with owners selected.
              Positioned right after Target Value so users can see the value being divided. */}
          {isTeamScope && form.ownerIds.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-600">
                  Contribution % per Owner <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={distributeContributionsEvenly}
                  className="text-[10px] text-accent-500 hover:text-accent-700 hover:underline font-medium"
                >
                  Distribute evenly
                </button>
              </div>
              <div className={`border rounded-lg divide-y overflow-hidden ${errors.ownerContributions ? "border-red-300" : "border-gray-200"}`}>
                {form.ownerIds.map(id => {
                  const u = users.find(u => u.id === id);
                  if (!u) return null;
                  const pctStr = form.ownerContributions[id] ?? "";
                  const pct = parseFloat(pctStr) || 0;
                  const contributionValue = scaledTarget * (pct / 100);
                  const nameOverride = form.ownerKpiNames[id] ?? "";
                  return (
                    <div key={id} className="flex flex-col gap-1.5 px-3 py-2 bg-white hover:bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-gray-700 flex-1 truncate">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-[10px] text-gray-400 whitespace-nowrap">
                          Contribution value: <span className="text-gray-600 font-medium">
                            {scaledTarget > 0
                              ? (form.measurementUnit === "Number" ? Math.round(contributionValue) : contributionValue.toFixed(2))
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={pctStr}
                            onChange={e => setContribution(id, e.target.value)}
                            placeholder="0"
                            className="w-16 px-2 py-1 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400"
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </div>
                      </div>
                      {/* Per-owner Individual KPI name override. Empty → child KPI uses Team KPI name. */}
                      <div className="flex items-center gap-2 pl-0">
                        <label className="text-[10px] text-gray-400 whitespace-nowrap">Individual KPI name</label>
                        <input
                          type="text"
                          value={nameOverride}
                          onChange={e => setForm(f => ({
                            ...f,
                            ownerKpiNames: { ...f.ownerKpiNames, [id]: e.target.value },
                          }))}
                          placeholder={form.name || "Defaults to Team KPI name"}
                          className="flex-1 px-2 py-1 text-[11px] border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white"
                        />
                      </div>
                    </div>
                  );
                })}
                {/* Sum indicator */}
                <div className={`flex items-center justify-between px-3 py-1.5 text-[10px] font-medium ${
                  contributionSumValid ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                }`}>
                  <span>Total</span>
                  <span>
                    {contributionSum.toFixed(1)}% {contributionSumValid ? "✓" : `(must equal 100%)`}
                  </span>
                </div>
              </div>
              {errors.ownerContributions && <p className="text-[10px] text-red-500 mt-0.5">{errors.ownerContributions}</p>}
            </div>
          )}

          {/* Division Type + scaled-display toggle share one row. */}
          <div className="flex flex-wrap gap-6 items-start">
          {/* Division Type — Status field removed per product spec; the form
              still preserves the existing KPI status on edit (and defaults to
              "active" on create) via the form state, but the UI no longer
              exposes it. */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Division Type <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
              {(["Cumulative", "Standalone"] as const).map(dt => (
                <button key={dt} type="button" onClick={() => setDivisionType(dt)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    form.divisionType === dt ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}>
                  {dt}
                </button>
              ))}
            </div>
            {errors.divisionType && <p className="text-[10px] text-red-500 mt-0.5">{errors.divisionType}</p>}
            <p className="text-[10px] text-gray-400 mt-1">
              {form.divisionType === "Cumulative" ? `Target split equally across ${weekCount} weeks` : "Each week carries the full target value"}
            </p>
          </div>

          {/* Scaled display toggle — only for a Currency KPI with a chosen scale.
              When ON, the weekly breakdown, Updates, Stats, list + cards show and
              accept values in the scale unit (e.g. ₹ Cr); stored values stay RAW. */}
          {form.measurementUnit === "Currency" && !!form.targetScale && (
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-600 mb-1">Show values in {form.targetScale}</label>
              <button
                type="button"
                role="switch"
                aria-checked={form.scaledDisplay}
                onClick={() => setForm(f => ({ ...f, scaledDisplay: !f.scaledDisplay }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.scaledDisplay ? "bg-accent-600" : "bg-gray-300"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.scaledDisplay ? "translate-x-6" : "translate-x-1"}`} />
              </button>
              <p className="text-[10px] text-gray-400 mt-1">
                {form.scaledDisplay
                  ? `Weekly breakdown, Updates & Stats show in ${shortScaleLabel(form.targetScale)} (${currencyObj.symbol} ${form.targetScale}). Stored values stay exact.`
                  : `Off — full numbers (e.g. ${currencyObj.symbol}25,000,000).`}
              </p>
            </div>
          )}
          </div>

          {/* Color Coding Mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Color Coding <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg w-fit">
              <button type="button" onClick={() => setForm(f => ({ ...f, reverseColor: false }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  !form.reverseColor ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                Higher is Better
              </button>
              <button type="button" onClick={() => setForm(f => ({ ...f, reverseColor: true }))}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  form.reverseColor ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}>
                Lower is Better
              </button>
            </div>
            {errors.reverseColor && <p className="text-[10px] text-red-500 mt-0.5">{errors.reverseColor}</p>}
            <p className="text-[10px] text-gray-400 mt-1">
              {form.reverseColor
                ? "Reverse mode — use for defects, delays, errors (lower values = better performance)"
                : "Forward mode — use for sales, revenue, customers (higher values = better performance)"}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value)}
              rows={3} placeholder="Enter description…"
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none" />
          </div>

          {/* Target Breakdown (editable weekly) */}
          {showBreakdown && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">
                Target Breakdown (Weekly)
                {breakdownScaleMult > 1
                  ? ` — in ${currencyObj.symbol} ${breakdownUnit}`
                  : breakdownUnit ? ` — in ${breakdownUnit}` : ""}
                {breakdownScaleMult > 1 && (
                  <span className="ml-2 font-normal text-gray-400">
                    = {formatActual(scaledTarget, currencyObj.symbol, form.currency)} total
                  </span>
                )}
              </label>
              <WeeklyScroller>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {/* Label column header for team scope — aligns with the sticky label TDs below */}
                      {isTeamScope && form.ownerIds.length > 0 && (
                        <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 border-r border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left min-w-[140px]">
                          &nbsp;
                        </th>
                      )}
                      {weeksArray(weekCount).map(w => {
                        const isPast = isWeekPast(w) && !pastWeekAllowed;
                        return (
                        <th key={w} className={`px-2 py-1.5 text-center font-medium border-r border-gray-200 last:border-r-0 whitespace-nowrap ${isPast ? "text-gray-300" : "text-gray-500"}`}>
                          <div className="flex items-center justify-center gap-1">
                            {isPast && <Lock className="h-2.5 w-2.5 text-gray-300" />}
                            Week {w}
                          </div>
                          <div className="text-[9px] font-normal text-gray-400">{weekLabels[w - 1] ?? weekDateLabel(parseInt(form.year), form.quarter, w)}</div>
                        </th>
                      );})}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Total row.
                        - Individual scope: editable (bound to form.weeklyBreakdown), redistribution logic applies.
                        - Team scope: derived as sum of per-owner cells, read-only display. */}
                    <tr>
                      {isTeamScope && form.ownerIds.length > 0 && (
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 border-r border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          Total
                        </td>
                      )}
                      {weeksArray(weekCount).map(w => {
                        const isPast = isWeekPast(w) && !pastWeekAllowed;
                        const isStandalone = form.divisionType === "Standalone";
                        const isLocked = isStandalone || isPast;

                        // Team scope: editable total cell. Displays the live sum of owner cells
                        // for this week. When the user edits, the new total is distributed across
                        // owners proportionally by contribution %.
                        if (isTeamScope && form.ownerIds.length > 0) {
                          const sum = form.ownerIds.reduce((s, id) => {
                            const v = parseFloat(form.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0;
                            return s + v;
                          }, 0);
                          const displaySum = form.measurementUnit === "Number"
                            ? Math.round(sum).toString()
                            : sum.toFixed(2);
                          return (
                            <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0 bg-gray-50">
                              <div className="flex items-center gap-0.5">
                                {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                                <input
                                  type="number"
                                  min="0"
                                  value={editingCell?.key === `tot-${w}` ? editingCell.raw : toDisp(displaySum)}
                                  onChange={e => { setEditingCell({ key: `tot-${w}`, raw: e.target.value }); setTeamTotalWeekCell(w, toRaw(e.target.value)); }}
                                  onBlur={() => setEditingCell(null)}
                                  readOnly={isLocked}
                                  title={isPast
                                    ? "Past week data entry is disabled. Enable in Settings > Configurations."
                                    : "Editing the total redistributes across owners by contribution %"}
                                  className={`w-full px-1 py-1 text-center text-xs font-semibold border rounded focus:outline-none ${cellMinW} ${
                                    isLocked
                                      ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                      : "border-gray-200 bg-white text-gray-800 focus:ring-1 focus:ring-accent-400"
                                  }`}
                                />
                                {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                              </div>
                            </td>
                          );
                        }

                        // Individual scope — Standalone division. Current & future
                        // weeks are ALWAYS an editable <select> 0/target; past weeks
                        // become editable only when "Add Past Week Data" is ON (else
                        // they stay locked). See isStandaloneCellEditable.
                        if (isStandaloneCellEditable(form.divisionType, isWeekPast(w), pastWeekAllowed)) {
                          const isNumUnit = form.measurementUnit === "Number";
                          // Use properly-formatted strings that match what buildBreakdown stores
                          const zeroStr = isNumUnit ? "0" : "0.00";
                          const targetStr = scaledTarget > 0
                            ? (isNumUnit ? String(Math.round(scaledTarget)) : scaledTarget.toFixed(2))
                            : "";
                          const current = form.weeklyBreakdown[w] ?? "";
                          const currentNum = parseFloat(current) || 0;
                          // Normalize to one of the two canonical values (zero / target)
                          const norm = (currentNum === 0 || current === "") ? zeroStr
                            : (targetStr && Math.abs(currentNum - scaledTarget) < 0.001) ? targetStr
                            : current;
                          return (
                            <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                              <div className="flex items-center gap-0.5">
                                {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                                <select
                                  value={norm}
                                  onChange={e => setWeekBreakdown(w, e.target.value)}
                                  title={rawTip(form.weeklyBreakdown[w] ?? "")}
                                  className={`w-full px-1 py-1 text-center text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${cellMinW} cursor-pointer`}
                                >
                                  <option value={zeroStr}>0</option>
                                  <option value={targetStr}>{targetStr ? toDisp(targetStr) : "—"}</option>
                                  {norm !== zeroStr && norm !== "" && norm !== targetStr && (
                                    <option value={norm}>{toDisp(norm)} (custom)</option>
                                  )}
                                </select>
                                {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                            <div className="flex items-center gap-0.5">
                              {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                              <input
                                type="number"
                                min="0"
                                value={editingCell?.key === `ind-${w}` ? editingCell.raw : toDisp(form.weeklyBreakdown[w] ?? "")}
                                onChange={e => { setEditingCell({ key: `ind-${w}`, raw: e.target.value }); setWeekBreakdown(w, toRaw(e.target.value)); }}
                                onBlur={() => setEditingCell(null)}
                                readOnly={isLocked}
                                title={isPast ? "Past week data entry is disabled. Enable in Settings > Configurations." : rawTip(form.weeklyBreakdown[w] ?? "")}
                                className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none ${cellMinW} ${
                                  isLocked
                                    ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                    : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                                }`}
                              />
                              {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Per-owner rows — EDITABLE in team scope. Bound to form.weeklyOwnerBreakdown.
                        Standalone division keeps cells locked because the per-week target is fixed
                        to the owner's sub-target. Past-week lock still applies to each cell. */}
                    {isTeamScope && form.ownerIds.map(id => {
                      const u = users.find(u => u.id === id);
                      if (!u) return null;
                      const pct = parseFloat(form.ownerContributions[id]) || 0;
                      const ownerRow = form.weeklyOwnerBreakdown[id] ?? {};
                      return (
                        <tr key={id} className="bg-gray-50/60">
                          <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5 border-r border-t border-gray-200 text-[10px] text-gray-600 whitespace-nowrap truncate max-w-[140px]">
                            {u.firstName} {u.lastName}
                            <span className="ml-1 text-gray-400">({pct.toFixed(0)}%)</span>
                          </td>
                          {weeksArray(weekCount).map(w => {
                            const isPast = isWeekPast(w) && !pastWeekAllowed;
                            const isStandalone = form.divisionType === "Standalone";
                            const isLocked = isStandalone || isPast;
                            // Standalone per-owner: current & future weeks are ALWAYS an
                            // editable 0/sub-target <select>; past weeks become editable
                            // only when "Add Past Week Data" is ON (else locked at the
                            // owner sub-target). See isStandaloneCellEditable.
                            if (isStandaloneCellEditable(form.divisionType, isWeekPast(w), pastWeekAllowed)) {
                              const isNumUnit = form.measurementUnit === "Number";
                              const ownerTarget = (pct / 100) * scaledTarget;
                              const zeroStr = isNumUnit ? "0" : "0.00";
                              const targetStr = ownerTarget > 0
                                ? (isNumUnit ? String(Math.round(ownerTarget)) : ownerTarget.toFixed(2))
                                : "";
                              const current = ownerRow[w] ?? "";
                              const currentNum = parseFloat(current) || 0;
                              const norm = (currentNum === 0 || current === "") ? zeroStr
                                : (targetStr && Math.abs(currentNum - ownerTarget) < 0.001) ? targetStr
                                : current;
                              return (
                                <td key={w} className="px-1 py-1.5 border-r border-t border-gray-100 last:border-r-0">
                                  <div className="flex items-center gap-0.5">
                                    {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                                    <select
                                      value={norm}
                                      onChange={e => setOwnerWeekCell(id, w, e.target.value)}
                                      title={rawTip(ownerRow[w] ?? "")}
                                      className={`w-full px-1 py-1 text-center text-[11px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 ${cellMinW} cursor-pointer`}
                                    >
                                      <option value={zeroStr}>0</option>
                                      <option value={targetStr}>{targetStr ? toDisp(targetStr) : "—"}</option>
                                      {norm !== zeroStr && norm !== "" && norm !== targetStr && (
                                        <option value={norm}>{toDisp(norm)} (custom)</option>
                                      )}
                                    </select>
                                    {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                                  </div>
                                </td>
                              );
                            }
                            return (
                              <td key={w} className="px-1 py-1.5 border-r border-t border-gray-100 last:border-r-0">
                                <div className="flex items-center gap-0.5">
                                  {breakdownPrefix && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownPrefix}</span>}
                                  <input
                                    type="number"
                                    min="0"
                                    value={editingCell?.key === `own-${id}-${w}` ? editingCell.raw : toDisp(ownerRow[w] ?? "")}
                                    onChange={e => { setEditingCell({ key: `own-${id}-${w}`, raw: e.target.value }); setOwnerWeekCell(id, w, toRaw(e.target.value)); }}
                                    onBlur={() => setEditingCell(null)}
                                    readOnly={isLocked}
                                    title={isPast ? "Past week data entry is disabled." : rawTip(ownerRow[w] ?? "")}
                                    className={`w-full px-1 py-1 text-center text-[11px] border rounded focus:outline-none ${cellMinW} ${
                                      isLocked
                                        ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                        : "border-gray-200 bg-white focus:ring-1 focus:ring-accent-400"
                                    }`}
                                  />
                                  {breakdownUnit && <span className="text-[9px] text-gray-400 flex-shrink-0 whitespace-nowrap">{breakdownUnit}</span>}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </WeeklyScroller>
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-[10px] text-gray-400">
                  {isTeamScope && form.ownerIds.length > 0
                    ? (form.divisionType === "Cumulative"
                        ? "Edit any cell — total updates as sum of owners; editing total redistributes by contribution %"
                        : `Standalone: each week = owner sub-target (fixed)`)
                    : (form.divisionType === "Cumulative"
                        ? `Target split equally across ${firstEditableWeek > 1 ? `weeks ${firstEditableWeek}–${weekCount} (${weekCount + 1 - firstEditableWeek} weeks)` : `${weekCount} weeks`} — edit cells to override`
                        : `Each week = full target${isCurrency ? ` (${currencyObj.symbol}${scaledTarget})` : ` (${scaledTarget})`}`)
                  }
                </p>
                {isTeamScope && form.ownerIds.length > 0 && (
                  <button
                    type="button"
                    onClick={resetOwnerBreakdownsFromFormula}
                    className="text-[10px] text-accent-500 hover:text-accent-700 hover:underline font-medium whitespace-nowrap"
                  >
                    Reset to formula
                  </button>
                )}
              </div>
              {/* Live balance indicator — the weekly cells must total the target
                  (Cumulative only). Shows the shortfall/overage in red. */}
              {balance && balance.status !== "balanced" && (
                <p className="text-[11px] font-medium text-red-600 mt-1.5">
                  {balance.status === "under"
                    ? `Remaining: ${toDisp(String(balance.remaining))}${breakdownUnit ? ` ${breakdownUnit}` : ""} — weekly targets must total the ${toDisp(String(scaledTarget))}${breakdownUnit ? ` ${breakdownUnit}` : ""} target.`
                    : `Over target by ${toDisp(String(Math.abs(balance.remaining)))}${breakdownUnit ? ` ${breakdownUnit}` : ""} — reduce the weekly targets to total the target.`}
                </p>
              )}
            </div>
          )}
    </RightPanel>
  );
}
