import { describe, expect, it, vi } from "vitest";
import { buildAccountCommandActions } from "@/lib/accounts/build-account-command-actions";

function build(overrides: Partial<Parameters<typeof buildAccountCommandActions>[0]> = {}) {
  return buildAccountCommandActions({
    onNavigateTab: vi.fn(),
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onAddContact: vi.fn(),
    onAddLead: vi.fn(),
    onNewOpportunity: vi.fn(),
    onAssignLeads: vi.fn(),
    onTask: vi.fn(),
    onLogActivity: vi.fn(),
    onSalesActivity: vi.fn(),
    onAddNote: vi.fn(),
    onViewTrends: vi.fn(),
    onCopyWebsite: vi.fn(),
    canEdit: true,
    canAddContact: true,
    canAddLead: true,
    canNewOpp: true,
    canAssignLeads: true,
    canLogActivity: true,
    hasLeads: true,
    hasWebsite: true,
    isDeleted: false,
    ...overrides,
  });
}

describe("buildAccountCommandActions", () => {
  it("includes notes and score trends commands", () => {
    const labels = build().map((a) => a.label);
    expect(labels).toContain("Add account note");
    expect(labels).toContain("View score trends");
  });
});
