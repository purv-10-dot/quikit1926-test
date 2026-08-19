"use client";

import { Activity, Bug, ClipboardCheck, TrendingUp } from "lucide-react";

/**
 * The run's sub-navigation (QUIKTR-339).
 *
 * TestRail puts four views on a run. They are tabs rather than routes because the
 * run header (counts, close action) stays put across all four — routing would
 * remount it and lose the runner's selected-test state on every switch.
 */

export type RunTab = "tests" | "activity" | "progress" | "defects";

const TABS: Array<{ key: RunTab; label: string; icon: typeof Activity }> = [
  { key: "tests", label: "Tests & Results", icon: ClipboardCheck },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "progress", label: "Progress", icon: TrendingUp },
  { key: "defects", label: "Defects", icon: Bug },
];

export function RunTabs({
  active,
  onChange,
  defectCount,
}: {
  active: RunTab;
  onChange: (tab: RunTab) => void;
  /** Shown as a badge; omitted when zero so an empty tab isn't advertised. */
  defectCount?: number;
}) {
  return (
    <div className="flex gap-1 border-b border-gray-200 px-4">
      {TABS.map(({ key, label, icon: Icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors ${
              isActive
                ? "border-accent-600 font-medium text-accent-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {key === "defects" && defectCount ? (
              <span className="rounded-full bg-rose-100 px-1.5 text-[10px] font-medium text-rose-700">
                {defectCount}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
