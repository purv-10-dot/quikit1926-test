// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionsSection } from "@/app/(dashboard)/opsp/components/ActionsSection";
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
    targetRows: [],
    sandbox: "",
    keyThrusts: [],
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
    keyInitiatives: [],
    criticalNumGoals: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumGoals: { title: "", bullets: ["", "", "", ""] },
    processItems: ["", "", ""],
    weaknesses: ["", "", ""],
    makeBuy: ["", "", ""],
    sell: ["", "", ""],
    recordKeeping: ["", "", ""],
    actionsQtr: Array.from({ length: 6 }, () => ({
      category: "",
      projected: "",
      m1: "",
      m2: "",
      m3: "",
    })),
    rocks: Array.from({ length: 5 }, () => ({ desc: "", owner: "" })),
    criticalNumProcess: { title: "", bullets: ["", "", "", ""] },
    balancingCritNumProcess: { title: "", bullets: ["", "", "", ""] },
    theme: "initial theme",
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

describe("ActionsSection", () => {
  it("renders ACTIONS, Rocks, and Theme headings plus 5 rocks rows", () => {
    const form = buildForm();
    const { container } = wrap(
      <ActionsSection
        form={form}
        set={vi.fn()}
        onExpandActions={() => {}}
        onExpandRocks={() => {}}
      />,
    );
    expect(screen.getByText("ACTIONS (QTR)")).toBeInTheDocument();
    expect(screen.getByText(/Rocks/)).toBeInTheDocument();
    expect(screen.getByText("THEME")).toBeInTheDocument();
    expect(screen.getByText(/Scoreboard Design/i)).toBeInTheDocument();
    expect(screen.getByText(/Celebration/i)).toBeInTheDocument();
    expect(screen.getByText(/Reward/)).toBeInTheDocument();
    // 5 rocks rows
    const indexSpans = Array.from(
      container.querySelectorAll("span.w-5.flex-shrink-0"),
    )
      .map((el) => el.textContent)
      .filter((t) => /^0\d$/.test(t ?? ""));
    expect(new Set(indexSpans)).toEqual(
      new Set(["01", "02", "03", "04", "05"]),
    );
  });

  it("shows locked rows when goalRows inherit into actionsQtr for the current quarter", () => {
    const form = buildForm({
      quarter: "Q1",
      goalRows: [
        {
          category: "Revenue",
          projected: "$10M",
          q1: "$2M",
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
      actionsQtr: [
        {
          category: "Revenue",
          projected: "$500K",
          m1: "",
          m2: "",
          m3: "",
        },
        ...Array.from({ length: 5 }, () => ({
          category: "",
          projected: "",
          m1: "",
          m2: "",
          m3: "",
        })),
      ],
    });
    const { container } = wrap(
      <ActionsSection
        form={form}
        set={vi.fn()}
        onExpandActions={() => {}}
        onExpandRocks={() => {}}
      />,
    );
    // Lock icons appear on the first row (category + projected columns)
    const lockIcons = container.querySelectorAll("svg.lucide-lock");
    expect(lockIcons.length).toBeGreaterThanOrEqual(2);
  });

  it("invokes `set('theme', ...)` when the theme textarea changes", () => {
    const setMock = vi.fn();
    const form = buildForm();
    const { container } = wrap(
      <ActionsSection
        form={form}
        set={setMock}
        onExpandActions={() => {}}
        onExpandRocks={() => {}}
      />,
    );
    const theme = container.querySelector(
      'textarea',
    ) as HTMLTextAreaElement;
    expect(theme.value).toBe("initial theme");
    fireEvent.change(theme, { target: { value: "New theme" } });
    expect(setMock).toHaveBeenCalledWith("theme", "New theme");
  });

  it("invokes `set('rocks', ...)` with updated desc when a rocks input changes", () => {
    const setMock = vi.fn();
    const form = buildForm({
      rocks: [
        { desc: "Rock one", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
        { desc: "", owner: "" },
      ],
    });
    const { container } = wrap(
      <ActionsSection
        form={form}
        set={setMock}
        onExpandActions={() => {}}
        onExpandRocks={() => {}}
      />,
    );
    const input = container.querySelector(
      'input[value="Rock one"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Rock updated" } });
    expect(setMock).toHaveBeenCalledWith(
      "rocks",
      expect.arrayContaining([
        expect.objectContaining({ desc: "Rock updated" }),
      ]),
    );
  });

  it("fires onExpandActions and onExpandRocks from the respective maximize buttons", () => {
    const onExpandActions = vi.fn();
    const onExpandRocks = vi.fn();
    const form = buildForm();
    const { container } = wrap(
      <ActionsSection
        form={form}
        set={vi.fn()}
        onExpandActions={onExpandActions}
        onExpandRocks={onExpandRocks}
      />,
    );
    const expandButtons = container.querySelectorAll('button[data-expand="true"]');
    expect(expandButtons.length).toBe(2);
    fireEvent.click(expandButtons[0]);
    fireEvent.click(expandButtons[1]);
    expect(onExpandActions).toHaveBeenCalledTimes(1);
    expect(onExpandRocks).toHaveBeenCalledTimes(1);
  });
});
