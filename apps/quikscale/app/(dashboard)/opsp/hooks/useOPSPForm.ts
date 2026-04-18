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
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
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
  planStartYear: number | null;
  planEndYear: number | null;
  planStartQuarter: string | null;
  showSetupWizard: boolean;
  setShowSetupWizard: React.Dispatch<React.SetStateAction<boolean>>;
  /** Reload the OPSP form for a different (year, quarter) period. */
  loadForPeriod: (year: number, quarter: string) => Promise<void>;
  /**
   * Called by the setup wizard's onComplete: stores plan range, seeds form,
   * then re-fetches the freshly-created OPSP for the chosen period.
   */
  completeSetup: (data: { year: number; quarter: string; targetYears: number }) => void;
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
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  // OPSP plan year range (from setup wizard config)
  const [planStartYear, setPlanStartYear] = useState<number | null>(null);
  const [planEndYear, setPlanEndYear] = useState<number | null>(null);
  const [planStartQuarter, setPlanStartQuarter] = useState<string | null>(null); // e.g. "Q2" if onboarded mid-year

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstLoad = useRef(true);
  const skipNextSave = useRef(false);

  /* ── Load on mount: check OPSP config first, then load data ── */
  useEffect(() => {
    (async () => {
      try {
        // 1. Check OPSP plan config (has the wizard been completed?)
        const configRes = await fetch("/api/opsp/config");
        if (configRes.ok) {
          const config = await configRes.json();
          if (config.success) {
            if (typeof config.fiscalYearStart === "number") setFiscalYearStart(config.fiscalYearStart);
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
          }
        }

        // 2. Load the OPSP data for the current period
        const res = await fetch(`/api/opsp?year=${form.year}&quarter=${form.quarter}`);
        if (res.status === 401) {
          // No session (preview mode) — try localStorage
          const draft = localStorage.getItem(`opsp_draft_${form.year}_${form.quarter}`);
          if (draft) {
            try {
              skipNextSave.current = true;
              setForm(prev => ({ ...defaultForm(), ...normalizeLoadedOPSP(JSON.parse(draft)) } as FormData));
            } catch {}
          }
        } else {
          const json = await res.json();
          if (typeof json.fiscalYearStart === "number") setFiscalYearStart(json.fiscalYearStart);
          if (json.data) {
            skipNextSave.current = true;
            const normalized = normalizeLoadedOPSP(json.data);
            setForm(prev => ({ ...defaultForm(), ...normalized, year: json.data.year ?? prev.year, quarter: json.data.quarter ?? prev.quarter } as FormData));
          }
        }
      } catch {}
      setLoading(false);
      isFirstLoad.current = false;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Reload when year/quarter changes ── */
  const loadForPeriod = useCallback(async (year: number, quarter: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/opsp?year=${year}&quarter=${quarter}`);
      if (res.status === 401) {
        const draft = localStorage.getItem(`opsp_draft_${year}_${quarter}`);
        skipNextSave.current = true;
        setForm(() => {
          if (draft) {
            try { return { ...defaultForm(), ...normalizeLoadedOPSP(JSON.parse(draft)), year, quarter } as FormData; } catch {}
          }
          return { ...defaultForm(), year, quarter };
        });
      } else {
        const json = await res.json();
        if (typeof json.fiscalYearStart === "number") setFiscalYearStart(json.fiscalYearStart);
        skipNextSave.current = true;
        setForm(() => json.data
          ? ({ ...defaultForm(), ...normalizeLoadedOPSP(json.data), year, quarter } as FormData)
          : { ...defaultForm(), year, quarter });
      }
    } catch {}
    setLoading(false);
  }, []);

  /* ── Autosave with 1.5s debounce ── */
  const save = useCallback(async (data: FormData) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/opsp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => save(form), 1500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [form, save]);

  /* ── Cascade: Targets → Goals → Actions (reactive, force-sync) ── */
  // Targets y1 (current year) → Goals category + projected
  // When source clears → also wipe quarter values (q1–q4)
  useEffect(() => {
    setForm(prev => {
      const next = [...prev.goalRows];
      let changed = false;
      for (let i = 0; i < Math.min(prev.targetRows.length, next.length); i++) {
        const t = prev.targetRows[i];
        const hasSrc = !!(t.category.trim() && t.projected.trim() && t.y1.trim());
        const newCat = hasSrc ? t.category : "";
        const newProj = hasSrc ? t.y1 : "";
        if (next[i].category !== newCat || next[i].projected !== newProj) {
          if (hasSrc) {
            next[i] = { ...next[i], category: newCat, projected: newProj };
          } else {
            // Source cleared → reset entire Goals row
            next[i] = { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" };
          }
          changed = true;
        }
      }
      return changed ? { ...prev, goalRows: next } : prev;
    });
  }, [form.targetRows]);

  // Goals current-quarter column → Actions category + projected
  // When source clears → also wipe month values (m1–m3)
  useEffect(() => {
    const qKey = form.quarter.toLowerCase() as keyof GoalRow; // "q1" | "q2" | "q3" | "q4"
    setForm(prev => {
      const next = [...prev.actionsQtr];
      let changed = false;
      for (let i = 0; i < Math.min(prev.goalRows.length, next.length); i++) {
        const g = prev.goalRows[i];
        const qVal = String(g[qKey] ?? "").trim();
        const hasSrc = !!(g.category.trim() && g.projected.trim() && qVal);
        const newCat = hasSrc ? g.category : "";
        const newProj = hasSrc ? qVal : "";
        if (next[i].category !== newCat || next[i].projected !== newProj) {
          if (hasSrc) {
            next[i] = { ...next[i], category: newCat, projected: newProj };
          } else {
            // Source cleared → reset entire Actions row
            next[i] = { category: "", projected: "", m1: "", m2: "", m3: "" };
          }
          changed = true;
        }
      }
      return changed ? { ...prev, actionsQtr: next } : prev;
    });
  }, [form.goalRows, form.quarter]);

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
    planStartYear,
    planEndYear,
    planStartQuarter,
    showSetupWizard,
    setShowSetupWizard,
    loadForPeriod,
    completeSetup,
  };
}
