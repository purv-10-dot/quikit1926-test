import { describe, expect, it } from "vitest";
import { buildAccountSearchOr, SEARCHABLE_FIELDS } from "@/lib/services/accounts";

describe("buildAccountSearchOr", () => {
  it("includes the newly-added city and state fields", () => {
    expect(SEARCHABLE_FIELDS).toContain("city");
    expect(SEARCHABLE_FIELDS).toContain("state");
  });

  it("builds an insensitive contains clause for every searchable field", () => {
    const ors = buildAccountSearchOr("acme");
    const keys = ors.map((clause) => Object.keys(clause)[0]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "name",
        "segment",
        "ownerName",
        "industry",
        "website",
        "status",
        "annualRevenueDisplay",
        "city",
        "state",
      ]),
    );
    expect(ors).toHaveLength(SEARCHABLE_FIELDS.length);
    const cityClause = ors.find((clause) => "city" in clause) as
      | { city?: { contains?: string; mode?: string } }
      | undefined;
    expect(cityClause?.city).toMatchObject({ contains: "acme", mode: "insensitive" });
  });

  it("escapes regex-significant characters in the query (unchanged behavior)", () => {
    const ors = buildAccountSearchOr("a.b+c");
    const nameClause = ors.find((clause) => "name" in clause) as
      | { name?: { contains?: string } }
      | undefined;
    expect(nameClause?.name?.contains).toBe("a\\.b\\+c");
  });
});
