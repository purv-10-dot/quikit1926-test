import { describe, expect, it } from "vitest";
import {
  buildContactSearchOr,
  translateContactFilterToPrismaWhere,
} from "@/lib/services/contacts/filter-engine";

describe("contacts filter-engine", () => {
  it("buildContactSearchOr returns insensitive contains on standard fields", () => {
    const or = buildContactSearchOr("acme");
    expect(or.length).toBe(6);
    expect(or[0]).toMatchObject({
      firstName: { contains: "acme", mode: "insensitive" },
    });
  });

  it("translates select eq with case-insensitive mode", () => {
    const where = translateContactFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "source", operator: "eq", value: "Web" }],
    });
    expect(where).toMatchObject({
      source: { equals: "Web", mode: "insensitive" },
    });
  });
});
