import { describe, it, expect, beforeEach } from "vitest";
// Registers vi.mock for "@/lib/db" + "@quikit/database" (hoisted). That mock
// re-exports the real Prisma namespace, so PrismaClientKnownRequestError below
// is the same class the production code instanceof-checks.
import { mockDb, resetMockDb } from "../../__tests__/helpers/mockDb";
import { Prisma } from "@quikit/database";
import { allPermissionPairs } from "./permissionsRegistry";
import { __resetAppIdCacheForTest } from "./permissions";
import { seedAllDefaultRoles, ensureSeeded, ensureUserRole, collapseToLatestRole } from "./seed";

const ORG = "org-1";

/** Configure the deep mock for a "fresh org, no existing members" seed run. */
function freshOrgMocks() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
  mockDb.qcAppRole.findUnique.mockResolvedValue(null as never);
  mockDb.qcAppRole.updateMany.mockResolvedValue({ count: 0 } as never);
  mockDb.qcAppRole.update.mockResolvedValue({ id: "role-Member" } as never);
  mockDb.qcAppRole.create.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (args: any) => Promise.resolve({ id: `role-${args.data.name}` }) as never,
  );
  // convergeDefaultRole's read. Default: the Member create already set the flag,
  // so exactly one default exists and convergence is a no-op. Tests that
  // exercise the repair branches override this.
  mockDb.qcAppRole.findMany.mockResolvedValue([{ id: "role-Member" }] as never);
  mockDb.qcRolePermission.count.mockResolvedValue(0 as never);
  mockDb.qcRolePermission.createMany.mockResolvedValue({ count: 0 } as never);
  // Backfill sees every pair already present → never re-grants (keeps createMany
  // to exactly one call per role in the seed path).
  mockDb.qcRolePermission.findMany.mockResolvedValue(allPermissionPairs() as never);
  mockDb.userAppAccess.findMany.mockResolvedValue([] as never);
  mockDb.qcUserAppRole.createMany.mockResolvedValue({ count: 0 } as never);
}

beforeEach(() => {
  resetMockDb();
  // getQuikChatAppId caches BOTH ways — a resolved id sticks forever, and since
  // negative caching landed a miss sticks for 30s. Either direction makes this
  // file order-dependent (it used to carry a "MUST run first" comment for the
  // first half). Reset per test instead of relying on declaration order.
  __resetAppIdCacheForTest();
});

describe("seedAllDefaultRoles — unregistered app", () => {
  it("returns null (no-op) when the QuikChat App is not registered", async () => {
    mockDb.app.findUnique.mockResolvedValue(null as never);
    const result = await seedAllDefaultRoles("org-unregistered");
    expect(result).toBeNull();
    expect(mockDb.qcAppRole.create).not.toHaveBeenCalled();
  });
});

