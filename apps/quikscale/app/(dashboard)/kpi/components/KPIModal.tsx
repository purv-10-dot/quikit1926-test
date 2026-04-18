"use client";

import { useState, useEffect, useRef } from "react";
import { useCreateKPI, useUpdateKPI } from "@/lib/hooks/useKPI";
import { useUsers } from "@/lib/hooks/useUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { KPIRow as KPI } from "@/lib/types/kpi";
import type { User } from "@/lib/types/kpi";
import { fiscalYearLabel, MEASUREMENT_UNITS, ALL_QUARTERS, ALL_WEEKS, weekDateLabel } from "@/lib/utils/fiscal";
import { CURRENCIES, getScales, getMultiplier, formatActual } from "@/lib/utils/currency";
import { UserPicker } from "@quikit/ui";
import { UserMultiPicker } from "@quikit/ui";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import { Lock, ChevronDown } from "lucide-react";
import {
  buildBreakdown,
  buildOwnerBreakdown,
  redistributeOwnerRemainder,
  distributeContributionsEven,
  type DivisionType,
} from "./kpiModalHelpers";

interface Props {
  mode: "create" | "edit";
  kpi?: KPI;
  /** "individual" (default) shows the owner picker; "team" hides it and requires teamId. */
  scope?: "individual" | "team";
  /** Required when scope === "team" and mode === "create". */
  teamId?: string;
  defaultYear?: number;
  defaultQuarter?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const CURRENT_YEAR = new Date().getFullYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

/* ── Component ─────────────────────────────────────────────────────────── */

export function KPIModal({ mode, kpi, scope, teamId, defaultYear, defaultQuarter, onClose, onSuccess }: Props) {
  // Determine whether this modal instance operates in team-level scope.
  // Priority: explicit `scope` prop > existing kpi.kpiLevel (in edit mode) > default "individual"
  const isTeamScope = scope === "team" || kpi?.kpiLevel === "team";

  const [form, setForm] = useState(() => {
    const measurementUnit = kpi?.measurementUnit ?? "Number";
    const currency = kpi?.currency ?? "USD";
    const savedScale = (measurementUnit === "Currency" ? kpi?.targetScale : null) ?? "";
    const multiplier = measurementUnit === "Currency" ? getMultiplier(currency, savedScale) : 1;
    const storedTarget = kpi?.target ?? 0;
    const displayTarget = multiplier > 1 ? storedTarget / multiplier : storedTarget;
    const divisionType = (kpi?.divisionType as "Cumulative" | "Standalone") ?? "Cumulative";

    // Restore saved weekly targets or build fresh
    const savedWeeklyTargets = kpi?.weeklyTargets as Record<string, number> | null | undefined;
    const weeklyBreakdown: Record<number, string> = savedWeeklyTargets
      ? Object.fromEntries(ALL_WEEKS.map(w => [w, String(savedWeeklyTargets[String(w)] ?? "")]))
      : buildBreakdown(divisionType, storedTarget, measurementUnit);

    // Restore saved per-owner weekly targets (team KPI only).
    // Stored shape: { userId: { "1": value, "2": value, ... } }
    const savedOwnerTargets = kpi?.weeklyOwnerTargets as Record<string, Record<string, number>> | null | undefined;
    const weeklyOwnerBreakdown: Record<string, Record<number, string>> = {};
    if (savedOwnerTargets) {
      for (const [ownerId, weekMap] of Object.entries(savedOwnerTargets)) {
        weeklyOwnerBreakdown[ownerId] = Object.fromEntries(
          ALL_WEEKS.map(w => [w, String(weekMap[String(w)] ?? "")])
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
      weeklyOwnerBreakdown,
      teamId: kpi?.teamId ?? teamId ?? "",
      quarter: kpi?.quarter ?? defaultQuarter ?? "Q1",
      year: String(kpi?.year ?? defaultYear ?? CURRENT_YEAR),
      measurementUnit,
      target: displayTarget > 0 ? String(displayTarget) : "",
      status: kpi?.status ?? "active",
      currency,
      targetScale: savedScale,
      divisionType,
      reverseColor: kpi?.reverseColor ?? false,
      weeklyBreakdown,
    };
  });

  // In team scope, filter users to members of the selected team
  const { data: allUsers = [] } = useUsers();
  const { data: teamMembers = [] } = useUsers(isTeamScope ? (form.teamId || undefined) : undefined);
  const users = isTeamScope ? teamMembers : allUsers;
  const { data: teams = [] } = useTeams();
  const currentTeam = teams.find(t => t.id === form.teamId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

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
          newBreakdown[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek);
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
        newBreakdown[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek);
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
      let priorSum = 0;
      for (let i = 1; i < weekNumber; i++) priorSum += parseFloat(String(existingRow[i])) || 0;
      const maxAllowed = Math.max(0, ownerSubTarget - priorSum);

      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (f.divisionType === "Cumulative" && parsed > maxAllowed) parsed = maxAllowed;

      const val = rawVal === "" ? "" : (isWhole ? String(Math.round(parsed)) : parsed.toFixed(2));
      let ownerRow = { ...existingRow, [weekNumber]: val };

      if (f.divisionType === "Cumulative") {
        ownerRow = redistributeOwnerRemainder(ownerRow, weekNumber, ownerSubTarget, f.measurementUnit);
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

      // Clamp: no negatives, and cannot exceed remaining team budget
      // Compute prior sum from existing owner rows (sum all owners' cells for weeks < weekNumber)
      let priorTeamSum = 0;
      for (let i = 1; i < weekNumber; i++) {
        for (const id of f.ownerIds) {
          priorTeamSum += parseFloat(String((f.weeklyOwnerBreakdown[id] ?? {})[i])) || 0;
        }
      }
      const maxAllowed = Math.max(0, totalTargetNum - priorTeamSum);

      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (f.divisionType === "Cumulative" && parsed > maxAllowed) parsed = maxAllowed;

      const totalNum = parsed;
      const newOwnerBreakdown: Record<string, Record<number, string>> = { ...f.weeklyOwnerBreakdown };

      for (const id of f.ownerIds) {
        const pct = parseFloat(f.ownerContributions[id]) || 0;
        const ownerCellVal = totalNum * (pct / 100);
        const formattedVal = isWhole ? String(Math.round(ownerCellVal)) : ownerCellVal.toFixed(2);
        let ownerRow = { ...(newOwnerBreakdown[id] ?? {}), [weekNumber]: formattedVal };

        if (f.divisionType === "Cumulative") {
          const ownerSubTarget = totalTargetNum * (pct / 100);
          ownerRow = redistributeOwnerRemainder(ownerRow, weekNumber, ownerSubTarget, f.measurementUnit);
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
      out[id] = buildOwnerBreakdown(pct, tNum, f.divisionType, f.measurementUnit, firstEditableWeek);
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
  const { canAddPastWeek, canEditPastWeek } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(parseInt(form.year) || null, form.quarter);
  // For create mode, use canAddPastWeek; for edit mode, use canEditPastWeek
  const pastWeekAllowed = mode === "create" ? canAddPastWeek : canEditPastWeek;

  /** Resolve display-target → actual stored number (handles Currency scale multiplier). */
  function actualNum(f: typeof form): number {
    const base = parseFloat(f.target) || 0;
    if (f.measurementUnit !== "Currency") return base;
    return base * getMultiplier(f.currency, f.targetScale);
  }

  // First editable week for target distribution — blocked weeks get 0
  // In Standalone mode this is ignored (every week gets full target)
  const firstEditableWeek = (!pastWeekAllowed && currentWeek !== null && currentWeek > 1) ? currentWeek : 1;

  // When firstEditableWeek resolves (async from API) and we're in create mode,
  // recalculate the breakdown so blocked weeks get 0 and editable weeks share the target.
  const firstEditableWeekResolved = useRef(false);
  useEffect(() => {
    if (firstEditableWeekResolved.current || mode !== "create" || firstEditableWeek <= 1) return;
    firstEditableWeekResolved.current = true;
    const targetNum = actualNum(form);
    if (targetNum <= 0) return;
    setForm(f => {
      const next = {
        ...f,
        weeklyBreakdown: buildBreakdown(f.divisionType, actualNum(f), f.measurementUnit, firstEditableWeek),
      };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstEditableWeek]);

  const createKPI = useCreateKPI();
  const updateKPI = useUpdateKPI(kpi?.id ?? "");

  /* ── Field helpers ── */

  function set(key: string, val: string) {
    setForm(f => ({ ...f, [key]: val }));
    setErrors(e => { const n = { ...e }; delete n[key]; return n; });
  }

  function setMeasurementUnit(val: string) {
    setForm(f => {
      const n = val === "Currency"
        ? (parseFloat(f.target) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(f.target) || 0;
      const next = { ...f, measurementUnit: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, val, firstEditableWeek) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setCurrency(val: string) {
    setForm(f => {
      const validScale = getScales(val).find(s => s.label === f.targetScale) ? f.targetScale : "";
      const n = (parseFloat(f.target) || 0) * getMultiplier(val, validScale);
      const next = { ...f, currency: val, targetScale: validScale, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setTargetScale(val: string) {
    setForm(f => {
      const n = (parseFloat(f.target) || 0) * getMultiplier(f.currency, val);
      const next = { ...f, targetScale: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setDivisionType(dt: "Cumulative" | "Standalone") {
    setForm(f => {
      const next = { ...f, divisionType: dt, weeklyBreakdown: buildBreakdown(dt, actualNum(f), f.measurementUnit, firstEditableWeek) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setTarget(val: string) {
    setForm(f => {
      const n = f.measurementUnit === "Currency"
        ? (parseFloat(val) || 0) * getMultiplier(f.currency, f.targetScale)
        : parseFloat(val) || 0;
      const next = { ...f, target: val, weeklyBreakdown: buildBreakdown(f.divisionType, n, f.measurementUnit, firstEditableWeek) };
      if (isTeamScope) next.weeklyOwnerBreakdown = computeAllOwnerBreakdowns(next);
      return next;
    });
  }

  function setWeekBreakdown(w: number, rawVal: string) {
    setForm(f => {
      // Clamp: no negatives, and cannot exceed remaining budget (target - sum of prior weeks)
      const targetNum = actualNum(f);
      const isWhole = f.measurementUnit === "Number";
      let priorSum = 0;
      for (let i = 1; i < w; i++) priorSum += parseFloat(String(f.weeklyBreakdown[i])) || 0;
      const maxAllowed = Math.max(0, targetNum - priorSum);

      let parsed = parseFloat(rawVal);
      if (rawVal === "" || isNaN(parsed)) parsed = 0;
      if (parsed < 0) parsed = 0;
      if (f.divisionType === "Cumulative" && parsed > maxAllowed) parsed = maxAllowed;

      const val = rawVal === "" ? "" : (isWhole ? String(Math.round(parsed)) : parsed.toFixed(2));
      const newBreakdown = { ...f.weeklyBreakdown, [w]: val };
      if (f.divisionType !== "Cumulative") return { ...f, weeklyBreakdown: newBreakdown };

      // Recalculate leftSum including the capped value
      let leftSum = 0;
      for (let i = 1; i <= w; i++) leftSum += parseFloat(String(newBreakdown[i])) || 0;

      const remaining = Math.max(0, targetNum - leftSum);
      const rightCount = 13 - w;
      if (rightCount <= 0) return { ...f, weeklyBreakdown: newBreakdown };

      if (isWhole) {
        const base = Math.floor(remaining / rightCount);
        const extra = Math.round(remaining - base * rightCount);
        for (let i = w + 1; i <= 13; i++) {
          newBreakdown[i] = String(13 - i < extra ? base + 1 : base);
        }
      } else {
        const base = parseFloat((remaining / rightCount).toFixed(2));
        const diff = parseFloat((remaining - base * rightCount).toFixed(2));
        for (let i = w + 1; i <= 13; i++) newBreakdown[i] = base.toFixed(2);
        newBreakdown[13] = (base + diff).toFixed(2);
      }
      return { ...f, weeklyBreakdown: newBreakdown };
    });
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "KPI name is required";
    if (isTeamScope) {
      if (!form.teamId) errs.teamId = "Team is required";
      if (form.ownerIds.length === 0) errs.ownerIds = "At least one owner is required";
      if (form.ownerIds.length > 0) {
        const sum = Object.values(form.ownerContributions).reduce((s, v) => s + (parseFloat(v) || 0), 0);
        if (Math.abs(sum - 100) > 0.5) {
          errs.ownerContributions = `Contributions must sum to 100% (currently ${sum.toFixed(1)}%)`;
        }
        for (const id of form.ownerIds) {
          const v = parseFloat(form.ownerContributions[id]);
          if (isNaN(v) || v < 0) {
            errs.ownerContributions = "Each owner must have a valid contribution %";
            break;
          }
        }
      }
    } else {
      if (!form.owner) errs.owner = "Owner is required";
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
        reverseColor: form.reverseColor,
        // In team scope: derive weeklyTargets (total per week) as the live sum of per-owner cells.
        // In individual scope: use the editable weeklyBreakdown as-is.
        weeklyTargets: isTeamScope && form.ownerIds.length > 0
          ? Object.fromEntries(
              ALL_WEEKS.map(w => {
                const sum = form.ownerIds.reduce(
                  (s, id) => s + (parseFloat(form.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0),
                  0
                );
                return [String(w), sum];
              })
            )
          : Object.fromEntries(
              ALL_WEEKS.map(w => [String(w), parseFloat(form.weeklyBreakdown[w]) || 0])
            ),
        // Per-owner weekly targets — only for team scope
        weeklyOwnerTargets: isTeamScope && form.ownerIds.length > 0
          ? Object.fromEntries(
              form.ownerIds.map(id => [
                id,
                Object.fromEntries(
                  ALL_WEEKS.map(w => [String(w), parseFloat(form.weeklyOwnerBreakdown[id]?.[w] ?? "") || 0])
                ),
              ])
            )
          : undefined,
      };
      if (mode === "create") {
        await createKPI.mutateAsync(payload);
      } else {
        // Strip immutable fields on edit — quarter, owner, measurementUnit, currency cannot change
        // ownerIds + ownerContributions remain editable for team KPIs
        const { quarter: _q, measurementUnit: _mu, currency: _c, owner: _o, ...editPayload } = payload;
        await updateKPI.mutateAsync(editPayload);
      }
      onSuccess();
    } catch (err: any) {
      setErrors({ _: err.message || "Failed to save KPI" });
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

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative ml-auto h-full bg-white shadow-2xl flex flex-col ${isTeamScope ? "w-[760px]" : "w-[520px]"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              {mode === "create"
                ? (isTeamScope ? "Add Team KPI" : "Add New KPI")
                : (isTeamScope ? "Edit Team KPI" : "Edit KPI")}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {fiscalYearLabel(parseInt(form.year))} · {form.quarter}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {errors._ && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
              {errors._}
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
                <UserPicker value={form.owner} onChange={v => set("owner", v)} users={users} error={!!errors.owner} disabled={mode === "edit"} />
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

          {/* Quarter (read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quarter</label>
            <div className="px-3 py-2 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-600">
              {fiscalYearLabel(parseInt(form.year))} · {form.quarter}
            </div>
          </div>

          {/* Measurement Unit + Currency */}
          <div className={`grid gap-3 ${isCurrency ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Measurement Unit <span className="text-red-500">*</span>
              </label>
              <select value={form.measurementUnit} onChange={e => setMeasurementUnit(e.target.value)}
                disabled={mode === "edit"}
                className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${mode === "edit" ? "border-gray-100 bg-gray-50 text-gray-600 cursor-not-allowed" : "border-gray-200 bg-white"}`}>
                {MEASUREMENT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            {isCurrency && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
                <select value={form.currency} onChange={e => setCurrency(e.target.value)}
                  disabled={mode === "edit"}
                  className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 ${mode === "edit" ? "border-gray-100 bg-gray-50 text-gray-600 cursor-not-allowed" : "border-gray-200 bg-white"}`}>
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Target Value */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Value</label>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden focus-within:ring-1 focus-within:ring-accent-400 focus-within:border-accent-400">
              {isCurrency && (
                <span className="flex items-center px-2.5 bg-gray-50 border-r border-gray-200 text-xs text-gray-500 select-none whitespace-nowrap flex-shrink-0">
                  {currencyObj.symbol}
                </span>
              )}
              <input type="number" min="0" value={form.target} onChange={e => setTarget(e.target.value)}
                placeholder="0"
                className="flex-1 px-3 py-2 text-xs focus:outline-none bg-white min-w-0" />
              {isCurrency && (
                <select value={form.targetScale} onChange={e => setTargetScale(e.target.value)}
                  className="border-l border-gray-200 pl-2 pr-1 py-2 text-xs bg-white focus:outline-none text-gray-600 flex-shrink-0 cursor-pointer">
                  {scales.map(s => (
                    <option key={s.label} value={s.label}>{s.label || "—"}</option>
                  ))}
                </select>
              )}
            </div>
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
                  return (
                    <div key={id} className="flex items-center gap-3 px-3 py-2 bg-white hover:bg-gray-50">
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

          {/* Division Type + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Division Type</label>
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
              <p className="text-[10px] text-gray-400 mt-1">
                {form.divisionType === "Cumulative" ? "Target split equally across 13 weeks" : "Each week carries the full target value"}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <div className="flex gap-3 mt-1">
                {(["active", "paused", "completed"] as const).map(s => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="status" value={s} checked={form.status === s}
                      onChange={() => set("status", s)} className="text-accent-600" />
                    <span className="text-xs text-gray-600 capitalize">{s}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Color Coding Mode */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color Coding</label>
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
          {scaledTarget > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Target Breakdown (Weekly)</label>
              <div className="border border-gray-200 rounded-lg overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      {/* Label column header for team scope — aligns with the sticky label TDs below */}
                      {isTeamScope && form.ownerIds.length > 0 && (
                        <th className="sticky left-0 z-20 bg-gray-50 px-3 py-1.5 border-r border-gray-200 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap text-left min-w-[140px]">
                          &nbsp;
                        </th>
                      )}
                      {ALL_WEEKS.map(w => {
                        const isPast = currentWeek !== null && w < currentWeek && !pastWeekAllowed;
                        return (
                        <th key={w} className={`px-2 py-1.5 text-center font-medium border-r border-gray-200 last:border-r-0 whitespace-nowrap ${isPast ? "text-gray-300" : "text-gray-500"}`}>
                          <div className="flex items-center justify-center gap-1">
                            {isPast && <Lock className="h-2.5 w-2.5 text-gray-300" />}
                            Week {w}
                          </div>
                          <div className="text-[9px] font-normal text-gray-400">{weekDateLabel(parseInt(form.year), form.quarter, w)}</div>
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
                      {ALL_WEEKS.map(w => {
                        const isPast = currentWeek !== null && w < currentWeek && !pastWeekAllowed;
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
                              <input
                                type="number"
                                min="0"
                                value={displaySum}
                                onChange={e => setTeamTotalWeekCell(w, e.target.value)}
                                readOnly={isLocked}
                                title={isPast
                                  ? "Past week data entry is disabled. Enable in Settings > Configurations."
                                  : "Editing the total redistributes across owners by contribution %"}
                                className={`w-full px-1 py-1 text-center text-xs font-semibold border rounded focus:outline-none min-w-[72px] ${
                                  isLocked
                                    ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                    : "border-gray-200 bg-white text-gray-800 focus:ring-1 focus:ring-accent-400"
                                }`}
                              />
                            </td>
                          );
                        }

                        // Individual scope: editable input as before
                        return (
                          <td key={w} className="px-1 py-1.5 border-r border-gray-100 last:border-r-0">
                            <input
                              type="number"
                              min="0"
                              value={form.weeklyBreakdown[w] ?? ""}
                              onChange={e => setWeekBreakdown(w, e.target.value)}
                              readOnly={isLocked}
                              title={isPast ? "Past week data entry is disabled. Enable in Settings > Configurations." : undefined}
                              className={`w-full px-1 py-1 text-center text-xs border rounded focus:outline-none min-w-[72px] ${
                                isLocked
                                  ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                  : "border-gray-200 focus:ring-1 focus:ring-accent-400"
                              }`}
                            />
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
                          {ALL_WEEKS.map(w => {
                            const isPast = currentWeek !== null && w < currentWeek && !pastWeekAllowed;
                            const isStandalone = form.divisionType === "Standalone";
                            const isLocked = isStandalone || isPast;
                            return (
                              <td key={w} className="px-1 py-1.5 border-r border-t border-gray-100 last:border-r-0">
                                <input
                                  type="number"
                                  min="0"
                                  value={ownerRow[w] ?? ""}
                                  onChange={e => setOwnerWeekCell(id, w, e.target.value)}
                                  readOnly={isLocked}
                                  title={isPast ? "Past week data entry is disabled." : undefined}
                                  className={`w-full px-1 py-1 text-center text-[11px] border rounded focus:outline-none min-w-[72px] ${
                                    isLocked
                                      ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                                      : "border-gray-200 bg-white focus:ring-1 focus:ring-accent-400"
                                  }`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-1 gap-2">
                <p className="text-[10px] text-gray-400">
                  {isTeamScope && form.ownerIds.length > 0
                    ? (form.divisionType === "Cumulative"
                        ? "Edit any cell — total updates as sum of owners; editing total redistributes by contribution %"
                        : `Standalone: each week = owner sub-target (fixed)`)
                    : (form.divisionType === "Cumulative"
                        ? `Target split equally across ${firstEditableWeek > 1 ? `weeks ${firstEditableWeek}–13 (${14 - firstEditableWeek} weeks)` : "13 weeks"} — edit cells to override`
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
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {saving && (
              <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {mode === "create"
              ? (isTeamScope ? "Create Team KPI" : "Create KPI")
              : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
