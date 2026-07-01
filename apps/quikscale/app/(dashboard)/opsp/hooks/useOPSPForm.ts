"use client";

/**
 * useOPSPForm — central form-state hook for the OPSP editor page.
 *
 * Owns:
 *   - FormData state (form + setForm)
 *   - Initial load (config + OPSP data) with localStorage fallback for 401
 *   - 1.5s debounced autosave (PUT /api/opsp)
 *   - skipNextSave guard so hydration-from-server writes do not echo back
 *   - Cascade effects: targetRows → goalRows → actionsQtr (keeps category/projected in sync)
 *   - Plan-year metadata (startYear / endYear / startQuarter) and fiscalYearStart
 *   - Setup-wizard gating (showSetupWizard) + completeSetup() to reload after wizard
 *
 * Extracted from apps/quikscale/app/(dashboard)/opsp/page.tsx (Phase 2 of the OPSP
 * decomposition). Behaviour must be byte-identical to the pre-extraction page —
 * autosave is a data-persistence path, so timing, ordering, and the skipNextSave
 * ref semantics are load-bearing. Do not change debounce ms, effect dep arrays,
 * or the order in which config then data is fetched without a matching test update.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { normalizeLoadedOPSP } from "@/lib/utils/opspNormalize";
import { getFiscalYear, getFiscalQuarter, resolveQuarterForDate } from "@/lib/utils/fiscal";
import { resolveOpspLandingQuarter } from "../lib/periodGating";
import type {
  TargetRow,
  GoalRow,
  ThrustRow,
  KeyInitiativeRow,
  RockRow,
  ActionRow,
  KPIAcctRow,
  QPriorRow,
  CritCard,
} from "../types";
import { reconcileActionsWithGoals } from "../lib/actionsGoalsSync";

/**
 * ACTIONS (QTR) row bounds. Actions can independently hold up to MAX rows via
 * its own "Add New" (decoupled from the Goals count); MIN is the default/floor,
 * matching Goals. The Goals→Actions cascade grows Actions toward the Goals
 * count but never shrinks below the user's own rows — see actionsGoalsSync.ts.
 */
export const MIN_ACTION_ROWS = 6;
export const MAX_ACTION_ROWS = 10;

/* ── Shared form shape ── */
export interface FormData {
  year: number; quarter: string; targetYears: number; status: string;
  employees: string[]; customers: string[]; shareholders: string[];
  coreValues: string; purpose: string; actions: string[];
  profitPerX: string; bhag: string;
  targetRows: TargetRow[]; sandbox: string; keyThrusts: ThrustRow[];
  brandPromiseKPIs: string; brandPromise: string;
  goalRows: GoalRow[]; keyInitiatives: KeyInitiativeRow[];
  criticalNumGoals: CritCard; balancingCritNumGoals: CritCard;
  processItems: string[]; weaknesses: string[];
  makeBuy: string[]; sell: string[]; recordKeeping: string[];
  actionsQtr: ActionRow[]; rocks: RockRow[];
  criticalNumProcess: CritCard; balancingCritNumProcess: CritCard;
  theme: string; scoreboardDesign: string; celebration: string; reward: string;
  kpiAccountability: KPIAcctRow[]; quarterlyPriorities: QPriorRow[];
  criticalNumAcct: CritCard; balancingCritNumAcct: CritCard;
  trends: string[];
}

/* ── Defaults ── */
const emptyArr3 = (): string[] => ["", "", ""];
const emptyArr5 = (): string[] => ["", "", "", "", ""];
const emptyCrit = (): CritCard => ({ title: "", bullets: ["", "", "", ""] });
const emptyTarget = (): TargetRow[] => Array.from({ length: 5 }, () => ({ category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" }));
const emptyGoal = (): GoalRow[] => Array.from({ length: 6 }, () => ({ category: "", projected: "", q1: "", q2: "", q3: "", q4: "" }));
const emptyThrust = (): ThrustRow[] => Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));
const emptyKeyInitiatives = (): KeyInitiativeRow[] => Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));
const emptyRocks = (): RockRow[] => Array.from({ length: 5 }, () => ({ desc: "", owner: "" }));
const emptyAction = (): ActionRow[] => Array.from({ length: 6 }, () => ({ category: "", projected: "", m1: "", m2: "", m3: "" }));
const emptyKPI = (): KPIAcctRow[] => Array.from({ length: 5 }, () => ({ kpi: "", goal: "" }));
const emptyQP = (): QPriorRow[] => Array.from({ length: 5 }, () => ({ priority: "", dueDate: "" }));