describe("seedAllDefaultRoles", () => {
  it("creates the four canonical roles with the correct grant counts", async () => {
    freshOrgMocks();
    await seedAllDefaultRoles(ORG);

    const created = mockDb.qcAppRole.create.mock.calls.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c[0].data,
    );
    const byName = new Map(created.map((d) => [d.name, d]));
    expect([...byName.keys()].sort()).toEqual(["Guest", "Member", "Moderator", "admin"]);

    // admin is the only isSystem role; Member is the only isDefault.
    expect(byName.get("admin")?.isSystem).toBe(true);
    expect(byName.get("admin")?.isDefault).toBe(false);
    expect(byName.get("Member")?.isDefault).toBe(true);
    expect(byName.get("Member")?.isSystem).toBe(false);

    // Grant-set sizes on the NEW-ORG path: admin=12 (all pairs), Moderator=9,
    // Member=7. Guest gets NO createMany call at all — GUEST_GRANTS is now
    // empty (Channel:view was a dead checkbox; removed together with the
    // registry leaf, see permissionsRegistry.ts), and seedRole/backfillRoleGrants
    // both no-op on an empty grants array. So only 3 calls exist, not 4.
    // Member/Moderator each gained Channel.Public:create (6→7, 8→9) when
    // public-channel creation became a Member default for new orgs. admin
    // tracks allPermissionPairs(), so a change THERE means the tree moved, not
    // that a grant went missing.
    const grantSizes = mockDb.qcRolePermission.createMany.mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => c[0].data.length)
      .sort((a: number, b: number) => a - b);
    expect(grantSizes).toEqual([7, 9, 12]);
  });

  it("a NEW org's Member gets Channel.Public but still no Moderate / IngestOrg / config", async () => {
    freshOrgMocks();
    await seedAllDefaultRoles(ORG);

    // The 7-row createMany is the Member seed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const calls = mockDb.qcRolePermission.createMany.mock.calls as any[];
    const memberCall = calls.find((c) => c[0].data.length === 7);
    expect(memberCall).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resources = new Set((memberCall[0].data as any[]).map((g: any) => g.resource));
    // Creating public channels is now a Member default — for NEW orgs only.
    expect(resources.has("Channel.Public")).toBe(true);
    expect(resources.has("Channel.Moderate")).toBe(false);
    expect(resources.has("Assistant.IngestOrg")).toBe(false);
    expect(resources.has("Assistant.Configure")).toBe(false);
    expect(resources.has("App.Modules")).toBe(false);
    // …but includes the day-to-day surfaces.
    expect(resources.has("Channel.DM")).toBe(true);
    expect(resources.has("Assistant.IngestPrivate")).toBe(true);
  });

  it("is idempotent — existing roles with grants are not re-created or re-granted", async () => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
    mockDb.qcAppRole.findUnique.mockResolvedValue({ id: "role-existing" } as never);
    mockDb.qcAppRole.findMany.mockResolvedValue([{ id: "role-existing" }] as never);
    mockDb.qcRolePermission.count.mockResolvedValue(5 as never); // already has grants
    mockDb.qcRolePermission.findMany.mockResolvedValue(allPermissionPairs() as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([] as never);

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcAppRole.create).not.toHaveBeenCalled();
    expect(mockDb.qcRolePermission.createMany).not.toHaveBeenCalled();
  });

  // REGRESSION: seedRole used to demote every isDefault row BEFORE creating,
  // which is what cleared a concurrent pass's freshly-set flag. Nothing in the
  // seed path may issue a blanket demote any more — convergence owns the flag.
  it("never issues a blanket isDefault demote (the write that lost the flag)", async () => {
    freshOrgMocks();
    await seedAllDefaultRoles(ORG);

    const demotes = mockDb.qcAppRole.updateMany.mock.calls.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c[0]?.where?.isDefault === true,
    );
    expect(demotes).toHaveLength(0);
  });
});

/**
 * The NEW_ORG / BACKFILL split, which is the whole point of having two lists.
 *
 * `backfillRoleGrants` re-applies its list on EVERY seed pass, so any pair in it
 * is effectively permanent: an admin un-ticks it in Settings → Roles and it
 * returns within the 5-minute cache window. A pair only in the NEW_ORG list is
 * granted once at role creation and the admin's removal STICKS.
 *
 * `Channel.Public:create` is deliberately NEW_ORG-only, so "who may create a
 * public channel" is a per-org policy choice rather than a property of the
 * seeder. If it ever leaks into the backfill list, the roles page silently stops
 * being able to revoke it — the failure these tests exist to catch.
 */
