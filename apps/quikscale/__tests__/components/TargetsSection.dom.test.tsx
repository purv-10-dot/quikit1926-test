// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TargetsSection } from "@/app/(dashboard)/opsp/components/TargetsSection";
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
    sandbox: "sandbox text",
    keyThrusts: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    brandPromiseKPIs: "brand kpi",
    brandPromise: "brand promise",
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

describe("TargetsSection", () => {
  it("renders all 5 target rows and the 5 key-thrust rows", () => {
    const form = buildForm();
    const { container } = wrap(
      <TargetsSection
        form={form}
        set={vi.fn()}
        onExpandTargets={() => {}}
        onExpandKeyThrusts={() => {}}
      />,
    );

    // Header label
    expect(screen.getByText(/TARGETS \(3–5 YRS\.\)/)).toBeInTheDocument();
    // Sandbox label (may also match the field value, so assert >= 1)
    expect(screen.getAllByText(/sandbox/i).length).toBeGreaterThan(0);
    // Brand Promise labels
    expect(screen.getByText(/Brand Promise KPIs/i)).toBeInTheDocument();
    expect(screen.getByText(/Key Thrusts\/Capabilities/i)).toBeInTheDocument();
    // 5 key thrust rows with indices 01-05
    const indexSpans = Array.from(
      container.querySelectorAll("span.w-5.flex-shrink-0"),
    ).map((el) => el.textContent);
    expect(indexSpans).toEqual(
      expect.arrayContaining(["01", "02", "03", "04", "05"]),
    );
  });

  it("fires onExpandTargets when the targets maximize button is clicked", () => {
    const onExpandTargets = vi.fn();
    const form = buildForm();
    const { container } = wrap(
      <TargetsSection
        form={form}
        set={vi.fn()}
        onExpandTargets={onExpandTargets}
        onExpandKeyThrusts={() => {}}
      />,
    );
    const expandButtons = container.querySelectorAll('button[data-expand="true"]');
    expect(expandButtons.length).toBe(2); // targets + key thrusts
    fireEvent.click(expandButtons[0]);
    expect(onExpandTargets).toHaveBeenCalledTimes(1);
  });

  it("fires onExpandKeyThrusts when the key-thrusts maximize button is clicked", () => {
    const onExpandKeyThrusts = vi.fn();
    const form = buildForm();
    const { container } = wrap(
      <TargetsSection
        form={form}
        set={vi.fn()}
        onExpandTargets={() => {}}
        onExpandKeyThrusts={onExpandKeyThrusts}
      />,
    );
    const expandButtons = container.querySelectorAll('button[data-expand="true"]');
    fireEvent.click(expandButtons[1]);
    expect(onExpandKeyThrusts).toHaveBeenCalledTimes(1);
  });

  it("invokes `set('sandbox', ...)` when the Sandbox textarea changes", () => {
    const setMock = vi.fn();
    const form = buildForm({ sandbox: "old sandbox" });
    const { container } = wrap(
      <TargetsSection
        form={form}
        set={setMock}
        onExpandTargets={() => {}}
        onExpandKeyThrusts={() => {}}
      />,
    );
    const textarea = container.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("old sandbox");
    fireEvent.change(textarea, { target: { value: "new sandbox" } });
    expect(setMock).toHaveBeenCalledWith("sandbox", "new sandbox");
  });

  it("invokes `set('keyThrusts', ...)` with updated desc when a capability input changes", () => {
    const setMock = vi.fn();
    const form = buildForm({
      keyThrusts: [
        { desc: "First thrust", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
      ],
    });
    const { container } = wrap(
      <TargetsSection
        form={form}
        set={setMock}
        onExpandTargets={() => {}}
        onExpandKeyThrusts={() => {}}
      />,
    );
    const input = container.querySelector(
      'input[value="First thrust"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Updated thrust" } });
    expect(setMock).toHaveBeenCalledWith(
      "keyThrusts",
      expect.arrayContaining([
        expect.objectContaining({ desc: "Updated thrust" }),
      ]),
    );
  });
});