export const defaultForm = (): FormData => ({
  year: getFiscalYear(), quarter: getFiscalQuarter(), targetYears: 5, status: "draft",
  employees: emptyArr3(), customers: emptyArr3(), shareholders: emptyArr3(),
  coreValues: "", purpose: "", actions: emptyArr5(), profitPerX: "", bhag: "",
  targetRows: emptyTarget(), sandbox: "", keyThrusts: emptyThrust(),
  brandPromiseKPIs: "", brandPromise: "",
  goalRows: emptyGoal(), keyInitiatives: emptyKeyInitiatives(),
  criticalNumGoals: emptyCrit(), balancingCritNumGoals: emptyCrit(),
  processItems: emptyArr3(), weaknesses: emptyArr3(),
  makeBuy: emptyArr3(), sell: emptyArr3(), recordKeeping: emptyArr3(),
  actionsQtr: emptyAction(), rocks: emptyRocks(),
  criticalNumProcess: emptyCrit(), balancingCritNumProcess: emptyCrit(),
  theme: "", scoreboardDesign: "", celebration: "", reward: "",
  kpiAccountability: emptyKPI(), quarterlyPriorities: emptyQP(),
  criticalNumAcct: emptyCrit(), balancingCritNumAcct: emptyCrit(),
  trends: Array(6).fill(""),
});

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface OPSPFormHandle {
  form: FormData;
  setForm: React.Dispatch<React.SetStateAction<FormData>>;
  saveState: SaveState;
  loading: boolean;
  fiscalYearStart: number;
  /** Resolved owner-id → "First Last" for the loaded OPSP (from the GET payload). */
  ownerNames: Record<string, string>;
  setOwnerNames: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  planStartYear: number | null;
  planEndYear: number | null;
  planStartQuarter: string | null;
  /** "{year}:{quarter}" keys whose review has been submitted. Drives quarter unlock. */
  reviewedQuarters: string[];
  /** Re-fetch the reviewed-quarter set (called when review submission events fire). */
  refreshReviewedQuarters: () => Promise<void>;
  showSetupWizard: boolean;
  setShowSetupWizard: React.Dispatch<React.SetStateAction<boolean>>;
  /** Reload the OPSP form for a different (year, quarter) period. */
  loadForPeriod: (year: number, quarter: string) => Promise<void>;
  /**
   * The user whose per-user sections (Accountability / Quarterly Priorities /
   * Critical # / Balanced Critical #) are currently loaded. `null` = the
   * acting user's own sections. An admin with OPSP.EditUser:update can point
   * this at another user via {@link OPSPFormHandle.selectSectionUser}.
   */
  sectionUserId: string | null;
  /** Switch which user's per-user sections are loaded/edited (admin only). */
  selectSectionUser: (userId: string | null) => Promise<void>;
  /**
   * Name of the admin a member should contact to update their finalized OPSP
   * (holds OPSP.EditUser). `null` if nobody holds it. From the GET payload.
   */
  responsibleAdminName: string | null;
  /**
   * Called by the setup wizard's onComplete: stores plan range, seeds form,
   * then re-fetches the freshly-created OPSP for the chosen period.
   */
  completeSetup: (data: { year: number; quarter: string; targetYears: number }) => void;
  /**
   * Persist a form snapshot immediately (PUT /api/opsp). Used by the
   * edit-after-finalize flow where autosave is suspended and changes are
   * committed explicitly alongside their change-log note.
   */
  save: (data: FormData) => Promise<void>;
  /**
   * Toggle the debounced autosave. Set `false` to suspend it (edit-after-finalize
   * mode commits explicitly via {@link OPSPFormHandle.save}); `true` to resume.
   */
  setAutosaveEnabled: (enabled: boolean) => void;
}

export interface UseOPSPFormOptions {
  /** URL ?year=... override from the page's useSearchParams. */
  urlYear?: string | null;
  /** URL ?quarter=... override from the page's useSearchParams. */
  urlQuarter?: string | null;
}

