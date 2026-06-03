"use client";

import { createContext, useContext, useState } from "react";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import { useSessionState } from "@/lib/hooks/useSessionState";

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

interface FilterContextValue {
  filterTeam: string;
  setFilterTeam: (v: string) => void;
  filterOwner: string;
  setFilterOwner: (v: string) => void;
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

const FilterContext = createContext<FilterContextValue>({
  filterTeam: "",
  setFilterTeam: () => {},
  filterOwner: "",
  setFilterOwner: () => {},
  year: DEFAULT_YEAR,
  setYear: () => {},
  quarter: DEFAULT_QUARTER,
  setQuarter: () => {},
});

export function FilterProvider({ children }: { children: React.ReactNode }) {
  // Team stays in-memory (per-page scope, not synced). Owner + year + quarter
  // are the shared, cross-page filter and persist for the browser-tab session.
  const [filterTeam, setFilterTeamRaw] = useState("");
  const [filterOwner, setFilterOwner] = useSessionState<string>("qs:filter:owner", "");
  const [year, setYear] = useSessionState<number>("qs:filter:year", DEFAULT_YEAR);
  const [quarter, setQuarter] = useSessionState<Quarter>("qs:filter:quarter", DEFAULT_QUARTER);

  function setFilterTeam(v: string) {
    setFilterTeamRaw(v);
    setFilterOwner(""); // reset owner whenever team changes
  }

  return (
    <FilterContext.Provider
      value={{
        filterTeam, setFilterTeam,
        filterOwner, setFilterOwner,
        year, setYear,
        quarter, setQuarter,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilterContext() {
  return useContext(FilterContext);
}
