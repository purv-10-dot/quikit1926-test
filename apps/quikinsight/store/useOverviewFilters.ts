import { create } from "zustand";
import type { PerformanceView } from "@/lib/api/overview";

interface OverviewFiltersState {
  performanceView: PerformanceView;
  range: number;
  checkedChannels: string[];
  checkedOrganicPlatforms: string[];
  setPerformanceView: (v: PerformanceView) => void;
  setRange: (r: number) => void;
  toggleChannel: (name: string) => void;
  toggleOrganicPlatform: (name: string) => void;
}

const allChannels = ["Search", "Social", "Content", "Events", "Email"];
const allOrganicPlatforms = ["Facebook", "Instagram", "LinkedIn Company Page", "X (Twitter)"];

export const useOverviewFilters = create<OverviewFiltersState>((set) => ({
  performanceView: "all",
  range: 30,
  checkedChannels: allChannels,
  checkedOrganicPlatforms: allOrganicPlatforms,
  setPerformanceView: (v) => set({ performanceView: v }),
  setRange: (r) => set({ range: r }),
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
