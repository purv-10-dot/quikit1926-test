import { describe, it, expect } from "vitest";
import { USER_TYPE_LABELS } from "@/lib/email/templates/_shared";

describe("USER_TYPE_LABELS", () => {
  it("maps every known user-type code to a human label", () => {
    expect(USER_TYPE_LABELS.SUPER_ADMIN).toBe("Super Admin");
    expect(USER_TYPE_LABELS.ADMIN).toBe("Admin");
    expect(USER_TYPE_LABELS.HO_USER).toBe("HO User");
    expect(USER_TYPE_LABELS.SITE_ADMIN).toBe("Site Admin");
    expect(USER_TYPE_LABELS.USER).toBe("User");
  });

  it("returns undefined for an unknown code (caller falls back)", () => {
    expect(USER_TYPE_LABELS.NONEXISTENT).toBeUndefined();
  });

  it("covers exactly the five role codes", () => {
    expect(Object.keys(USER_TYPE_LABELS).sort()).toEqual(
      ["ADMIN", "HO_USER", "SITE_ADMIN", "SUPER_ADMIN", "USER"].sort(),
    );
  });
});
