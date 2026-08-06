import { describe, expect, it } from "vitest";
import {
  formatCampaignBudget,
  serializeCampaign,
} from "@/lib/services/campaigns/serialize";

describe("serializeCampaign", () => {
  it("reads budget and description from config", () => {
    const dto = serializeCampaign({
      id: "c1",
      tenantId: "t1",
      name: "Test",
      status: "Draft",
      type: "Email",
      startDate: null,
      endDate: null,
      config: { budget: 50000, budgetCurrency: "INR", description: "Note" },
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-02"),
    } as never);
    expect(dto.budget).toBe(50000);
    expect(dto.description).toBe("Note");
  });
});

describe("formatCampaignBudget", () => {
  it("formats INR amounts", () => {
    expect(formatCampaignBudget(50000, "INR")).toMatch(/50/);
  });

  it("returns dash when empty", () => {
    expect(formatCampaignBudget(null, "INR")).toBe("—");
  });
});
