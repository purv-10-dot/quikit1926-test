import { create } from "zustand";
import type { PerformanceView } from "@/lib/api/overview";
import { DEFAULT_PERIOD, type PeriodSpec } from "@/lib/period/types";

interface OverviewFiltersState {
  performanceView: PerformanceView;
  /**
   * Range + comparison. Deliberately the SPEC, not resolved windows — a stored
   * window would go stale across midnight; resolvePeriod() runs at render time.
   */
  period: PeriodSpec;
  checkedChannels: string[];
  checkedOrganicPlatforms: string[];
  setPerformanceView: (v: PerformanceView) => void;
  setPeriod: (p: PeriodSpec) => void;
  toggleChannel: (name: string) => void;
  toggleOrganicPlatform: (name: string) => void;
}

const allChannels = ["Search", "Social", "Content", "Events", "Email"];
const allOrganicPlatforms = ["Facebook", "Instagram", "LinkedIn Company Page", "X (Twitter)"];

export const useOverviewFilters = create<OverviewFiltersState>((set) => ({
  performanceView: "all",
  period: DEFAULT_PERIOD,
  checkedChannels: allChannels,
  checkedOrganicPlatforms: allOrganicPlatforms,
  setPerformanceView: (v) => set({ performanceView: v }),
  setPeriod: (p) => set({ period: p }),
  toggleChannel: (name) =>
    set((s) => ({
      checkedChannels: s.checkedChannels.includes(name)
        ? s.checkedChannels.filter((c) => c !== name)
        : [...s.checkedChannels, name],
    })),
  toggleOrganicPlatform: (name) =>
    set((s) => ({
      checkedOrganicPlatforms: s.checkedOrganicPlatforms.includes(name)
        ? s.checkedOrganicPlatforms.filter((c) => c !== name)
        : [...s.checkedOrganicPlatforms, name],
    })),
}));
