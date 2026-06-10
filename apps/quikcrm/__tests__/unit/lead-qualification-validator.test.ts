import { describe, expect, it } from "vitest";
import { createLeadSchema } from "@/lib/validators/lead";

const basePayload = {
  name: "Acme ERP",
  email: "lead@acme.com",
  mobile: "+919876543210",
  company: "Acme Corp",
  firstName: "Jane",
  lastName: "Doe",
  leadType: "Fixed Project" as const,
  source: "Marketing Lead",
  stage: "New",
  status: "Open",
  ownerId: "user-1",
  requirementDetails: {
    technology: ["Cloud"],
    projectTitle: "ERP rollout",
    projectDescription: "Full implementation",
  },
};

describe("createLeadSchema extended lead form", () => {
  it("requires company, contact names, and lead type", () => {
    const missingCompany = createLeadSchema.safeParse({ ...basePayload, company: "" });
    expect(missingCompany.success).toBe(false);

    const missingType = createLeadSchema.safeParse({ ...basePayload, leadType: undefined });
    expect(missingType.success).toBe(false);
  });

  it("accepts purchase timeline and follow-up fields", () => {
    const ok = createLeadSchema.safeParse({
      ...basePayload,
      purchaseTimeframe: "This Quarter",
      followupPriority: "High",
      followupNotes: "Call back Monday",
    });
    expect(ok.success).toBe(true);
  });
});
