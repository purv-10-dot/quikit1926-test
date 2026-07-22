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
import {
  classifyCascade,
  advanceBaseline,
  applyReflectAtIndices,
  applyAppendOrGrow,
  type CategoryRename,
} from "../lib/categorySync";
import { useCategorySync, type UseCategorySyncResult } from "./useCategorySync";

/**
 * ACTIONS (QTR) row bounds. Actions can independently hold up to MAX rows via
 * its own "Add New" (decoupled from the Goals count); MIN is the default/floor,
 * matching Goals. The Goals→Actions cascade grows Actions toward the Goals
 * count but never shrinks below the user's own rows — see actionsGoalsSync.ts.
 */
export const MIN_ACTION_ROWS = 6;
export const MAX_ACTION_ROWS = 10;

/** GOALS (1 YR) row bounds — mirror Actions. Grows via "Add New" up to MAX; the
 *  category-sync "add to empty / grow" flow also respects MAX_GOAL_ROWS. */
export const MIN_GOAL_ROWS = 6;
export const MAX_GOAL_ROWS = 10;

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
   * Delete Goals (1 YR) row `index` in one atomic write, suppressing the
   * Goals→Actions cascade for that update (doing the splice via separate set()
   * calls lets the index-aligned cascade misread the positional shift as an
   * edit and wipe the following Action row — deleting "Exit Revenue" also
   * cleared "NPS"). The bound Actions (QTR) row at the same index is removed
   * ONLY when it still mirrors the Goal's category; a row the user detached to a
   * different category is preserved. See ProdBug-OPSP.
   */
  deleteGoalRow: (index: number) => void;
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
  /**
   * Category-synchronization confirmation flow (Targets→Goals→Actions rename
   * gating). Spread `.modal` into <SyncConfirmationModal> and wire `.confirm` /
   * `.cancel`. See useCategorySync.
   */
  categorySync: UseCategorySyncResult;
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

  // Previous upstream category snapshots for the CHANGE-driven cascades below.
  // The cascade must propagate a category downstream only when the user
  // actually EDITS the upstream row — never merely because upstream and
  // downstream currently differ. A difference-driven cascade re-seeds rows the
  // user intentionally cleared downstream (Goals/Actions) every time the
  // upstream array gets a fresh reference (e.g. `backfillPeriods` on Finalize,
  // or any unrelated Target edit). See ProdBug-OPSP: clearing Goals/Actions
  // rows 3-5 then clicking Finalize repopulated them.
  const prevTargetCatsRef = useRef<string[]>([]);
  const prevGoalCatsRef = useRef<string[]>([]);

  // Always-latest form snapshot — read by the category-sync `getDestCats`
  // callback at confirm/cancel time (event handlers, where a captured `form`
  // closure would be stale).
  const formRef = useRef(form);
  formRef.current = form;

  /* ── Category synchronization (rename-gating) ──
   * Appending new categories + first-filling empty rows stays automatic in the
   * cascades below. A synchronized-category RENAME (non-empty → non-empty where
   * the old name exists downstream) is instead gated behind a confirmation flow
   * so the downstream value isn't silently overwritten. See categorySync.ts +
   * useCategorySync.ts. */
  // The no-empty-rows case is surfaced by the hook's own warning modal (not a
  // toast), so no callback is needed here.
  const categorySync = useCategorySync();
  // Stable handles (useCallback-backed) so the cascade effects/callbacks below
  // can depend on them without re-running on every render.
  const {
    request: requestCategorySync,
    reset: resetCategorySync,
    warnDuplicates: warnDuplicateCategories,
  } = categorySync;

  // Tier-specific "reset value cells on re-category" — clears the period cells so
  // a stale distribution never strands against a new category (same rule the
  // automatic cascade uses).
  const resetGoalRow = (row: GoalRow, category: string): GoalRow => ({
    ...row, category, projected: "", q1: "", q2: "", q3: "", q4: "",
  });
  const resetActionRow = (row: ActionRow, category: string): ActionRow => ({
    ...row, category, projected: "", m1: "", m2: "", m3: "",
  });
  // Blank-row factories for the append-or-grow flow (new rows added at the end).
  const makeGoalRow = (): GoalRow => ({ category: "", projected: "", q1: "", q2: "", q3: "", q4: "" });
  const makeActionRow = (): ActionRow => ({ category: "", projected: "", m1: "", m2: "", m3: "" });

  // Apply callbacks operate on the LIVE form via functional setForm.
  const replaceGoalCategories = useCallback((renames: CategoryRename[]) => {
    // Confirming a Goals reflect updates ONLY Goals. The resulting goalRows change
    // then drives the Goals→Actions cascade, which raises a SEPARATE Actions modal
    // when that row is synced — so a Targets edit prompts twice (Goals, then
    // Actions) and a Goals edit prompts once (Actions). Each modal is confirmed
    // independently.
    setForm((prev) => {
      const res = applyReflectAtIndices(prev.goalRows, renames, resetGoalRow);
      return res.changed ? { ...prev, goalRows: res.rows } : prev;
    });
  }, []);
  const appendGoalCategories = useCallback((newNames: string[]) => {
    setForm((prev) => {
      const res = applyAppendOrGrow(prev.goalRows, newNames, resetGoalRow, makeGoalRow, MAX_GOAL_ROWS);
      return res.changed ? { ...prev, goalRows: res.rows } : prev;
    });
  }, []);
  const replaceActionCategories = useCallback((renames: CategoryRename[]) => {
    setForm((prev) => {
      const res = applyReflectAtIndices(prev.actionsQtr, renames, resetActionRow);
      return res.changed ? { ...prev, actionsQtr: res.rows } : prev;
    });
  }, []);
  const appendActionCategories = useCallback((newNames: string[]) => {
    setForm((prev) => {
      const res = applyAppendOrGrow(prev.actionsQtr, newNames, resetActionRow, makeActionRow, MAX_ACTION_ROWS);
      return res.changed ? { ...prev, actionsQtr: res.rows } : prev;
    });
  }, []);

  /* ── Reload when year/quarter changes ── */
  const loadForPeriod = useCallback(async (year: number, quarter: string) => {
    setLoading(true);
    // Synchronously reset to a clean baseline for the new period so a racing
    // autosave can't persist stale state under the new (year, quarter) primary key.
    skipNextSave.current = true;
    skipNextTargetsCascade.current = true;
    skipNextGoalsCascade.current = true;
    // Drop any pending category-sync confirmation — it belongs to the old period.
    resetCategorySync();
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
  }, [resetCategorySync]);

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
    const curCats = form.targetRows.map(r => r.category);
    if (skipNextTargetsCascade.current) {
      skipNextTargetsCascade.current = false;
      prevTargetCatsRef.current = curCats; // establish baseline; don't propagate
      return;
    }
    // Change-driven: only propagate the rows whose Target category the user
    // actually edited since the last run — NOT every row where Target ≠ Goal.
    // This lets a Goal the user cleared downstream stay cleared even when the
    // Target array gets a new reference (e.g. backfillPeriods on Finalize).
    const prevCats = prevTargetCatsRef.current;

    // Gate synchronized renames (non-empty → non-empty where the old name is
    // already in Goals): these are NOT auto-applied — they're deferred to a
    // confirmation flow. First-fill, clear, and unsynced renames still cascade
    // automatically below. Dest cats read via `formRef` so this effect keeps its
    // `[form.targetRows]`-only trigger (never re-runs when Goals change).
    const goalCats = formRef.current.goalRows.map(r => r.category);
    const { renames, duplicates } = classifyCascade(prevCats, curCats, goalCats);
    // Gated (synced rename) + duplicate rows are NOT auto-propagated: renames go
    // to the Replace confirmation; duplicates are blocked with a warning.
    const skip = new Set<number>([...renames.map(r => r.index), ...duplicates.map(d => d.index)]);
    // Advance the change-tracking baseline, but HOLD the old value for pending
    // RENAMES only, so a deferred reflect isn't lost if its modal is
    // dismissed/superseded — it re-surfaces on the next run instead of latching
    // silent. DUPLICATES are terminal (warned once, never applied): they advance
    // like any resolved row so they don't re-warn on every later unrelated change.
    // `skip` (renames + duplicates) still gates auto-propagation below. See ProdBug-OPSP.
    prevTargetCatsRef.current = advanceBaseline(prevCats, curCats, new Set(renames.map(r => r.index)));
    if (renames.length > 0) {
      requestCategorySync({
        tier: "goals",
        renames,
        onReplace: replaceGoalCategories,
        onAppendToEmpty: appendGoalCategories,
        getDestCats: () => formRef.current.goalRows.map(r => r.category),
        maxRows: MAX_GOAL_ROWS,
      });
    } else if (duplicates.length > 0) {
      warnDuplicateCategories("goals", duplicates.map(d => d.name));
    }

    setForm(prev => {
      const next = [...prev.goalRows];
      let changed = false;
      for (let i = 0; i < Math.min(prev.targetRows.length, next.length); i++) {
        if (skip.has(i)) continue; // gated reflect (occupied row) / blocked duplicate
        const cat = (prev.targetRows[i].category ?? "").trim();
        const goalCat = (next[i].category ?? "").trim();
        const wasCat = (prevCats[i] ?? "").trim();
        if (cat === goalCat) continue; // already reflected
        // Index-aligned AUTO reflection: only first-fill an EMPTY aligned Goal,
        // or CLEAR one that mirrored the old Target value. Overwriting an
        // OCCUPIED Goal with a different category is gated (in `skip`) and applied
        // only on confirmation, so it's never silently clobbered here.
        // First-fill is DUPLICATE-SAFE: never fill a value that already exists at
        // another Goal row (this is idempotent every run, so an unchanged Target
        // whose value collides downstream can't be "resurrected" into a new dup on
        // a later unrelated cascade — the change-driven warn already fired once).
        const dupElsewhere =
          cat !== "" && next.some((r, j) => j !== i && (r.category ?? "").trim() === cat);
        const isFirstFill = goalCat === "" && cat !== "" && !dupElsewhere;
        const isSyncedClear = cat === "" && goalCat !== "" && goalCat === wasCat;
        if (isFirstFill || isSyncedClear) {
          next[i] = {
            ...next[i],
            category: prev.targetRows[i].category,
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
  }, [form.targetRows, requestCategorySync, warnDuplicateCategories, replaceGoalCategories, appendGoalCategories]);

  // Goals (1 YR) → Actions (QTR): grow Actions so every Goal has a matching
  // row (auto-filling its category from the Goal) but NEVER shrink — the user
  // can add independent Action rows via "Add New" (up to MAX_ACTION_ROWS), and
  // removing/clearing a Goal must not delete those extra rows. The bound
  // (overlapping) rows still re-propagate their category from the matching
  // Goal, resetting projected + m-cells so stale values don't strand against
  // an out-of-date category. See reconcileActionsWithGoals for the full rules.
  useEffect(() => {
    const curCats = form.goalRows.map(r => r.category);
    if (skipNextGoalsCascade.current) {
      skipNextGoalsCascade.current = false;
      prevGoalCatsRef.current = curCats; // establish baseline; don't propagate
      return;
    }
    const prevCats = prevGoalCatsRef.current;

    // Gate synchronized renames (old name already in Actions) — defer to the
    // confirmation flow and skip their category auto-fill in the reconcile.
    const actionCats = formRef.current.actionsQtr.map(r => r.category);
    const { renames, duplicates } = classifyCascade(prevCats, curCats, actionCats);
    const skip = new Set<number>([...renames.map(r => r.index), ...duplicates.map(d => d.index)]);
    // Advance the baseline, HOLDING only pending RENAMES (see Targets→Goals
    // above): a deferred Actions reflect re-surfaces on the next change, while a
    // terminal duplicate advances so it never re-warns on unrelated edits.
    prevGoalCatsRef.current = advanceBaseline(prevCats, curCats, new Set(renames.map(r => r.index)));
    if (renames.length > 0) {
      requestCategorySync({
        tier: "actions",
        renames,
        onReplace: replaceActionCategories,
        onAppendToEmpty: appendActionCategories,
        getDestCats: () => formRef.current.actionsQtr.map(r => r.category),
        maxRows: MAX_ACTION_ROWS,
      });
    } else if (duplicates.length > 0) {
      warnDuplicateCategories("actions", duplicates.map(d => d.name));
    }

    setForm(prev => {
      // Grow-only length sync always applies; category auto-fill only for SYNCED
      // Action rows (reconcile now leaves diverged rows alone). Gated renames +
      // blocked duplicates are skipped — they await confirmation / were warned.
      const next = reconcileActionsWithGoals(prev.goalRows, prev.actionsQtr, MAX_ACTION_ROWS, prevCats, skip);
      return next === prev.actionsQtr ? prev : { ...prev, actionsQtr: next };
    });
  }, [form.goalRows, requestCategorySync, warnDuplicateCategories, replaceActionCategories, appendActionCategories]);

  /* ── Delete a Goals (1 YR) row + its bound Actions (QTR) counterpart ── */
  // Removing a Goal row must be a single atomic write, NOT two separate set()
  // calls from the component: the Goals→Actions cascade is index-aligned and
  // change-driven, so a positional row shift would be misread as an in-place
  // edit of every row below `index` and would wrongly reset those Action rows
  // (delete "Exit Revenue" would also wipe the following "NPS" row). We splice
  // here and suppress the very next cascade run via skipNextGoalsCascade — the
  // cascade then only re-baselines prevGoalCatsRef instead of propagating. A
  // genuine category edit afterwards still cascades. See ProdBug-OPSP.
  //
  // The bound Action row is removed ONLY when it still mirrors the deleted Goal
  // (same category at the same index). Once the user detaches that Action row by
  // choosing a different category (e.g. Goal "Revenue" vs Action "a"), it is an
  // independent entry and deleting the Goal must NOT remove it.
  const deleteGoalRow = useCallback((index: number) => {
    skipNextGoalsCascade.current = true;
    // A row splice re-indexes Goals — any pending Goals rename no longer aligns.
    resetCategorySync();
    setForm(prev => {
      const removed = prev.goalRows[index];
      const goalRows = [...prev.goalRows];
      goalRows.splice(index, 1);
      let actionsQtr = prev.actionsQtr;
      const boundAction = prev.actionsQtr[index];
      if (removed && boundAction && boundAction.category === removed.category) {
        actionsQtr = [...prev.actionsQtr];
        actionsQtr.splice(index, 1);
      }
      return { ...prev, goalRows, actionsQtr };
    });
  }, [resetCategorySync]);

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
    /** Delete a Goals (1 YR) row and its bound Actions (QTR) row atomically. */
    deleteGoalRow,
    /** Persist the given form immediately (used to commit edit-after-finalize changes). */
    save,
    /** Enable/disable the debounced autosave (off during edit-after-finalize). */
    setAutosaveEnabled: (enabled: boolean) => { autosaveEnabledRef.current = enabled; },
    /** Category-sync confirmation flow (rename gating). Spread `.modal` into
     *  <SyncConfirmationModal> and wire `.confirm` / `.cancel`. */
    categorySync,
  };
}