export function useOPSPForm(options: UseOPSPFormOptions = {}): OPSPFormHandle {
  const { urlYear = null, urlQuarter = null } = options;

  const [form, setForm] = useState<FormData>(() => {
    const base = defaultForm();
    if (urlYear) base.year = parseInt(urlYear) || base.year;
    if (urlQuarter && ["Q1", "Q2", "Q3", "Q4"].includes(urlQuarter)) base.quarter = urlQuarter;
    return base;
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading, setLoading] = useState(true);
  // Tenant's fiscal year start month (1 = Jan, 4 = Apr, etc.). Defaults to Jan until loaded.
  const [fiscalYearStart, setFiscalYearStart] = useState<number>(1);
  // Resolved owner-id → "First Last" map for the loaded OPSP (from the GET
  // payload). Lets owner names render WITHOUT bulk-loading every org user.
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  // OPSP plan year range (from setup wizard config)
  const [planStartYear, setPlanStartYear] = useState<number | null>(null);
  const [planEndYear, setPlanEndYear] = useState<number | null>(null);
  const [planStartQuarter, setPlanStartQuarter] = useState<string | null>(null); // e.g. "Q2" if onboarded mid-year
  const [reviewedQuarters, setReviewedQuarters] = useState<string[]>([]);
  // Which user's per-user sections are loaded (null = self). Mirrored into a ref
  // so the [] -dep `loadForPeriod`/`save` callbacks read the current value
  // without being re-created (and without stale closures).
  const [sectionUserId, setSectionUserId] = useState<string | null>(null);
  const sectionUserRef = useRef<string | null>(null);
  sectionUserRef.current = sectionUserId;
  const [responsibleAdminName, setResponsibleAdminName] = useState<string | null>(null);

  // Append the selected section user (if any) to an OPSP GET URL.
  const withSectionUser = (url: string) => {
    const t = sectionUserRef.current;
    return t ? `${url}&targetUserId=${encodeURIComponent(t)}` : url;
  };

  const refreshReviewedQuarters = useCallback(async () => {
    try {
      const r = await fetch("/api/opsp/config");
      if (!r.ok) return;
      const j = await r.json();
      if (j.success && Array.isArray(j.reviewedQuarters)) setReviewedQuarters(j.reviewedQuarters);
    } catch {}
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);
  const skipNextSave = useRef(false);
  // When false, the debounced autosave is suspended (used in edit-after-finalize
  // mode, where the user commits explicitly via the change-note "Save" button).
  const autosaveEnabledRef = useRef(true);
  // One-shot guards for the two cascades. Set true right before any
  // `setForm(...)` inside `loadForPeriod` so the cascades that fire on the
  // resulting render don't re-seed *inherited* data. Without these, opening
  // Q2 (which inherits Q1's goalRows) would immediately seed `actionsQtr`
  // from those inherited goals — clobbering the deliberate empty state.
  const skipNextTargetsCascade = useRef(false);
  const skipNextGoalsCascade = useRef(false);

  /* ── Reload when year/quarter changes ── */
  const loadForPeriod = useCallback(async (year: number, quarter: string) => {
    setLoading(true);
    // Synchronously reset to a clean baseline for the new period so a racing
    // autosave can't persist stale state under the new (year, quarter) primary key.
    skipNextSave.current = true;
    skipNextTargetsCascade.current = true;
    skipNextGoalsCascade.current = true;
    setForm({ ...defaultForm(), year, quarter });

    try {
      const res = await fetch(withSectionUser(`/api/opsp?year=${year}&quarter=${quarter}`));
      if (res.status === 401) {
        const draft = localStorage.getItem(`opsp_draft_${year}_${quarter}`);
        if (draft) {
          try {
            skipNextSave.current = true;
            skipNextTargetsCascade.current = true;
            skipNextGoalsCascade.current = true;
            setForm(() => ({ ...defaultForm(), ...normalizeLoadedOPSP(JSON.parse(draft)), year, quarter } as FormData));
          } catch {}
        }
      } else {
        const json = await res.json();
        if (typeof json.fiscalYearStart === "number") setFiscalYearStart(json.fiscalYearStart);
        setOwnerNames(json.ownerNames ?? {});
        setResponsibleAdminName(json.responsibleAdminName ?? null);
        if (json.data) {
          skipNextSave.current = true;
          skipNextTargetsCascade.current = true;
          skipNextGoalsCascade.current = true;
          setForm(() => ({ ...defaultForm(), ...normalizeLoadedOPSP(json.data), year, quarter } as FormData));
        }
      }
    } catch {}
    setLoading(false);
  }, []);

  /* ── Load on mount: check OPSP config first, then delegate to loadForPeriod ── */
  useEffect(() => {
    (async () => {
      // Quarter the initial load will open; overridden below from the DB-resolved
      // current quarter when the user didn't pin a period via the URL.
      let landingQuarter = form.quarter;
      try {
        // 1. Check OPSP plan config (has the wizard been completed?)
        const configRes = await fetch("/api/opsp/config");
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.success) {
            if (typeof config.fiscalYearStart === "number") setFiscalYearStart(config.fiscalYearStart);
            if (Array.isArray(config.reviewedQuarters)) setReviewedQuarters(config.reviewedQuarters);
            if (!config.hasSetup) {
              // No OPSP setup exists — show wizard
              setShowSetupWizard(true);
              setLoading(false);
              isFirstLoad.current = false;
              return;
            }
            // Store plan year range and start quarter
            if (config.startYear != null) setPlanStartYear(config.startYear);
            if (config.endYear != null) setPlanEndYear(config.endYear);
            if (config.startQuarter != null) setPlanStartQuarter(config.startQuarter);

            // Landing quarter (no URL pin): the DB-resolved CURRENT quarter
            // (custom-quarter aware) if it's reachable in the finalize chain,
            // else the first selectable quarter. Prevents landing on the
            // calendar-derived quarter (e.g. Q2 in July) which may be disabled
            // in the picker because the prior quarter isn't finalized yet.
            if (!urlQuarter) {
              let resolvedCurrent: string | null = null;
              try {
                const qRes = await fetch(`/api/org/quarters?year=${form.year}`);
                const qJson = await qRes.json();
                if (qJson.success) resolvedCurrent = resolveQuarterForDate(qJson.data, new Date());
              } catch {
                // Quarter lookup failed — fall through with the calendar default.
              }
              landingQuarter = resolveOpspLandingQuarter({
                currentQuarter: resolvedCurrent,
                year: form.year,
                planStartYear: config.startYear ?? null,
                planStartQuarter: config.startQuarter ?? null,
                reviewedQuarters: Array.isArray(config.reviewedQuarters) ? config.reviewedQuarters : [],
              });
            }
          }
        }

        // 2. Delegate to loadForPeriod so direct URL → Q2/Q3/Q4 also triggers CF.
        await loadForPeriod(form.year, landingQuarter);
      } catch {
        // A network failure on the config fetch must still end the loading
        // state — otherwise the form hangs on a spinner instead of falling
        // back to the empty default scaffold.
        setLoading(false);
      }
      isFirstLoad.current = false;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Autosave with 1.5s debounce ── */
  const save = useCallback(async (data: FormData) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/opsp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sectionUserRef.current ? { ...data, targetUserId: sectionUserRef.current } : data,
        ),
      });
      if (res.ok) {
        setSaveState("saved");
      } else if (res.status === 401) {
        // No session (preview mode) — save to localStorage
        localStorage.setItem(`opsp_draft_${data.year}_${data.quarter}`, JSON.stringify(data));
        setSaveState("saved");
      } else {
        setSaveState("error");
      }
    } catch { setSaveState("error"); }
    setTimeout(() => setSaveState("idle"), 2000);
  }, []);

  useEffect(() => {
    if (isFirstLoad.current) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    if (!autosaveEnabledRef.current) return; // suspended in edit-after-finalize mode
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(form), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form, save]);

  /* ── Cascade: Targets → Goals → Actions ──
   *
   * First-fill semantics: when a Target row has a Category + Projected and
   * the matching Goal row is still empty, we seed it. Once the user touches
   * the Goal row, subsequent Target edits don't overwrite their input.
   *
   * (Same shape applies for Goals → Actions.)
   *
   * Period cells (q1-q4 / m1-m3) are filled in the background via
   * `breakdownProjected` so validation still computes against a coherent
   * distribution, even though the matrix UI has been removed.
   */
  useEffect(() => {
    // Targets (3-5 YRS) → Goals (1 YR): live category-only binding.
    //
    //   - Only `category` propagates. Projected + per-period breakdown
    //     (q1..q4) are intentionally NOT copied — the user enters them
    //     fresh inside Goals (the section's UI shows the Target value as a
    //     small hint so the user knows what range to stay under).
    //   - When the Target category changes at a row, the matching Goal row's
    //     category follows. Goal's `projected` + q-cells reset (same as the
    //     CategorySelect onChange) so they don't get stranded against an
    //     out-of-date category.
    //   - Empty Target category does NOT overwrite a Goal — only a non-empty
    //     source propagates.
    //
    // Skip flag fires on the render right after `loadForPeriod` so freshly
    // hydrated rows don't trigger spurious resets.
    if (skipNextTargetsCascade.current) {
      skipNextTargetsCascade.current = false;
      return;
    }
    setForm(prev => {
      const next = [...prev.goalRows];
      let changed = false;
      for (let i = 0; i < Math.min(prev.targetRows.length, next.length); i++) {
        const t = prev.targetRows[i];
        if (t.category.trim() && next[i].category !== t.category) {
          next[i] = {
            ...next[i],
            category: t.category,
            projected: "",
            q1: "",
            q2: "",
            q3: "",
            q4: "",
          };
          changed = true;
        }
      }
      return changed ? { ...prev, goalRows: next } : prev;
    });
  }, [form.targetRows]);

  // Goals (1 YR) → Actions (QTR): grow Actions so every Goal has a matching
  // row (auto-filling its category from the Goal) but NEVER shrink — the user
  // can add independent Action rows via "Add New" (up to MAX_ACTION_ROWS), and
  // removing/clearing a Goal must not delete those extra rows. The bound
  // (overlapping) rows still re-propagate their category from the matching
  // Goal, resetting projected + m-cells so stale values don't strand against
  // an out-of-date category. See reconcileActionsWithGoals for the full rules.
  useEffect(() => {
    if (skipNextGoalsCascade.current) {
      skipNextGoalsCascade.current = false;
      return;
    }
    setForm(prev => {
      const next = reconcileActionsWithGoals(prev.goalRows, prev.actionsQtr, MAX_ACTION_ROWS);
      return next === prev.actionsQtr ? prev : { ...prev, actionsQtr: next };
    });
  }, [form.goalRows]);

  /* ── Switch which user's per-user sections are loaded (admin OPSP.EditUser) ── */
  const selectSectionUser = useCallback(async (userId: string | null) => {
    sectionUserRef.current = userId;
    setSectionUserId(userId);
    await loadForPeriod(form.year, form.quarter);
  }, [loadForPeriod, form.year, form.quarter]);

  /* ── Setup-wizard completion: seed plan range, form, and re-fetch fresh OPSP ── */
  const completeSetup = useCallback((data: { year: number; quarter: string; targetYears: number }) => {
    setShowSetupWizard(false);
    setPlanStartYear(data.year);
    setPlanEndYear(data.year + data.targetYears - 1);
    setPlanStartQuarter(data.quarter); // e.g. "Q2" if onboarded mid-year
    setForm(prev => ({
      ...prev,
      year: data.year,
      quarter: data.quarter,
      targetYears: data.targetYears,
    }));
    // Re-fetch to pick up the newly created OPSP
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/opsp?year=${data.year}&quarter=${data.quarter}`);
        const json = await res.json();
        setOwnerNames(json.ownerNames ?? {});
        if (json.data) {
          skipNextSave.current = true;
          const normalized = normalizeLoadedOPSP(json.data);
          setForm(() => ({ ...defaultForm(), ...normalized, year: json.data.year, quarter: json.data.quarter } as FormData));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  return {
    form,
    setForm,
    saveState,
    loading,
    fiscalYearStart,
    ownerNames,
    setOwnerNames,
    planStartYear,
    planEndYear,
    planStartQuarter,
    reviewedQuarters,
    refreshReviewedQuarters,
    showSetupWizard,
    setShowSetupWizard,
    loadForPeriod,
    sectionUserId,
    selectSectionUser,
    responsibleAdminName,
    completeSetup,
    /** Persist the given form immediately (used to commit edit-after-finalize changes). */
    save,
    /** Enable/disable the debounced autosave (off during edit-after-finalize). */
    setAutosaveEnabled: (enabled: boolean) => { autosaveEnabledRef.current = enabled; },
  };
}