describe("NEW_ORG vs BACKFILL grant lists", () => {
  /**
   * Pairs written for ONE role. Scoped by roleId on purpose: the admin role's
   * backfill list is `allPermissionPairs()`, so it legitimately contains
   * Channel.Public — asserting over every createMany call would fail on admin's
   * correct behaviour and say nothing about Member's.
   */
  function pairsFor(roleId: string): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (mockDb.qcRolePermission.createMany.mock.calls as any[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((c) => c[0].data as any[])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((g: any) => g.roleId === roleId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((g: any) => `${g.resource}:${g.action}`);
  }

  /** An org that already has all four roles and NO grants — backfill only. */
  function existingOrgMocks() {
    freshOrgMocks();
    mockDb.qcAppRole.findUnique.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (args: any) =>
        Promise.resolve({ id: `role-${args.where.orgId_appId_name.name}` }) as never,
    );
    // Roles exist with grants, so seedRole's create-time fill is skipped …
    mockDb.qcRolePermission.count.mockResolvedValue(5 as never);
    // … and the role currently holds nothing, so backfill tops up its whole list.
    mockDb.qcRolePermission.findMany.mockResolvedValue([] as never);
  }

  it("does NOT retro-add Channel.Public to an existing org", async () => {
    existingOrgMocks();
    await seedAllDefaultRoles("org-existing-1");

    const member = pairsFor("role-Member");
    expect(member.length).toBeGreaterThan(0); // the backfill really ran
    expect(member).not.toContain("Channel.Public:create");
    // …and the admin role still gets it, because its list is every pair.
    expect(pairsFor("role-admin")).toContain("Channel.Public:create");
  });

  it("still retro-adds the universal Member grants to an existing org", async () => {
    existingOrgMocks();
    await seedAllDefaultRoles("org-existing-2");

    const member = pairsFor("role-Member");
    expect(member).toContain("Channel:create");
    expect(member).toContain("Channel.DM:create");
  });

  // Guards the seam directly: if someone adds Channel.Public to the backfill
  // list, an admin's un-tick stops sticking and this fails.
  it("grants Channel.Public on the NEW-org path but never on the backfill path", async () => {
    freshOrgMocks();
    await seedAllDefaultRoles("org-brand-new");
    expect(pairsFor("role-Member")).toContain("Channel.Public:create");

    resetMockDb();
    __resetAppIdCacheForTest();
    existingOrgMocks();
    await seedAllDefaultRoles("org-existing-3");
    expect(pairsFor("role-Member")).not.toContain("Channel.Public:create");
  });
});

/**
 * Registry-retirement hygiene. Removing a resource leaves its grant rows behind;
 * they are inert (userCan validates the registry first) but they inflate counts —
 * retiring Channel.InviteExternal left admin reporting 17 grants against a
 * 16-pair tree.
 */
describe("pruneUnknownGrants", () => {
  it("deletes grant rows whose resource is no longer in the registry", async () => {
    freshOrgMocks();
    mockDb.qcRolePermission.findMany.mockResolvedValue([
      { id: "g1", resource: "Channel", action: "create" },
      { id: "g2", resource: "Channel.InviteExternal", action: "create" },
      { id: "g3", resource: "Totally.Gone", action: "view" },
    ] as never);

    await seedAllDefaultRoles("org-prune");

    expect(mockDb.qcRolePermission.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["g2", "g3"] } },
    });
  });

  it("does not delete anything when every grant is still valid", async () => {
    freshOrgMocks();
    mockDb.qcRolePermission.findMany.mockResolvedValue([
      { id: "g1", resource: "Channel", action: "create" },
      { id: "g2", resource: "Channel.Public", action: "create" },
    ] as never);

    await seedAllDefaultRoles("org-prune-clean");

    expect(mockDb.qcRolePermission.deleteMany).not.toHaveBeenCalled();
  });
});

/**
 * The invariant: exactly one default role per (orgId, appId).
 *
 * WHAT THESE PROVE — and it matters, because the bug they fix is a race:
 * these assert BRANCH LOGIC only. Given a DB state, which writes are issued.
 * They prove nothing about serialization — a mocked Prisma enforces no unique
 * index and interleaves no transactions, so no test here can show that two real
 * passes collide the way they did in production. Convergence is what makes
 * correctness independent of winning the race; these tests check that the
 * repair rule is right, not that the race is gone.
 */
describe("convergeDefaultRole (exactly one default per org+app)", () => {
  it("repairs ZERO defaults by promoting the seeded Member role", async () => {
    freshOrgMocks();
    mockDb.qcAppRole.findMany.mockResolvedValue([] as never); // the live bug state

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcAppRole.update).toHaveBeenCalledWith({
      where: { id: "role-Member" },
      data: { isDefault: true },
    });
  });

  it("collapses MULTIPLE defaults to the oldest, clearing the rest", async () => {
    freshOrgMocks();
    // Ordered createdAt ASC by the query — first row is the keeper.
    mockDb.qcAppRole.findMany.mockResolvedValue([
      { id: "role-oldest" },
      { id: "role-newer" },
      { id: "role-newest" },
    ] as never);

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcAppRole.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["role-newer", "role-newest"] } },
      data: { isDefault: false },
    });
    // The keeper is never rewritten.
    expect(mockDb.qcAppRole.update).not.toHaveBeenCalled();
  });

  // THE PHASE 3 GUARD. An admin picking a non-Member default via
  // PATCH /api/org/roles/[id] must survive every later seed pass. If this ever
  // fails we have traded a privilege-escalation bug for a config-clobbering one.
  it("leaves a deliberate single default untouched, even when it is not Member", async () => {
    freshOrgMocks();
    mockDb.qcAppRole.findMany.mockResolvedValue([{ id: "role-Guest" }] as never);

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcAppRole.update).not.toHaveBeenCalled();
    expect(mockDb.qcAppRole.updateMany).not.toHaveBeenCalled();
  });
});

