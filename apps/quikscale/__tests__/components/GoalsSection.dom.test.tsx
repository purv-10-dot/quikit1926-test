// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoalsSection } from "@/app/(dashboard)/opsp/components/GoalsSection";
import type { FormData } from "@/app/(dashboard)/opsp/hooks/useOPSPForm";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function buildForm(partial: Partial<FormData> = {}): FormData {
  return {
    year: 2026,
    quarter: "Q1",
    targetYears: 5,
    status: "draft",
    employees: ["", "", ""],
    customers: ["", "", ""],
    shareholders: ["", "", ""],
    coreValues: "",
    purpose: "",
    actions: ["", "", "", "", ""],
    profitPerX: "",
    bhag: "",
    targetRows: Array.from({ length: 5 }, () => ({
      category: "",
      projected: "",
      y1: "",
      y2: "",
      y3: "",
      y4: "",
      y5: "",
    })),
    sandbox: "",
    keyThrusts: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    brandPromiseKPIs: "",
    brandPromise: "",
    goalRows: Array.from({ length: 6 }, () => ({
      category: "",
      projected: "",
      q1: "",
      q2: "",
      q3: "",
      q4: "",
    })),
    keyInitiatives: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    criticalNumGoals: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumGoals: { title: "", bullets: ["", "", "", ""] },
    processItems: ["", "", ""],
    weaknesses: ["", "", ""],
    makeBuy: ["", "", ""],
    sell: ["", "", ""],
    recordKeeping: ["", "", ""],
    actionsQtr: [],
    rocks: [],
    criticalNumProcess: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumProcess: { title: "", bullets: ["", "", "", ""] },
    theme: "",
    scoreboardDesign: "",
    celebration: "",
    reward: "",
    kpiAccountability: [],
    quarterlyPriorities: [],
    criticalNumAcct: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumAcct: { title: "", bullets: ["", "", "", ""] },
    trends: ["", "", "", "", "", ""],
    ...partial,
  };
}

describe("GoalsSection", () => {
  it("renders Goals heading and all 6 goal + 5 initiative rows", () => {
    const form = buildForm();
    const { container } = wrap(
      <GoalsSection
        form={form}
        set={vi.fn()}
        onExpandGoals={() => {}}
        onExpandKeyInitiatives={() => {}}
      />,
    );
    expect(screen.getByText(/GOALS \(1 YR\.\)/)).toBeInTheDocument();
    expect(screen.getByText(/Key Initiatives/i)).toBeInTheDocument();
    // 5 key initiative index labels (01-05); goalRows don't render index spans
    const indexSpans = Array.from(
      container.querySelectorAll("span.w-5.flex-shrink-0"),
    ).map((el) => el.textContent);
    expect(indexSpans).toEqual(
      expect.arrayContaining(["01", "02", "03", "04", "05"]),
    );
  });

  it("shows locked category rows when target rows inherit into goals", () => {
    const form = buildForm({
      targetRows: [
        {
          category: "Revenue",
          projected: "$10M",
          y1: "$2M",
          y2: "",
          y3: "",
          y4: "",
          y5: "",
        },
        ...Array.from({ length: 4 }, () => ({
          category: "",
          projected: "",
          y1: "",
          y2: "",
          y3: "",
          y4: "",
          y5: "",
        })),
      ],
      goalRows: [
        {
          category: "Revenue",
          projected: "$3M",
          q1: "",
          q2: "",
          q3: "",
          q4: "",
        },
        ...Array.from({ length: 5 }, () => ({
          category: "",
          projected: "",
          q1: "",
          q2: "",
          q3: "",
          q4: "",
        })),
      ],
    });
    const { container } = wrap(
      <GoalsSection
        form={form}
        set={vi.fn()}
        onExpandGoals={() => {}}
        onExpandKeyInitiatives={() => {}}
      />,
    );
    // A Lock icon should appear once inherited — the section renders 2 per inherited row (category + projected)
    const lockIcons = container.querySelectorAll("svg.lucide-lock");
    expect(lockIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("fires onExpandGoals when the Goals maximize button is clicked", () => {
    const onExpandGoals = vi.fn();
    const form = buildForm();
    const { container } = wrap(
      <GoalsSection
        form={form}
        set={vi.fn()}
        onExpandGoals={onExpandGoals}
        onExpandKeyInitiatives={() => {}}
      />,
    );
    const expandButtons = container.querySelectorAll('button[data-expand="true"]');
    fireEvent.click(expandButtons[0]);
    expect(onExpandGoals).toHaveBeenCalledTimes(1);
  });

  it("invokes `set('keyInitiatives', ...)` with updated desc when an initiative input changes", () => {
    const setMock = vi.fn();
    const form = buildForm({
      keyInitiatives: [
        { desc: "First initiative", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
      ],
    });
    const { container } = wrap(
      <GoalsSection
        form={form}
        set={setMock}
        onExpandGoals={() => {}}
        onExpandKeyInitiatives={() => {}}
      />,
    );
    const input = container.querySelector(
      'input[value="First initiative"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Updated initiative" } });
    expect(setMock).toHaveBeenCalledWith(
      "keyInitiatives",
      expect.arrayContaining([
        expect.objectContaining({ desc: "Updated initiative" }),
      ]),
    );
  });
});
