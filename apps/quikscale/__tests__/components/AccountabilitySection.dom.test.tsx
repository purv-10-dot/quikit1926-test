// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccountabilitySection } from "@/app/(dashboard)/opsp/components/AccountabilitySection";
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
    coreValues: "",
    purpose: "",
    actions: ["", "", "", "", ""],
    profitPerX: "",
    bhag: "",
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
    kpiAccountability: Array.from({ length: 5 }, () => ({
      kpi: "",
      goal: "",
    })),
    quarterlyPriorities: Array.from({ length: 5 }, () => ({
      priority: "",
      dueDate: "",
    })),
    criticalNumAcct: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumAcct: { title: "", bullets: ["", "", "", ""] },
    trends: ["", "", "", "", "", ""],
    ...partial,
  };
}

describe("AccountabilitySection", () => {
  it("renders the section heading and both tables with 5 rows each", () => {
    const form = buildForm();
    const { container } = render(
      <AccountabilitySection
        form={form}
        set={vi.fn()}
        onExpandKpiAcct={() => {}}
        onExpandQPriorities={() => {}}
      />,
    );
    expect(screen.getByText("YOUR ACCOUNTABILITY")).toBeInTheDocument();
    expect(screen.getAllByText(/Quarterly Priorities/).length).toBeGreaterThan(0);
    // KPI table header cells
    expect(screen.getByText("KPIs")).toBeInTheDocument();
    expect(screen.getByText("Goal")).toBeInTheDocument();
    // 10 "S.no." zero-padded cells (5 per table)
    const snoCells = container.querySelectorAll("td.text-center.w-12");
    expect(snoCells.length).toBe(10);
  });

  it("invokes `set('kpiAccountability', ...)` when a KPI input changes", () => {
    const setMock = vi.fn();
    const form = buildForm({
      kpiAccountability: [
        { kpi: "Revenue KPI", goal: "100" },
        { kpi: "", goal: "" },
        { kpi: "", goal: "" },
        { kpi: "", goal: "" },
        { kpi: "", goal: "" },
      ],
    });
    const { container } = render(
      <AccountabilitySection
        form={form}
        set={setMock}
        onExpandKpiAcct={() => {}}
        onExpandQPriorities={() => {}}
      />,
    );
    const kpiInput = container.querySelector(
      'input[value="Revenue KPI"]',
    ) as HTMLInputElement;
    fireEvent.change(kpiInput, { target: { value: "Revenue Growth" } });
    expect(setMock).toHaveBeenCalledWith(
      "kpiAccountability",
      expect.arrayContaining([
        expect.objectContaining({ kpi: "Revenue Growth", goal: "100" }),
      ]),
    );
  });

  it("invokes `set('quarterlyPriorities', ...)` when a priority text input changes", () => {
    const setMock = vi.fn();
    const form = buildForm({
      quarterlyPriorities: [
        { priority: "Onboard 10 customers", dueDate: "" },
        { priority: "", dueDate: "" },
        { priority: "", dueDate: "" },
        { priority: "", dueDate: "" },
        { priority: "", dueDate: "" },
      ],
    });
    const { container } = render(
      <AccountabilitySection
        form={form}
        set={setMock}
        onExpandKpiAcct={() => {}}
        onExpandQPriorities={() => {}}
      />,
    );
    const input = container.querySelector(
      'input[value="Onboard 10 customers"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Onboard 20 customers" } });
    expect(setMock).toHaveBeenCalledWith(
      "quarterlyPriorities",
      expect.arrayContaining([
        expect.objectContaining({ priority: "Onboard 20 customers" }),
      ]),
    );
  });

  it("invokes `set('quarterlyPriorities', ...)` when the due-date input changes", () => {
    const setMock = vi.fn();
    const form = buildForm();
    const { container } = render(
      <AccountabilitySection
        form={form}
        set={setMock}
        onExpandKpiAcct={() => {}}
        onExpandQPriorities={() => {}}
      />,
    );
    const dateInput = container.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    fireEvent.change(dateInput, { target: { value: "2026-06-30" } });
    expect(setMock).toHaveBeenCalledWith(
      "quarterlyPriorities",
      expect.arrayContaining([
        expect.objectContaining({ dueDate: "2026-06-30" }),
      ]),
    );
  });

  it("renders a formatted due-date label when dueDate is set", () => {
    const form = buildForm({
      quarterlyPriorities: [
        { priority: "P1", dueDate: "2026-06-30" },
        { priority: "", dueDate: "" },
        { priority: "", dueDate: "" },
        { priority: "", dueDate: "" },
        { priority: "", dueDate: "" },
      ],
    });
    render(
      <AccountabilitySection
        form={form}
        set={vi.fn()}
        onExpandKpiAcct={() => {}}
        onExpandQPriorities={() => {}}
      />,
    );
    // en-GB format: "30 Jun 2026"
    expect(screen.getByText(/30 Jun 2026/)).toBeInTheDocument();
  });

  it("fires onExpandKpiAcct and onExpandQPriorities from their maximize buttons", () => {
    const onExpandKpiAcct = vi.fn();
    const onExpandQPriorities = vi.fn();
    const form = buildForm();
    const { container } = render(
      <AccountabilitySection
        form={form}
        set={vi.fn()}
        onExpandKpiAcct={onExpandKpiAcct}
        onExpandQPriorities={onExpandQPriorities}
      />,
    );
    const expandButtons = container.querySelectorAll('button[data-expand="true"]');
    expect(expandButtons.length).toBe(2);
    fireEvent.click(expandButtons[0]);
    fireEvent.click(expandButtons[1]);
    expect(onExpandKpiAcct).toHaveBeenCalledTimes(1);
    expect(onExpandQPriorities).toHaveBeenCalledTimes(1);
  });
});
