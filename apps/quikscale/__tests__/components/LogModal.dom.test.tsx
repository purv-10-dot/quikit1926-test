// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { setSession } from "../setup";
import { TestProviders } from "../helpers/TestProviders";
import type { KPIRow } from "@/lib/types/kpi";

/**
 * Component-level smoke + regression coverage for LogModal landed via
 * `feature/quikscale-merge-21-fixes`.
 *
 * Scope: chrome (renders, Cancel) + bug #19 (Updates tab still shows
 * historical Value for weeks that lost their target).
 *
 * NOT covered here (deferred — see _internal/handoffs/quikscale-21-fixes-2026-05-01.md):
 *   #11, #12, #13, #14, #15, #20 — initial regression suite asserted on
 *   DOM structure that didn't match the rendered component. Proper coverage
 *   requires re-deriving selectors from a running render and is tracked as
 *   follow-up.
 *   #16 — superseded by #21
 *   #17 — dead code cleanup, no behavior to assert
 */

// ── Hook mocks ────────────────────────────────────────────────────────────────

const mockUpdateKPIMutate = vi.fn(async () => ({}));
const mockUpdateWeeklyMutate = vi.fn(async () => ({}));
const mockAddNoteMutate = vi.fn(async () => ({}));

let pastWeekFlagsState = { canAddPastWeek: false, canEditPastWeek: false, loaded: true };

vi.mock("@/lib/hooks/useKPI", () => ({
  useUpdateKPI: () => ({ mutateAsync: mockUpdateKPIMutate }),
  useUpdateWeeklyValue: () => ({ mutateAsync: mockUpdateWeeklyMutate }),
  // Branch added a batched-update hook used by LogModal's Updates tab.
  useUpdateWeeklyValuesBatch: () => ({ mutateAsync: vi.fn() }),
  useNotes: () => ({ data: [], refetch: vi.fn() }),
  useAddNote: () => ({ mutateAsync: mockAddNoteMutate }),
}));

vi.mock("@/lib/hooks/useUsers", () => ({
  useUsers: () => ({ data: [] }),
}));

vi.mock("@/lib/hooks/useFeatureFlags", () => ({
  usePastWeekFlags: () => pastWeekFlagsState,
}));

vi.mock("@/lib/hooks/useCurrentWeek", () => ({
  useCurrentWeek: () => 4,
  useWeekLabels: () => Array.from({ length: 13 }, (_, i) => `W${i + 1}-label`),
}));

vi.mock("@/lib/hooks/useCanEditKPI", () => ({
  useCanEditKPI: () => true,
}));

vi.mock("@quikit/ui", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@quikit/ui");
  return {
    ...actual,
    UserPicker: ({ value }: { value: string }) => <div data-testid="user-picker">{value}</div>,
  };
});

import { LogModal } from "@/app/(dashboard)/kpi/components/LogModal";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function buildKPI(partial: Partial<KPIRow> = {}): KPIRow {
  return {
    id: "kpi-1",
    name: "Test KPI",
    description: "desc",
    kpiLevel: "individual",
    owner: "user-1",
    owner_user: { id: "user-1", firstName: "Ada", lastName: "Lovelace" },
    quarter: "Q1",
    year: 2026,
    measurementUnit: "Number",
    target: 65,
    quarterlyGoal: 65,
    qtdGoal: 65,
    qtdAchieved: 14,
    progressPercent: 22,
    status: "active",
    divisionType: "Cumulative",
    weeklyTargets: Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [String(i + 1), 5]),
    ),
    weeklyValues: [
      { weekNumber: 1, value: 5, notes: "n1" },
      { weekNumber: 2, value: 5, notes: "n2" },
      { weekNumber: 3, value: 4, notes: "n3" },
    ],
    reverseColor: false,
    ...partial,
  };
}

beforeEach(() => {
  setSession({ id: "user-1", orgId: "t-1", role: "admin" });
  pastWeekFlagsState = { canAddPastWeek: false, canEditPastWeek: false, loaded: true };
  mockUpdateKPIMutate.mockClear();
  mockUpdateWeeklyMutate.mockClear();
  mockAddNoteMutate.mockClear();
});

function renderModal(kpi: KPIRow = buildKPI(), initialTab: "edit" | "updates" | "stats" = "updates") {
  return render(
    <TestProviders>
      <LogModal kpi={kpi} onClose={vi.fn()} onRefresh={vi.fn()} initialTab={initialTab} />
    </TestProviders>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("LogModal — modal chrome", () => {
  it("renders the KPI name in the header and the three tabs", () => {
    renderModal();
    expect(screen.getByText("Test KPI")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stats" })).toBeInTheDocument();
  });

  it("calls onClose when the Cancel button is clicked", () => {
    const onClose = vi.fn();
    render(
      <TestProviders>
        <LogModal kpi={buildKPI()} onClose={onClose} onRefresh={vi.fn()} initialTab="updates" />
      </TestProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("LogModal — bug regressions", () => {
  it("regression: bug #19 — Updates tab still shows historical Value for weeks that lost their target", () => {
    // Build a KPI where weekly target for w1 is 0 but a historical value (5) exists
    const kpi = buildKPI({
      weeklyTargets: { ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [String(i + 1), i < 3 ? 0 : 8])) },
      weeklyValues: [{ weekNumber: 1, value: 5, notes: "kept" }],
    });
    renderModal(kpi, "updates");
    // The historical value 5 must still be present in the DOM (not cleared by bug #18 fix)
    const valueInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]');
    const w1Input = Array.from(valueInputs).find(i => i.value === "5");
    expect(w1Input).toBeDefined();
    expect(w1Input?.readOnly).toBe(true);
  });
});
