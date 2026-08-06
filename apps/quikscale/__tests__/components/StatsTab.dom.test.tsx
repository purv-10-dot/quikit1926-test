// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { KPIRow } from "@/lib/types/kpi";

/**
 * Component-level smoke + regression coverage for StatsTab landed via
 * `feature/quikscale-merge-21-fixes`.
 *
 * Scope: chrome (renders Overall Progress) + bug #13 (uses kpi.target as
 * the primary 'of X target' denominator — qtdGoal is allowed to lag).
 *
 * NOT covered here (deferred — see _internal/handoffs/quikscale-21-fixes-2026-05-01.md):
 *   #21 — initial regression suite for prev-week Weekly Goal / explicit-0
 *   honoring asserted on tile DOM structure that didn't match the rendered
 *   component. Proper coverage requires re-deriving selectors from a running
 *   render and is tracked as follow-up.
 */

let mockCurrentWeek: number | null = 4;
// StatsTab reads useQtdReferenceWeek + useQuarterWeekCount too — a partial mock
// throws "No <name> export is defined on the mock", so keep all four listed.
vi.mock("@/lib/hooks/useCurrentWeek", () => ({
  useCurrentWeek: () => mockCurrentWeek,
  useQtdReferenceWeek: () => mockCurrentWeek,
  useQuarterWeekCount: () => 13,
  useWeekLabels: () => Array.from({ length: 13 }, (_, i) => `W${i + 1}`),
}));

import { StatsTab } from "@/app/(dashboard)/kpi/components/StatsTab";

function buildKPI(partial: Partial<KPIRow> = {}): KPIRow {
  return {
    id: "kpi-1",
    name: "Test KPI",
    owner: "u1",
    quarter: "Q1",
    year: 2026,
    measurementUnit: "Number",
    target: 100,
    quarterlyGoal: 100,
    qtdGoal: 100,
    qtdAchieved: 14,
    progressPercent: 14,
    status: "active",
    divisionType: "Cumulative",
    weeklyTargets: Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [String(i + 1), 100 / 13]),
    ),
    weeklyValues: [
      { weekNumber: 1, value: 5, notes: null },
      { weekNumber: 2, value: 5, notes: null },
      { weekNumber: 3, value: 4, notes: null },
    ],
    reverseColor: false,
    ...partial,
  };
}

beforeEach(() => {
  mockCurrentWeek = 4;
});

describe("StatsTab — overall progress", () => {
  it("renders Overall Progress with the achieved-of-target line", () => {
    render(<StatsTab kpi={buildKPI()} />);
    expect(screen.getByText("Overall Progress")).toBeInTheDocument();
    expect(screen.getByText(/of 100 target/)).toBeInTheDocument();
  });

  it("regression: bug #13 — uses kpi.target as the primary 'of X target' denominator (qtdGoal can lag)", () => {
    // Stale qtdGoal (65) MUST NOT win over fresh kpi.target (100).
    render(<StatsTab kpi={buildKPI({ target: 100, qtdGoal: 65 })} />);
    expect(screen.getByText(/of 100 target/)).toBeInTheDocument();
    expect(screen.queryByText(/of 65 target/)).toBeNull();
  });
});
