// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OPSPPreview } from "@/app/(dashboard)/opsp/components/OPSPPreview";
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
    targetRows: [
      { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
      { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
      { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
      { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
      { category: "", projected: "", y1: "", y2: "", y3: "", y4: "", y5: "" },
    ],
    sandbox: "",
    keyThrusts: [
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
    ],
    brandPromiseKPIs: "",
    brandPromise: "",
    goalRows: [
      { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
      { category: "", projected: "", q1: "", q2: "", q3: "", q4: "" },
    ],
    keyInitiatives: [
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
    ],
    criticalNumGoals: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumGoals: { title: "", bullets: ["", "", "", ""] },
    processItems: ["", "", ""],
    weaknesses: ["", "", ""],
    makeBuy: ["", "", ""],
    sell: ["", "", ""],
    recordKeeping: ["", "", ""],
    actionsQtr: [
      { category: "", projected: "", m1: "", m2: "", m3: "" },
      { category: "", projected: "", m1: "", m2: "", m3: "" },
      { category: "", projected: "", m1: "", m2: "", m3: "" },
      { category: "", projected: "", m1: "", m2: "", m3: "" },
      { category: "", projected: "", m1: "", m2: "", m3: "" },
      { category: "", projected: "", m1: "", m2: "", m3: "" },
    ],
    rocks: [
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
      { desc: "", owner: "" },
    ],
    criticalNumProcess: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumProcess: { title: "", bullets: ["", "", "", ""] },
    theme: "",
    scoreboardDesign: "",
    celebration: "",
    reward: "",
    kpiAccountability: [
      { kpi: "", goal: "" },
      { kpi: "", goal: "" },
      { kpi: "", goal: "" },
      { kpi: "", goal: "" },
      { kpi: "", goal: "" },
    ],
    quarterlyPriorities: [
      { priority: "", dueDate: "" },
      { priority: "", dueDate: "" },
      { priority: "", dueDate: "" },
      { priority: "", dueDate: "" },
      { priority: "", dueDate: "" },
    ],
    criticalNumAcct: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumAcct: { title: "", bullets: ["", "", "", ""] },
    trends: ["", "", "", "", "", ""],
    ...partial,
  };
}

describe("OPSPPreview", () => {
  it("renders nothing when `open` is false", () => {
    const { container } = render(
      <OPSPPreview open={false} onClose={vi.fn()} form={buildForm()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the toolbar header with year and quarter when open", () => {
    const form = buildForm({ year: 2027, quarter: "Q3" });
    render(<OPSPPreview open={true} onClose={vi.fn()} form={form} />);
    expect(screen.getByText(/OPSP Preview/i)).toBeInTheDocument();
    // Year+quarter shows up in both the toolbar header and the page-2 "Date" cell,
    // so use getAllByText to confirm at least one match.
    expect(screen.getAllByText(/2027.*Q3/).length).toBeGreaterThan(0);
  });

  it("renders the core-values and purpose HTML into the preview body", () => {
    const form = buildForm({
      coreValues: "<p>Integrity &amp; Ownership</p>",
      purpose: "<p>Empower SMBs</p>",
    });
    const { container } = render(
      <OPSPPreview open={true} onClose={vi.fn()} form={form} />,
    );
    // sanitizeHtml should leave the <p>…</p> content intact
    expect(container.innerHTML).toContain("Integrity");
    expect(container.innerHTML).toContain("Empower SMBs");
  });

  it("renders target rows that have a category", () => {
    const form = buildForm({
      targetRows: [
        {
          category: "Revenue",
          projected: "$10M",
          y1: "",
          y2: "",
          y3: "",
          y4: "",
          y5: "",
        },
        {
          category: "Headcount",
          projected: "50",
          y1: "",
          y2: "",
          y3: "",
          y4: "",
          y5: "",
        },
        // empty row — should be filtered out
        {
          category: "",
          projected: "",
          y1: "",
          y2: "",
          y3: "",
          y4: "",
          y5: "",
        },
      ],
    });
    render(<OPSPPreview open={true} onClose={vi.fn()} form={form} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("$10M")).toBeInTheDocument();
    expect(screen.getByText("Headcount")).toBeInTheDocument();
  });

  it("renders goal rows that have a category", () => {
    const form = buildForm({
      goalRows: [
        {
          category: "ARR Growth",
          projected: "40%",
          q1: "",
          q2: "",
          q3: "",
          q4: "",
        },
        {
          category: "",
          projected: "",
          q1: "",
          q2: "",
          q3: "",
          q4: "",
        },
      ],
    });
    render(<OPSPPreview open={true} onClose={vi.fn()} form={form} />);
    expect(screen.getByText("ARR Growth")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });

  it("renders owner names resolved from the users list for key initiatives", () => {
    const form = buildForm({
      keyInitiatives: [
        { desc: "Launch EU region", owner: "u-1" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
      ],
    });
    render(
      <OPSPPreview
        open={true}
        onClose={vi.fn()}
        form={form}
        users={[{ id: "u-1", firstName: "Ada", lastName: "Lovelace" }]}
      />,
    );
    expect(screen.getByText("Launch EU region")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("falls back to empty string for unknown owner ids when users list is empty", () => {
    const form = buildForm({
      keyInitiatives: [
        { desc: "Ship onboarding rev", owner: "ghost" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
      ],
    });
    render(
      <OPSPPreview open={true} onClose={vi.fn()} form={form} /* users omitted */ />,
    );
    // Row still renders; owner label falls back to the raw id string.
    expect(screen.getByText("Ship onboarding rev")).toBeInTheDocument();
    expect(screen.getByText("ghost")).toBeInTheDocument();
  });

  it("renders KPI accountability rows with their goals", () => {
    const form = buildForm({
      kpiAccountability: [
        { kpi: "Weekly active users", goal: "10k" },
        { kpi: "NPS", goal: "60" },
        { kpi: "", goal: "" },
        { kpi: "", goal: "" },
        { kpi: "", goal: "" },
      ],
    });
    render(<OPSPPreview open={true} onClose={vi.fn()} form={form} />);
    expect(screen.getByText("Weekly active users")).toBeInTheDocument();
    expect(screen.getByText("10k")).toBeInTheDocument();
    expect(screen.getByText("NPS")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
  });
});
