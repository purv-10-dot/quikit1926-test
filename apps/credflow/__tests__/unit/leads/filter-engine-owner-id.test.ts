import { describe, expect, it } from "vitest";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { LEAD_FILTER_FIELDS } from "@/lib/lead-filter-fields";

/**
 * Build 2 — the Owner filter targets the scalar Lead.ownerId column (a select),
 * NOT the display-only ownerName text column.
 *
 * Background: the old filter keyed on ownerName (type text). Two bugs followed:
 *   1. The toolbar's always-on ownerName quick-filter stripped the advanced
 *      modal's owner condition every render, so every owner returned the same
 *      (all-leads) count.
 *   2. Matching on a display name collided on duplicate names and broke on rename.
 * Fix: Owner is now { field: "ownerId", type: "select" }; the picker's option
 * VALUES are ownerIds. The engine's existing scalar `select` branch handles it
 * (verified on dev data: eq/in/plain all return the owner's real count).
 *
 * These lock the field definition + the emitted Prisma shape so a regression
 * back to ownerName is caught here.
 */
describe("Owner filter targets ownerId (Build 2)", () => {
  it("Owner is defined as an ownerId select field, not ownerName text", () => {
    const owner = LEAD_FILTER_FIELDS.find((f) => f.label === "Owner");
    expect(owner).toBeDefined();
    expect(owner!.field).toBe("ownerId");
    expect(owner!.type).toBe("select");
    // The old fragile text field must be gone.
    expect(LEAD_FILTER_FIELDS.some((f) => f.field === "ownerName")).toBe(false);
  });

  it("eq emits equals on ownerId (single-select / 'Mine only')", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "ownerId", operator: "eq", value: "b9588135-owner-id" }],
    });
    expect(where).toEqual({
      ownerId: { equals: "b9588135-owner-id", mode: "insensitive" },
    });
  });

  it("neq negates equals on ownerId", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "ownerId", operator: "neq", value: "owner-x" }],
    });
    expect(where).toEqual({
      NOT: { ownerId: { equals: "owner-x", mode: "insensitive" } },
    });
  });

  it("in emits a clean IN over ownerIds (multi-select)", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "ownerId", operator: "in", value: ["owner-a", "owner-b"] }],
    });
    expect(where).toEqual({
      ownerId: { in: ["owner-a", "owner-b"] },
    });
  });

  it("notIn negates the IN over ownerIds", () => {
    const where = translateFilterToPrismaWhere({
      matchMode: "ALL",
      conditions: [{ field: "ownerId", operator: "notIn", value: ["owner-a"] }],
    });
    expect(where).toEqual({
      NOT: { ownerId: { in: ["owner-a"] } },
    });
  });
});
