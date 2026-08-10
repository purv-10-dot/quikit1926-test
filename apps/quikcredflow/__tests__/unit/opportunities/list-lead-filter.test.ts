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
      orgId: "t1",
      trashed: false,
      leadId: "lead_abc",
      aclFilter: null,
    });
    expect(where).toMatchObject({ orgId: "t1", leadId: "lead_abc", deletedAt: null });
  });

  it("searches across name, related account.name, and ownerName", () => {
    const where = buildOpportunityListWhere({
      orgId: "t1",
      trashed: false,
      q: "acme",
      aclFilter: null,
    });
    // Search OR is AND-wrapped so it coexists with the ACL OR-group.
    const or = (where as { AND?: Array<{ OR?: unknown[] }> }).AND?.[0]?.OR ?? [];
    expect(or).toEqual([
      { name: { contains: "acme", mode: "insensitive" } },
      { account: { name: { contains: "acme", mode: "insensitive" } } },
      { ownerName: { contains: "acme", mode: "insensitive" } },
    ]);
  });

  it("keeps the search OR distinct from the ACL OR so both apply", () => {
    const aclFilter = {
      OR: [{ accountId: { in: ["a1"] } }, { accountId: null }],
    };
    const where = buildOpportunityListWhere({
      orgId: "t1",
      trashed: false,
      q: "acme",
      aclFilter,
    });
    // The ACL OR-group survives at the top level (not clobbered by search)…
    expect((where as { OR?: unknown[] }).OR).toEqual(aclFilter.OR);
    // …and the search OR-group lives under AND.
    const searchOr = (where as { AND?: Array<{ OR?: unknown[] }> }).AND?.[0]?.OR ?? [];
    expect(searchOr).toHaveLength(3);
  });
});
