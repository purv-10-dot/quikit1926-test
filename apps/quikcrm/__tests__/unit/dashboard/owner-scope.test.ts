import { describe, expect, it } from "vitest";
import { spreadOwnerFilter, type OwnerScope } from "@/lib/services/dashboard/owner-scope";

const scope: OwnerScope = {
  userId: "user-1",
  names: ["Jain Sahab"],
};

describe("spreadOwnerFilter", () => {
  it("returns empty when scope is null", () => {
    expect(spreadOwnerFilter(null)).toEqual({});
  });

  it("matches ownerId and ownerName fallbacks for leads", () => {
    const where = spreadOwnerFilter(scope);
    expect(where).toHaveProperty("OR");
    const or = where.OR as Record<string, unknown>[];
    expect(or).toContainEqual({ ownerId: "user-1" });
    expect(or).toContainEqual({
      ownerId: null,
      ownerName: { equals: "Jain Sahab", mode: "insensitive" },
    });
    expect(or).toContainEqual({
      ownerName: { equals: "Jain Sahab", mode: "insensitive" },
    });
  });

  it("uses agentUserId for call logs", () => {
    const where = spreadOwnerFilter(scope, { idKey: "agentUserId", nameKey: "ownerName" });
    const or = where.OR as Record<string, unknown>[];
    expect(or[0]).toEqual({ agentUserId: "user-1" });
  });

  it("uses assignedToUserId only when name column is absent", () => {
    const where = spreadOwnerFilter(scope, { idKey: "assignedToUserId", nameKey: null });
    expect(where).toEqual({ OR: [{ assignedToUserId: "user-1" }] });
  });
});
