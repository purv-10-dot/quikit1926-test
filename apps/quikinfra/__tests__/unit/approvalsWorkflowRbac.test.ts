import { describe, it, expect } from "vitest";
import {
  canActOnStep,
  canActOnStepForInbox,
  canActOnCurrentStep,
  isSkippableByRaiser,
  userTypeFromRoleKey,
  type WorkflowStepLike,
  type Actor,
} from "@/lib/approvals/workflow-rbac";

// role keys → user types (backingRole on USER_TYPE_CATALOG):
//   super_admin → SUPER_ADMIN, admin → ADMIN, ho_user → HO_USER,
//   site_admin → SITE_ADMIN, user → USER.
// approverRoleId on steps is compared by RANK via getUserTypeRank, so it
// holds a USER_TYPE string ("USER", "SITE_ADMIN", ...).

const roleOnlyStep = (role: string): WorkflowStepLike => ({
  approverUserId: null,
  approverUserIds: null,
  approverRoleId: role,
});

const pinnedStep = (userId: string): WorkflowStepLike => ({
  approverUserId: userId,
  approverUserIds: null,
  approverRoleId: null,
});

const poolStep = (ids: string[]): WorkflowStepLike => ({
  approverUserId: null,
  approverUserIds: ids,
  approverRoleId: null,
});

describe("userTypeFromRoleKey", () => {
  it("maps backing role keys to user types", () => {
    expect(userTypeFromRoleKey("super_admin")).toBe("SUPER_ADMIN");
    expect(userTypeFromRoleKey("admin")).toBe("ADMIN");
    expect(userTypeFromRoleKey("ho_user")).toBe("HO_USER");
    expect(userTypeFromRoleKey("site_admin")).toBe("SITE_ADMIN");
    expect(userTypeFromRoleKey("user")).toBe("USER");
  });
  it("returns undefined for null / unknown", () => {
    expect(userTypeFromRoleKey(null)).toBeUndefined();
    expect(userTypeFromRoleKey(undefined)).toBeUndefined();
    expect(userTypeFromRoleKey("nope")).toBeUndefined();
  });
});

describe("canActOnStep — SUPER_ADMIN bypass", () => {
  it("super_admin can act on ANY step regardless of pin/role", () => {
    const actor: Actor = { userId: "su", roleKey: "super_admin" };
    expect(canActOnStep(actor, pinnedStep("someone-else"), null)).toBe(true);
    expect(canActOnStep(actor, roleOnlyStep("ADMIN"), null)).toBe(true);
    expect(canActOnStep(actor, poolStep(["a", "b"]), null)).toBe(true);
  });
});

describe("canActOnStep — pinned-user / pool steps", () => {
  it("allows the exact pinned user", () => {
    expect(canActOnStep({ userId: "u1", roleKey: "user" }, pinnedStep("u1"), null)).toBe(true);
  });
  it("denies a non-pinned user (even a higher rank)", () => {
    expect(canActOnStep({ userId: "admin1", roleKey: "admin" }, pinnedStep("u1"), null)).toBe(false);
  });
  it("allows any user in a multi-user pool, denies others", () => {
    const step = poolStep(["u1", "u2"]);
    expect(canActOnStep({ userId: "u2", roleKey: "user" }, step, null)).toBe(true);
    expect(canActOnStep({ userId: "u9", roleKey: "admin" }, step, null)).toBe(false);
  });
});

describe("canActOnStep — role-rank steps", () => {
  it("allows a caller whose rank >= the step role", () => {
    // HO_USER(3) >= SITE_ADMIN(2)
    expect(canActOnStep({ userId: "ho", roleKey: "ho_user" }, roleOnlyStep("SITE_ADMIN"), null)).toBe(true);
    // equal rank
    expect(canActOnStep({ userId: "sa", roleKey: "site_admin" }, roleOnlyStep("SITE_ADMIN"), null)).toBe(true);
  });
  it("denies a caller below the step role rank", () => {
    // USER(1) < HO_USER(3)
    expect(canActOnStep({ userId: "u", roleKey: "user" }, roleOnlyStep("HO_USER"), null)).toBe(false);
  });
  it("denies when caller type is unknown or step role is absent", () => {
    expect(canActOnStep({ userId: "x", roleKey: "bogus" }, roleOnlyStep("USER"), null)).toBe(false);
    expect(canActOnStep({ userId: "ho", roleKey: "ho_user" }, roleOnlyStep(null as any), null)).toBe(false);
  });
});

