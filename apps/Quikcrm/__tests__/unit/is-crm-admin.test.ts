import { describe, expect, it } from "vitest";
import { isCrmAdmin, isCrmAdminUser } from "@/lib/auth/is-crm-admin";

describe("isCrmAdmin", () => {
  it("allows org_admin and Administrator", () => {
    expect(isCrmAdmin("org_admin")).toBe(true);
    expect(isCrmAdmin("Administrator")).toBe(true);
    expect(isCrmAdmin("app_admin")).toBe(true);
  });

  it("denies sales users", () => {
    expect(isCrmAdmin("SalesUser")).toBe(false);
    expect(isCrmAdminUser({ role: "SalesManager" })).toBe(false);
  });
});