describe("seedRole — concurrent create (P2002)", () => {
  it("re-reads the winner's row instead of failing the pass", async () => {
    freshOrgMocks();
    // Every role: the pre-read misses, the create loses the race, the re-read
    // returns the winner. mockResolvedValueOnce chains per call, so drive it
    // from call order instead: miss, then winner, alternating.
    let call = 0;
    mockDb.qcAppRole.findUnique.mockImplementation(
      () => Promise.resolve(call++ % 2 === 0 ? null : { id: "role-winner" }) as never,
    );
    mockDb.qcAppRole.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      }) as never,
    );

    await expect(seedAllDefaultRoles(ORG)).resolves.toBeTruthy();
  });

  it("rethrows a non-P2002 create failure rather than masking it", async () => {
    freshOrgMocks();
    mockDb.qcAppRole.create.mockRejectedValue(new Error("connection reset") as never);

    await expect(seedAllDefaultRoles(ORG)).rejects.toThrow("connection reset");
  });
});

describe("backfillExistingMembers (DECISION 1)", () => {
  it("assigns Member to plain members and admin to org_admins / super_admins", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
      { userId: "u1" }, // duplicate — must dedupe
    ] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never); // none assigned yet
    mockDb.orgMember.findMany.mockResolvedValue([
      { userId: "u1", role: "org_admin" },
      { userId: "u2", role: "member" },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", isSuperAdmin: false },
      { id: "u2", isSuperAdmin: false },
    ] as never);

    await seedAllDefaultRoles(ORG);

    expect(mockDb.qcUserAppRole.createMany).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mockDb.qcUserAppRole.createMany.mock.calls[0][0] as any).data;
    expect(rows).toHaveLength(2);
    const roleByUser = new Map(rows.map((r: { userId: string; roleId: string }) => [r.userId, r.roleId]));
    expect(roleByUser.get("u1")).toBe("role-admin");
    expect(roleByUser.get("u2")).toBe("role-Member");
  });

  // Same regression as ensureUserRole's, on the Phase-1 backfill path. The two
  // classifiers must agree or a legacy-admin owner's role depends on which one
  // happened to run first.
  it("promotes a LEGACY 'admin' membership role to admin", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u-legacy" }] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.orgMember.findMany.mockResolvedValue([
      { userId: "u-legacy", role: "admin" },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u-legacy", isSuperAdmin: false },
    ] as never);

    await seedAllDefaultRoles(ORG);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mockDb.qcUserAppRole.createMany.mock.calls[0][0] as any).data;
    expect(rows[0].roleId).toBe("role-admin");
  });

  it("promotes a platform super-admin (isSuperAdmin) to admin", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u3" }] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.orgMember.findMany.mockResolvedValue([{ userId: "u3", role: "member" }] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "u3", isSuperAdmin: true }] as never);

    await seedAllDefaultRoles(ORG);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mockDb.qcUserAppRole.createMany.mock.calls[0][0] as any).data;
    expect(rows[0].roleId).toBe("role-admin");
  });

  it("skips users who already hold a role", async () => {
    freshOrgMocks();
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.qcUserAppRole.findMany.mockResolvedValue([{ userId: "u1" }] as never); // already assigned
    mockDb.orgMember.findMany.mockResolvedValue([] as never);
    mockDb.user.findMany.mockResolvedValue([] as never);

    await seedAllDefaultRoles(ORG);
    expect(mockDb.qcUserAppRole.createMany).not.toHaveBeenCalled();
  });
});

