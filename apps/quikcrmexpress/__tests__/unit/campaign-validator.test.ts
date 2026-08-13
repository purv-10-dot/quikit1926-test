import { describe, expect, it } from "vitest";
import { buildCampaignConfig, createCampaignSchema } from "@/lib/validators/campaign";

describe("createCampaignSchema", () => {
  it("requires a name", () => {
    const r = createCampaignSchema.safeParse({ name: "" });
    expect(r.success).toBe(false);
  });

  it("rejects end date before start date", () => {
    const r = createCampaignSchema.safeParse({
      name: "Test",
      startDate: "2026-06-01",
      endDate: "2026-05-01",
    });
    expect(r.success).toBe(false);
  });
});

describe("buildCampaignConfig", () => {
  it("stores budget and description in config", () => {
    expect(
      buildCampaignConfig({
        budget: 50000,
        description: "Festive promo",
      }),
    ).toEqual({
      budget: 50000,
      budgetCurrency: "INR",
      description: "Festive promo",
    });
  });
});
