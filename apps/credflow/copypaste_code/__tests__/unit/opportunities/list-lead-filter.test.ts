import { describe, expect, it } from "vitest";
import { buildOpportunityListWhere } from "@/lib/services/opportunities/opportunity-service";
import { listQuerySchema } from "@/lib/services/opportunities/validators";

describe("opportunity list by leadId", () => {
  it("parses leadId query param", () => {
    const parsed = listQuerySchema.safeParse({ leadId: "lead_abc", pageSize: 100 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.leadId).toBe("lead_abc");
  });

  it("filters where clause by leadId", () => {
    const where = buildOpportunityListWhere({
      tenantId: "t1",
      trashed: false,
      leadId: "lead_abc",
      aclFilter: null,
    });
    expect(where).toMatchObject({ tenantId: "t1", leadId: "lead_abc", deletedAt: null });
  });
});
