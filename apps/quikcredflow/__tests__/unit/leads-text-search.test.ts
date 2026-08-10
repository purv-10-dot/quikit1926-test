import { describe, expect, it } from "vitest";
import { buildLeadTextSearchWhere } from "@/lib/services/leads/text-search";

describe("buildLeadTextSearchWhere", () => {
  it("returns null for blank input", () => {
    expect(buildLeadTextSearchWhere("")).toBeNull();
    expect(buildLeadTextSearchWhere("   ")).toBeNull();
  });

  it("ORs across name, email, company, and other toolbar fields", () => {
    const where = buildLeadTextSearchWhere("acme@co.com");
    expect(where).not.toBeNull();
    const or = where!.OR as Array<Record<string, { contains: string; mode: string }>>;
    const fields = or.map((clause) => Object.keys(clause)[0]);
    expect(fields).toContain("name");
    expect(fields).toContain("email");
    expect(fields).toContain("company");
    expect(or[0]!.name.contains).toBe("acme@co.com");
    expect(or[0]!.name.mode).toBe("insensitive");
  });
});
