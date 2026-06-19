// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObjectivesSection } from "@/app/(dashboard)/opsp/components/ObjectivesSection";
import type { FormData } from "@/app/(dashboard)/opsp/hooks/useOPSPForm";

function buildForm(partial: Partial<FormData> = {}): FormData {
  return {
    year: 2026,
    quarter: "Q1",
    targetYears: 5,
    status: "draft",
    employees: ["", "", ""],
    customers: ["", "", ""],
    shareholders: ["", "", ""],
    coreValues: "<p>Integrity</p>",
    purpose: "<p>Help customers scale</p>",
    actions: ["Ship weekly", "Talk to users", "Review KPIs", "", ""],
    profitPerX: "Profit per account",
    bhag: "$100M ARR by 2030",
    targetRows: [],
    sandbox: "",
    keyThrusts: [],
    brandPromiseKPIs: "",
    brandPromise: "",
    goalRows: [],
    keyInitiatives: [],
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

describe("ObjectivesSection", () => {
  it("renders the Core Values and Purpose card headings and actions rows", () => {
    const form = buildForm();
    render(
      <ObjectivesSection form={form} set={vi.fn()} setArr={vi.fn()} />,
    );

    expect(screen.getByText(/core values\/beliefs/i)).toBeInTheDocument();
    expect(screen.getByText("PURPOSE")).toBeInTheDocument();
    // 5 action rows rendered with zero-padded numbers (01..05)
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("05")).toBeInTheDocument();
    // Profit per X label
    expect(screen.getByText(/profit per x/i)).toBeInTheDocument();
    // BHAG label (uppercase with ® suffix) — may appear in multiple places
    expect(screen.getAllByText(/BHAG/i).length).toBeGreaterThan(0);
  });

  it("fires the `set` callback when Profit per X input changes", () => {
    const set = vi.fn();
    const form = buildForm({ profitPerX: "original" });
    const { container } = render(
      <ObjectivesSection form={form} set={set} setArr={vi.fn()} />,
    );
    // Profit per X is the only plain input value === "original"
    const input = container.querySelector(
      'input[value="original"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: "Profit per widget" } });
    expect(set).toHaveBeenCalledWith("profitPerX", "Profit per widget");
  });

  it("fires `setArr` with the action index when an action input changes", () => {
    const setArr = vi.fn();
    const form = buildForm({
      actions: ["Ship weekly", "Talk to users", "", "", ""],
    });
    const { container } = render(
      <ObjectivesSection form={form} set={vi.fn()} setArr={setArr} />,
    );
    const actionInput = container.querySelector(
      'input[value="Ship weekly"]',
    ) as HTMLInputElement;
    expect(actionInput).toBeTruthy();
    fireEvent.change(actionInput, { target: { value: "Ship daily" } });
    expect(setArr).toHaveBeenCalledWith("actions", 0, "Ship daily");
  });

  it("renders five action rows matching form.actions length", () => {
    const form = buildForm();
    const { container } = render(
      <ObjectivesSection form={form} set={vi.fn()} setArr={vi.fn()} />,
    );
    // Count the action rows specifically — each has a "NN" index span
    const indices = Array.from(
      container.querySelectorAll("span.w-5.flex-shrink-0"),
    ).map((el) => el.textContent);
    expect(indices).toContain("01");
    expect(indices).toContain("02");
    expect(indices).toContain("03");
    expect(indices).toContain("04");
    expect(indices).toContain("05");
  });
});
