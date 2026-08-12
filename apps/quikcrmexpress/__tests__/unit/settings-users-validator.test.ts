import { describe, expect, it } from "vitest";
import {
  normalizeUserRole,
  updateUserSchema,
  createUserSchema,
} from "@/lib/validators/settings-users";

describe("normalizeUserRole", () => {
  it("maps the legacy DB 'admin' value to the canonical Administrator", () => {
    expect(normalizeUserRole("admin")).toBe("Administrator");
  });

  it("canonicalizes case/separator variants of known roles", () => {
    expect(normalizeUserRole("org_admin")).toBe("Administrator");
    expect(normalizeUserRole("sales manager")).toBe("SalesManager");
    expect(normalizeUserRole("FINANCE")).toBe("FinanceUser");
  });

  it("passes canonical values through unchanged", () => {
    expect(normalizeUserRole("Administrator")).toBe("Administrator");
    expect(normalizeUserRole("SalesUser")).toBe("SalesUser");
  });

  it("returns unknown roles unchanged so the enum still rejects them", () => {
    expect(normalizeUserRole("wizard")).toBe("wizard");
  });
});

describe("updateUserSchema", () => {
  // Regression: editing a user whose membership.role is the seeded legacy
  // "admin" PATCHed role:"admin" and the strict enum 400'd "Validation failed".
  it("accepts the legacy 'admin' role and normalizes it", () => {
    const r = updateUserSchema.safeParse({
      firstName: "Alok",
      lastName: "Emossy",
      email: "salok8644@gmail.com",
      phone: null,
      role: "admin",
      status: "Active",
      permissionTemplateIds: [],
      allowedAccountIds: [],
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("Administrator");
  });

  it("still rejects a genuinely unknown role", () => {
    const r = updateUserSchema.safeParse({ role: "wizard" });
    expect(r.success).toBe(false);
  });
});

describe("createUserSchema", () => {
  it("normalizes alias roles on create too", () => {
    const r = createUserSchema.safeParse({
      firstName: "A",
      lastName: "B",
      email: "a@b.com",
      role: "manager",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.role).toBe("SalesManager");
  });
});
