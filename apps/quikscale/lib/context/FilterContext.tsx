"use client";

import { createContext, useContext, useState } from "react";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

interface FilterContextValue {
  filterTeam: string;
  setFilterTeam: (v: string) => void;
  filterOwner: string;
  setFilterOwner: (v: string) => void;
  // Shared year + quarter — session-scoped. Persists when the user navigates
  // between KPI / Priority / WWW / dashboard so picking "FY2026 Q2" on one
  // page carries over on the next. Resets on full page reload (by design —
  // user said session-only in the brainstorm).
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
  const [filterTeam, setFilterTeamRaw] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [quarter, setQuarter] = useState<Quarter>(DEFAULT_QUARTER);

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