describe("collapseToLatestRole", () => {
  beforeEach(() => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
  });

  it("keeps the newest role and deletes the rest", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([
      { id: "newest" },
      { id: "stale-1" },
      { id: "stale-2" },
    ] as never);
    mockDb.qcUserAppRole.deleteMany.mockResolvedValue({ count: 2 } as never);

    const removed = await collapseToLatestRole("u1", ORG);
    expect(removed).toBe(2);
    expect(mockDb.qcUserAppRole.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["stale-1", "stale-2"] } },
    });
  });

  it("is a no-op when the user holds a single role", async () => {
    mockDb.qcUserAppRole.findMany.mockResolvedValue([{ id: "only" }] as never);
    const removed = await collapseToLatestRole("u1", ORG);
    expect(removed).toBe(0);
    expect(mockDb.qcUserAppRole.deleteMany).not.toHaveBeenCalled();
  });
});

describe("ensureSeeded", () => {
  it("seeds once then short-circuits within the TTL", async () => {
    freshOrgMocks();
    const org = "org-ensure-unique";

    await ensureSeeded(org);
    const afterFirst = mockDb.qcAppRole.findUnique.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await ensureSeeded(org); // cache hit — no further DB work
    expect(mockDb.qcAppRole.findUnique.mock.calls.length).toBe(afterFirst);
  });

  // SINGLE-FLIGHT. Without this, N concurrent requests on a cold process all
  // miss the cache and all run a full pass — which IS the cross-pass
  // concurrency that lost the isDefault flag and tripped P2002.
  it("shares ONE pass across concurrent callers for the same org", async () => {
    freshOrgMocks();
    const org = "org-single-flight";

    await Promise.all([ensureSeeded(org), ensureSeeded(org), ensureSeeded(org)]);

    // Four roles seeded exactly once, not three times over.
    expect(mockDb.qcAppRole.create).toHaveBeenCalledTimes(4);
  });

  it("does not conflate different orgs in the in-flight map", async () => {
    freshOrgMocks();
    await Promise.all([ensureSeeded("org-sf-a"), ensureSeeded("org-sf-b")]);
    expect(mockDb.qcAppRole.create).toHaveBeenCalledTimes(8); // 4 per org
  });

  // A failed pass used to cache NOTHING — `seededOrgs.set` was the last
  // statement of seedAllDefaultRoles — so every later request re-ran the whole
  // seed and re-entered the same race, silently. Failure must now be recorded.
  it("swallows a failed pass but caches a backoff so it does not retry per-request", async () => {
    freshOrgMocks();
    mockDb.qcAppRole.create.mockRejectedValue(new Error("db down") as never);
    const org = "org-seed-fails";

    await expect(ensureSeeded(org)).resolves.toBeUndefined();
    const afterFirst = mockDb.qcAppRole.create.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Within the backoff window the next caller must NOT re-run the pass.
    await ensureSeeded(org);
    expect(mockDb.qcAppRole.create.mock.calls.length).toBe(afterFirst);
  });
});

/**
 * THE CASE THE OTHER 30 TESTS MISSED.
 *
 * Every convergence test above reaches `convergeDefaultRole` through a path
 * that was always going to reach it — a direct `seedAllDefaultRoles` call, or
 * an `ensureUserRole` on a user with no binding. The LIVE org is neither: all
 * of its users are already bound, so `ensureUserRole` takes its fast-path
 * return and the org-level repair is never invoked. The branch logic was
 * correct and the caller never called it.
 *
 * This asserts the property that actually matters — a WARM org converges —
 * rather than that the rule computes the right answer once reached.
 */
describe("warm org — every user already bound", () => {
  it("still converges a lost default (repair must not depend on an unbound user)", async () => {
    freshOrgMocks();
    // Unique org id: `seededUntil` is module state and ORG is cached by the
    // suites above, which would short-circuit the pass and mask the bug.
    const org = "org-warm-all-bound";

    // Roles already exist — nothing to create. Keyed by name so the assertion
    // below reads as "the Member role", not an opaque id.
    mockDb.qcAppRole.findUnique.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (args: any) =>
        Promise.resolve({ id: `role-${args.where.orgId_appId_name.name}` }) as never,
    );
    // Zero defaults — exactly the live state this is meant to repair.
    mockDb.qcAppRole.findMany.mockResolvedValue([] as never);
    // The fast path HITS: this user, like every user in the org, is bound.
    mockDb.qcUserAppRole.findFirst.mockResolvedValue({ id: "uar-existing" } as never);

    await ensureUserRole("u-warm", org);

    // Premise check — we really are simulating the warm path, not sneaking
    // down the bind path where convergence was already known to run.
    expect(mockDb.qcAppRole.create).not.toHaveBeenCalled();
    expect(mockDb.qcUserAppRole.create).not.toHaveBeenCalled();

    // The repair itself.
    expect(mockDb.qcAppRole.update).toHaveBeenCalledWith({
      where: { id: "role-Member" },
      data: { isDefault: true },
    });
  });
});