describe("canActOnStep — project scope", () => {
  const step = roleOnlyStep("SITE_ADMIN");
  it("no projectIds restriction → allowed", () => {
    expect(canActOnStep({ userId: "sa", roleKey: "site_admin" }, step, "proj-1")).toBe(true);
  });
  it("scoped actor allowed only for entity in their projects", () => {
    const actor: Actor = { userId: "sa", roleKey: "site_admin", projectIds: ["proj-1"] };
    expect(canActOnStep(actor, step, "proj-1")).toBe(true);
    expect(canActOnStep(actor, step, "proj-2")).toBe(false);
  });
  it("scoped actor denied when entity has no project", () => {
    const actor: Actor = { userId: "sa", roleKey: "site_admin", projectIds: ["proj-1"] };
    expect(canActOnStep(actor, step, null)).toBe(false);
  });
});

describe("canActOnStepForInbox — no project scope", () => {
  it("super_admin bypass + rank match without a project check", () => {
    expect(canActOnStepForInbox({ userId: "su", roleKey: "super_admin" }, roleOnlyStep("ADMIN"))).toBe(true);
    expect(canActOnStepForInbox({ userId: "ho", roleKey: "ho_user" }, roleOnlyStep("SITE_ADMIN"))).toBe(true);
    expect(canActOnStepForInbox({ userId: "u", roleKey: "user" }, roleOnlyStep("ADMIN"))).toBe(false);
  });
  it("pool match in inbox", () => {
    expect(canActOnStepForInbox({ userId: "u1", roleKey: "user" }, poolStep(["u1"]))).toBe(true);
    expect(canActOnStepForInbox({ userId: "u2", roleKey: "user" }, poolStep(["u1"]))).toBe(false);
  });
});

describe("canActOnCurrentStep", () => {
  const instance = {
    status: "pending_approval",
    currentStepOrder: 2,
    workflow: {
      steps: [
        { stepOrder: 1, ...roleOnlyStep("USER") },
        { stepOrder: 2, ...roleOnlyStep("SITE_ADMIN") },
      ],
    },
  };
  it("delegates to canActOnStep for the current step", () => {
    expect(canActOnCurrentStep({ userId: "sa", roleKey: "site_admin" }, instance, null)).toBe(true);
    expect(canActOnCurrentStep({ userId: "u", roleKey: "user" }, instance, null)).toBe(false);
  });
  it("returns false when the instance isn't pending", () => {
    expect(
      canActOnCurrentStep({ userId: "sa", roleKey: "site_admin" }, { ...instance, status: "approved" }, null),
    ).toBe(false);
  });
  it("returns false when the current step is missing", () => {
    expect(
      canActOnCurrentStep(
        { userId: "sa", roleKey: "site_admin" },
        { ...instance, currentStepOrder: 99 },
        null,
      ),
    ).toBe(false);
  });
});

describe("isSkippableByRaiser", () => {
  it("pool step: skip when raiser is in the pool, else don't", () => {
    const step = poolStep(["u1", "u2"]);
    expect(isSkippableByRaiser(step, { userId: "u1", userType: "USER" })).toBe(true);
    expect(isSkippableByRaiser(step, { userId: "u9", userType: "ADMIN" })).toBe(false);
  });
  it("role-only step: skip when raiser rank >= step role rank", () => {
    // SITE_ADMIN(2) >= USER(1) → skip
    expect(isSkippableByRaiser(roleOnlyStep("USER"), { userId: "sa", userType: "SITE_ADMIN" })).toBe(true);
    // USER(1) < SITE_ADMIN(2) → don't skip
    expect(isSkippableByRaiser(roleOnlyStep("SITE_ADMIN"), { userId: "u", userType: "USER" })).toBe(false);
  });
  it("returns false when there is no pool, no role, or no raiser type", () => {
    expect(isSkippableByRaiser(roleOnlyStep(null as any), { userId: "x", userType: "ADMIN" })).toBe(false);
    expect(isSkippableByRaiser(roleOnlyStep("USER"), { userId: "x", userType: undefined })).toBe(false);
  });
});
