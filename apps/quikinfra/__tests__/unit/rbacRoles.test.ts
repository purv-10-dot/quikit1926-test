import { describe, it, expect } from "vitest";
import { ROLE_KEYS, ROLE_DEFINITIONS } from "@/lib/rbac/roles";
import { PERMISSIONS, ALL_PERMISSION_KEYS } from "@/lib/rbac/permissions";

function roleByKey(key: string) {
  const r = ROLE_DEFINITIONS.find((d) => d.key === key);
  if (!r) throw new Error(`role ${key} not found`);
  return r;
}

describe("ROLE_DEFINITIONS structure", () => {
  it("defines exactly the 5 system roles", () => {
    const keys = ROLE_DEFINITIONS.map((r) => r.key).sort();
    expect(keys).toEqual(
      [
        ROLE_KEYS.SUPER_ADMIN,
        ROLE_KEYS.ADMIN,
        ROLE_KEYS.HO_USER,
        ROLE_KEYS.SITE_ADMIN,
        ROLE_KEYS.USER,
      ].sort(),
    );
  });

  it("every role is marked isSystem and has a name + description", () => {
    for (const r of ROLE_DEFINITIONS) {
      expect(r.isSystem).toBe(true);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.description.length).toBeGreaterThan(0);
    }
  });
});

describe("wildcard roles", () => {
  it("super_admin and admin both carry the '*' wildcard", () => {
    expect(roleByKey(ROLE_KEYS.SUPER_ADMIN).permissions).toBe("*");
    expect(roleByKey(ROLE_KEYS.ADMIN).permissions).toBe("*");
  });
});

describe("scoped roles carry concrete permission arrays", () => {
  for (const key of [ROLE_KEYS.HO_USER, ROLE_KEYS.SITE_ADMIN, ROLE_KEYS.USER]) {
    it(`${key} has an explicit, non-wildcard permission list`, () => {
      const perms = roleByKey(key).permissions;
      expect(perms).not.toBe("*");
      expect(Array.isArray(perms)).toBe(true);
      expect((perms as string[]).length).toBeGreaterThan(0);
    });

    it(`${key} only references known permission keys`, () => {
      const known = new Set<string>(ALL_PERMISSION_KEYS);
      for (const p of roleByKey(key).permissions as string[]) {
        expect(known.has(p)).toBe(true);
      }
    });

    it(`${key} has no duplicate permissions`, () => {
      const perms = roleByKey(key).permissions as string[];
      expect(new Set(perms).size).toBe(perms.length);
    });
  }
});

describe("role permission semantics", () => {
  it("USER has data-entry writes but no approvals", () => {
    const perms = new Set(roleByKey(ROLE_KEYS.USER).permissions as string[]);
    expect(perms.has(PERMISSIONS.DPR_WRITE)).toBe(true);
    expect(perms.has(PERMISSIONS.MR_WRITE)).toBe(true);
    // no approval / reverse rights
    expect(perms.has(PERMISSIONS.DPR_APPROVE)).toBe(false);
    expect(perms.has(PERMISSIONS.RAB_APPROVE)).toBe(false);
    expect(perms.has(PERMISSIONS.BOQ_UNLOCK)).toBe(false);
  });

  it("SITE_ADMIN can lock BOQ and approve DPR but not unlock BOQ", () => {
    const perms = new Set(roleByKey(ROLE_KEYS.SITE_ADMIN).permissions as string[]);
    expect(perms.has(PERMISSIONS.BOQ_LOCK)).toBe(true);
    expect(perms.has(PERMISSIONS.DPR_APPROVE)).toBe(true);
    expect(perms.has(PERMISSIONS.INDENT_APPROVE_L2)).toBe(true);
    expect(perms.has(PERMISSIONS.BOQ_UNLOCK)).toBe(false);
  });

  it("HO_USER carries senior approvals and audit view", () => {
    const perms = new Set(roleByKey(ROLE_KEYS.HO_USER).permissions as string[]);
    expect(perms.has(PERMISSIONS.INDENT_APPROVE_L3)).toBe(true);
    expect(perms.has(PERMISSIONS.RAB_APPROVE)).toBe(true);
    expect(perms.has(PERMISSIONS.AUDIT_VIEW)).toBe(true);
  });

  it("all scoped roles include the shared read-everything baseline", () => {
    for (const key of [ROLE_KEYS.HO_USER, ROLE_KEYS.SITE_ADMIN]) {
      const perms = new Set(roleByKey(key).permissions as string[]);
      expect(perms.has(PERMISSIONS.BOQ_READ)).toBe(true);
      expect(perms.has(PERMISSIONS.MASTERS_READ)).toBe(true);
      expect(perms.has(PERMISSIONS.REPORTS_READ)).toBe(true);
    }
  });

  it("no scoped role grants the platform-only BOQ_UNLOCK or SETTINGS_TENANTS", () => {
    for (const key of [ROLE_KEYS.HO_USER, ROLE_KEYS.SITE_ADMIN, ROLE_KEYS.USER]) {
      const perms = new Set(roleByKey(key).permissions as string[]);
      expect(perms.has(PERMISSIONS.BOQ_UNLOCK)).toBe(false);
      expect(perms.has(PERMISSIONS.SETTINGS_TENANTS)).toBe(false);
    }
  });
});