describe("ensureUserRole (per-user seed-before-check)", () => {
  // ORG was cached in seededOrgs by earlier seedAllDefaultRoles(ORG) calls, so
  // the internal ensureSeeded short-circuits (no org re-seed here).
  beforeEach(() => {
    mockDb.app.findUnique.mockResolvedValue({ id: "app-qc" } as never);
    // Resolve a role id by the requested name (admin vs Member).
    mockDb.qcAppRole.findFirst.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (args: any) => Promise.resolve({ id: `role-${args.where.name}` }) as never,
    );
    mockDb.qcUserAppRole.create.mockResolvedValue({ id: "uar-new" } as never);
  });

  it("no-ops when the user already holds a role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue({ id: "uar-existing" } as never);
    await ensureUserRole("u1", ORG);
    expect(mockDb.qcUserAppRole.create).not.toHaveBeenCalled();
  });

  it("binds Member to a plain member with no role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    await ensureUserRole("u1", ORG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arg = (mockDb.qcUserAppRole.create.mock.calls[0][0] as any).data;
    expect(arg.roleId).toBe("role-Member");
    expect(arg.userId).toBe("u1");
  });

  it("binds admin to an org_admin with no role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "org_admin" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    await ensureUserRole("u2", ORG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockDb.qcUserAppRole.create.mock.calls[0][0] as any).data.roleId).toBe("role-admin");
  });

  // REGRESSION: the classifier hardcoded "org_admin"/"super_admin" and missed
  // the LEGACY "admin" membership role. ROLE_HIERARCHY["admin"] === 5, so
  // createRequireAdmin admitted such a user to /settings/roles while this bound
  // them to Member — two gates, two answers for the same person.
  it("binds admin to a LEGACY 'admin' membership role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    await ensureUserRole("u-legacy", ORG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockDb.qcUserAppRole.create.mock.calls[0][0] as any).data.roleId).toBe("role-admin");
  });

  it("still binds Member for a non-admin tier (app_admin is NOT org-wide admin)", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "app_admin" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    await ensureUserRole("u-appadmin", ORG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockDb.qcUserAppRole.create.mock.calls[0][0] as any).data.roleId).toBe("role-Member");
  });

  it("binds admin to a platform super-admin (isSuperAdmin) with no role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: true } as never);
    await ensureUserRole("u3", ORG);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((mockDb.qcUserAppRole.create.mock.calls[0][0] as any).data.roleId).toBe("role-admin");
  });

  it("mirrors the freshly-bound role onto central UserAppAccess.role", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    await ensureUserRole("u4", ORG);
    expect(mockDb.userAppAccess.updateMany).toHaveBeenCalledWith({
      where: { orgId: ORG, userId: "u4", appId: "app-qc" },
      data: { role: "Member" },
    });
  });

  it("mirrors 'admin' for a bound org_admin", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "org_admin" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    await ensureUserRole("u5", ORG);
    expect(mockDb.userAppAccess.updateMany).toHaveBeenCalledWith({
      where: { orgId: ORG, userId: "u5", appId: "app-qc" },
      data: { role: "admin" },
    });
  });

  it("does NOT mirror when the user already holds a role (fast path)", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue({ id: "uar-existing" } as never);
    await ensureUserRole("u6", ORG);
    expect(mockDb.userAppAccess.updateMany).not.toHaveBeenCalled();
  });

  it("bind still succeeds when the mirror write throws (best-effort)", async () => {
    mockDb.qcUserAppRole.findFirst.mockResolvedValue(null as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.user.findUnique.mockResolvedValue({ isSuperAdmin: false } as never);
    mockDb.userAppAccess.updateMany.mockRejectedValueOnce(new Error("mirror down") as never);
    await expect(ensureUserRole("u7", ORG)).resolves.toBeUndefined();
    expect(mockDb.qcUserAppRole.create).toHaveBeenCalled();
  });
});
