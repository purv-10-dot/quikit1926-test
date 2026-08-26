// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as m from "@testing-library/jest-dom/matchers";
import { LeadSummaryCard } from "@/components/leads/lead-summary-card";

beforeAll(() => { expect.extend(m as never); });
afterEach(() => { cleanup(); });

/**
 * ICP display on the Lead Detail sidebar (LeadSummaryCard).
 *
 * Regression guard for a real miss: the ICP was first added only to
 * LeadFormView's "Lead Information" section, which renders inside the DETAILS
 * tab. The Lead Detail page opens on the OVERVIEW tab, so a converted lead
 * showed no ICP anywhere on first load even though CrmLead.icpId was set
 * correctly. The always-visible summary sidebar is the right home for it.
 *
 * Fixture values are copied verbatim from a real converted lead so the assertions
 * reflect production data shapes, not invented ones.
 */
const base = {
  id: "cmshidbif000md9lei6hbmx8d",
  name: "Asha Sharma", email: null, phone: null, mobile: null,
  company: "Cisco", industry: null, stage: "New", status: "Open",
  score: 55, ownerName: "adars -", source: "LinkedIn", jobTitle: "CEO XBOX",
  updatedAt: "2026-08-06T12:44:55.795Z",
};

describe("LeadSummaryCard — ICP (real data)", () => {
  it("renders the ICP name for the actual converted lead", () => {
    render(<LeadSummaryCard lead={{ ...base,
      icpId: "cmshg9s21000iw6izcgvkatln",
      icp: { id: "cmshg9s21000iw6izcgvkatln", name: "Mid-Market Manufacturing Companies" },
    }} />);
    expect(screen.getByText("ICP")).toBeInTheDocument();
    expect(screen.getByText("Mid-Market Manufacturing Companies")).toBeInTheDocument();
  });

  it("renders 'Not Assigned' when the lead has no ICP", () => {
    render(<LeadSummaryCard lead={{ ...base, icpId: null, icp: null }} />);
    expect(screen.getByText("ICP")).toBeInTheDocument();
    expect(screen.getByText("Not Assigned")).toBeInTheDocument();
  });

  it("still shows the ICP label on a legacy lead where the props are absent", () => {
    render(<LeadSummaryCard lead={base} />);
    expect(screen.getByText("ICP")).toBeInTheDocument();
    expect(screen.getByText("Not Assigned")).toBeInTheDocument();
  });

  it("does NOT render an input or link for the ICP (read-only)", () => {
    const { container } = render(<LeadSummaryCard lead={{ ...base,
      icpId: "x", icp: { id: "x", name: "Mid-Market Manufacturing Companies" } }} />);
    const cell = screen.getByText("Mid-Market Manufacturing Companies");
    expect(cell.tagName.toLowerCase()).toBe("span");
    expect(container.querySelector('input[name*="icp" i]')).toBeNull();
  });
});
