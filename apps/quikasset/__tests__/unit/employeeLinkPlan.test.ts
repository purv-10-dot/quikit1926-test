import { describe, it, expect } from "vitest";
import { planEmployee, normEmail } from "../../scripts/employeeLinkPlan";

/**
 * Phase-2 backfill planner. These lock the three fates an AstEmployee can take
 * during the identity-bridge link: matched → link, unmatched+history → blocked
 * (FK RESTRICT), unmatched+clean → delete. A regression here would either
 * delete a real person's record or silently fail to link them.
 */

const members = new Map<string, string>([
  ["alice@corp.com", "user-alice"],
  ["bob@corp.com", "user-bob"],
]);

describe("normEmail", () => {
  it("trims and lowercases", () => {
    expect(normEmail("  Foo@Bar.COM ")).toBe("foo@bar.com");
  });
});

describe("planEmployee", () => {
  it("matches an org-member user by email → link", () => {
    const p = planEmployee({ email: "alice@corp.com", assignments: 0, replacements: 0 }, members);
    expect(p.bucket).toBe("matched");
    expect(p.matchedUserId).toBe("user-alice");
  });

  it("matches case-insensitively", () => {
    const p = planEmployee({ email: "BOB@Corp.com", assignments: 3, replacements: 1 }, members);
    expect(p.bucket).toBe("matched"); // match wins even with history
    expect(p.matchedUserId).toBe("user-bob");
  });

  it("unmatched with assignment history → blocked", () => {
    const p = planEmployee({ email: "ghost@demo.local", assignments: 1, replacements: 0 }, members);
    expect(p.bucket).toBe("blocked");
    expect(p.matchedUserId).toBeNull();
    expect(p.hasHistory).toBe(true);
  });

  it("unmatched with replacement history → blocked", () => {
    const p = planEmployee({ email: "ghost@demo.local", assignments: 0, replacements: 2 }, members);
    expect(p.bucket).toBe("blocked");
  });

  it("unmatched with no history → delete", () => {
    const p = planEmployee({ email: "seed@demo.local", assignments: 0, replacements: 0 }, members);
    expect(p.bucket).toBe("delete");
    expect(p.matchedUserId).toBeNull();
    expect(p.hasHistory).toBe(false);
  });
});
