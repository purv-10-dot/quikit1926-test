"use client";

import { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from "react";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { useSessionState } from "@/lib/hooks/useSessionState";

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

interface FilterContextValue {
  filterTeam: string;
  setFilterTeam: (v: string) => void;
  /**
   * Shared owner/who filter, carried across KPI / Priority / WWW / Dashboard.
   *
   * MULTI-VALUED: every module's owner picker is multi-select, so this holds
   * the full selection rather than a single id. An empty array means "no owner
   * filter applied".
   */
  filterOwners: string[];
  setFilterOwners: (v: string[]) => void;
  // Shared year + quarter — persisted to sessionStorage. Carries across KPI /
  // Priority / WWW / dashboard navigation AND survives a full page refresh for
  // the browser-tab session (cleared when the tab closes).
  year: number;
  setYear: (y: number) => void;
  quarter: Quarter;
  setQuarter: (q: Quarter) => void;
}

const DEFAULT_YEAR = getFiscalYear();
const DEFAULT_QUARTER = getFiscalQuarter() as Quarter;
const YEAR_STORAGE_KEY = "qs:filter:year";
const QUARTER_STORAGE_KEY = "qs:filter:quarter";

const FilterContext = createContext<FilterContextValue>({
  filterTeam: "",
  setFilterTeam: () => {},
  filterOwners: [],
  setFilterOwners: () => {},
  year: DEFAULT_YEAR,
  setYear: () => {},
  quarter: DEFAULT_QUARTER,
  setQuarter: () => {},
});

export function FilterProvider({ children }: { children: React.ReactNode }) {
  // Team + Owner stay in-memory: they're shared across in-app navigation
  // (this Provider lives in the dashboard layout, so it stays mounted as the
  // user moves between KPI / Priority / WWW / Dashboard) but intentionally do
  // NOT survive a full refresh / re-login. Owner ids are ORG-SCOPED — persisting
  // one in sessionStorage let a stale owner from a previous session/org leak
  // into another org, silently filtering lists to 0 rows and showing a phantom
  // "1 filter" the user never set. Year + quarter are global (not org-scoped),
  // so they still persist for the browser-tab session (survive refresh).
  const [filterTeam, setFilterTeamRaw] = useState("");
  const [filterOwners, setFilterOwners] = useState<string[]>([]);
  const [year, setYear] = useSessionState<number>(YEAR_STORAGE_KEY, DEFAULT_YEAR);
  const [quarter, setQuarter] = useSessionState<Quarter>(QUARTER_STORAGE_KEY, DEFAULT_QUARTER);

  // Correct year/quarter to the org's REAL current quarter — resolved from its
  // actual QuarterSetting date ranges — once per fresh browser-tab session.
  // DEFAULT_YEAR/DEFAULT_QUARTER above assume an April-start fiscal calendar
  // (getFiscalQuarter/getFiscalYear are hardcoded), but an org's real
  // fiscalYearStart can be anything (the schema default is actually January).
  // Left uncorrected, a mismatched org silently defaults to the wrong quarter,
  // which filters every list (KPI/Priority/Team KPI/...) to 0 rows even when
  // the current quarter has real data. Only runs when sessionStorage had no
  // stored quarter yet, so it never overrides a value the user already set.
  const hadStoredQuarter = useRef(
    typeof window !== "undefined" && window.sessionStorage.getItem(QUARTER_STORAGE_KEY) !== null,
  );
  useEffect(() => {
    if (hadStoredQuarter.current) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/org/quarters");
        const json = await res.json();
        if (cancelled || !json.success) return;
        const rows = json.data as Array<{ fiscalYear: number; quarter: Quarter; startDate: string; endDate: string }>;
        const today = new Date();
        const current = rows.find((r) => today >= new Date(r.startDate) && today <= new Date(r.endDate));
        if (current) {
          setYear(current.fiscalYear);
          setQuarter(current.quarter);
        }
      } catch {
        // silent — keep the calendar-based default
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFilterTeam = useCallback((v: string) => {
    setFilterTeamRaw(v);
    setFilterOwners([]); // reset owners whenever team changes
  }, [setFilterOwners]);

  // Memoize the context value so consumers (KPI / Priority / WWW / dashboard)
  // don't re-render on every Provider render from an unrelated state change —
  // the object identity now changes only when one of these values actually does.
  const value = useMemo<FilterContextValue>(() => ({
    filterTeam, setFilterTeam,
    filterOwners, setFilterOwners,
    year, setYear,
    quarter, setQuarter,
  }), [filterTeam, setFilterTeam, filterOwners, setFilterOwners, year, setYear, quarter, setQuarter]);

  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilterContext() {
  return useContext(FilterContext);
}
