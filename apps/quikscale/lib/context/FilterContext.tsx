"use client";

import { createContext, useContext, useState } from "react";

interface FilterContextValue {
  filterTeam: string;
  setFilterTeam: (v: string) => void;
  filterOwner: string;
  setFilterOwner: (v: string) => void;
}

const FilterContext = createContext<FilterContextValue>({
  filterTeam: "",
  setFilterTeam: () => {},
  filterOwner: "",
  setFilterOwner: () => {},
});

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filterTeam, setFilterTeamRaw] = useState("");
  const [filterOwner, setFilterOwner] = useState("");

  function setFilterTeam(v: string) {
    setFilterTeamRaw(v);
    setFilterOwner(""); // reset owner whenever team changes
  }

  return (
    <FilterContext.Provider value={{ filterTeam, setFilterTeam, filterOwner, setFilterOwner }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilterContext() {
  return useContext(FilterContext);
}
