/**
 * FR-RE Unit 3a (FR-RE-3 user_picker) — RBAC-scoped user list, real-DB.
 *
 * SECURITY CENTERPIECE — AC-RE-17: a user_picker for a limited-scope agent must
 * return ONLY users that agent is permitted to see; it must NEVER leak users
 * outside their scope (other teams, the org admin, etc.).
 *
 * The picker's RBAC is the user-level analog of `getScope` (account-acl.ts):
 *   - Administrator  -> sees ALL tenant users.
 *   - Any other user -> sees only their sales-group co-members
 *                       (QceSalesGroupMember + QceSalesGroupManager).
 *
 * Fixture: one org, an admin + two disjoint teams (A1/A2 in Team A, B1/B2 in
 * Team B). The cross-scope-leak assertions run in BOTH directions so the test
 * fails loudly if scoping is dropped or inverted — not just on the happy path.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import { listUsersForPicker } from "@/lib/services/forms/user-picker.service";
import type { SessionUser } from "@/types/permission";

const STAMP = Date.now();
const ADMIN_ROLE = "Administrator";
const MEMBER_ROLE = "member";

let orgId: string;
let teamAId: string;
let teamBId: string;
const u: Record<string, { id: string; email: string }> = {};

/** Build a SessionUser for a seeded fixture user. */
function asSession(key: string, role: string): SessionUser {
  return {
    userId: u[key]!.id,
    orgId: orgId,
    role,
    email: u[key]!.email,
    name: key,
  };
}

async function seedUser(key: string): Promise<void> {
  const email = `frre_u3a_${key}_${STAMP}@example.test`;
  const user = await integrationPrisma.user.create({
    data: { email, firstName: key.toUpperCase(), lastName: "Picker" },
  });
  u[key] = { id: user.id, email };
}

beforeAll(async () => {
  const org = await integrationPrisma.org.create({
    data: { name: `FRRE U3a ${STAMP}`, slug: `frre-u3a-${STAMP}` },
  });
  orgId = org.id;

  // "loner" is a non-admin who belongs to NO sales group.
  for (const key of ["admin", "a1", "a2", "b1", "b2", "loner"]) {
    await seedUser(key);
  }

  // Org memberships (all active in the same tenant).
  await integrationPrisma.orgMember.createMany({
    data: [
      { orgId, userId: u.admin!.id, role: ADMIN_ROLE, status: "active" },
      { orgId, userId: u.a1!.id, role: MEMBER_ROLE, status: "active" },
      { orgId, userId: u.a2!.id, role: MEMBER_ROLE, status: "active" },
      { orgId, userId: u.b1!.id, role: MEMBER_ROLE, status: "active" },
      { orgId, userId: u.b2!.id, role: MEMBER_ROLE, status: "active" },
      { orgId, userId: u.loner!.id, role: MEMBER_ROLE, status: "active" },
    ],
  });

  // Two disjoint sales groups (teams).
  const teamA = await integrationPrisma.qceSalesGroup.create({
    data: { orgId: orgId, name: `Team A ${STAMP}` },
  });
  const teamB = await integrationPrisma.qceSalesGroup.create({
    data: { orgId: orgId, name: `Team B ${STAMP}` },
  });
  teamAId = teamA.id;
  teamBId = teamB.id;

  await integrationPrisma.qceSalesGroupMember.createMany({
    data: [
      { groupId: teamAId, userId: u.a1!.id },
      { groupId: teamAId, userId: u.a2!.id },
      { groupId: teamBId, userId: u.b1!.id },
      { groupId: teamBId, userId: u.b2!.id },
    ],
  });
});

afterAll(async () => {
  await integrationPrisma.qceSalesGroupMember.deleteMany({
    where: { groupId: { in: [teamAId, teamBId] } },
  });
  await integrationPrisma.qceSalesGroup.deleteMany({
    where: { id: { in: [teamAId, teamBId] } },
  });
  await integrationPrisma.orgMember.deleteMany({ where: { orgId } });
  await integrationPrisma.user.deleteMany({
    where: { id: { in: Object.values(u).map((x) => x.id) } },
  });
  await integrationPrisma.org.deleteMany({ where: { id: orgId } });
});

describe("listUsersForPicker — RBAC scoping (FR-RE-3 / AC-RE-17)", () => {
  it("AC-RE-17: a limited-scope agent (Team A) NEVER sees users outside their team", async () => {
    const list = await listUsersForPicker(asSession("a1", MEMBER_ROLE), {
      scope: "all_users",
    });
    const ids = list.map((x) => x.id);

    // Sees own team.
    expect(ids).toContain(u.a1!.id);
    expect(ids).toContain(u.a2!.id);
    // SECURITY: must NOT leak the other team or the org admin.
    expect(ids).not.toContain(u.b1!.id);
    expect(ids).not.toContain(u.b2!.id);
    expect(ids).not.toContain(u.admin!.id);
  });

  it("AC-RE-17 (reverse direction): a Team B agent NEVER sees Team A — proves scoping isn't hardcoded to one team", async () => {
    const list = await listUsersForPicker(asSession("b1", MEMBER_ROLE), {
      scope: "all_users",
    });
    const ids = list.map((x) => x.id);

    expect(ids).toContain(u.b1!.id);
    expect(ids).toContain(u.b2!.id);
    expect(ids).not.toContain(u.a1!.id);
    expect(ids).not.toContain(u.a2!.id);
    expect(ids).not.toContain(u.admin!.id);
  });

  it("team scope: resolves to the requesting agent's own team members", async () => {
    const list = await listUsersForPicker(asSession("a1", MEMBER_ROLE), {
      scope: "team",
    });
    const ids = list.map((x) => x.id).sort();
    expect(ids).toEqual([u.a1!.id, u.a2!.id].sort());
  });

  it("Administrator is unrestricted: all_users returns every active tenant user", async () => {
    const list = await listUsersForPicker(asSession("admin", ADMIN_ROLE), {
      scope: "all_users",
    });
    const ids = list.map((x) => x.id);
    for (const key of ["admin", "a1", "a2", "b1", "b2"]) {
      expect(ids).toContain(u[key]!.id);
    }
  });

  it("AC-RE-17 (fail-closed): a non-admin in NO sales group sees ONLY themselves", async () => {
    // Security-critical default: missing scope data => see less, not more.
    // (Deliberately diverges from getScope's empty-ACL => unrestricted, which
    // governs account access, not who-can-see-whom.)
    for (const scope of ["all_users", "team", "role"] as const) {
      const list = await listUsersForPicker(asSession("loner", MEMBER_ROLE), {
        scope,
        ...(scope === "role" ? { role: MEMBER_ROLE } : {}),
      });
      const ids = list.map((x) => x.id);
      expect(ids).toEqual([u.loner!.id]);
    }
  });

  it("role scope (admin caller): returns only users with the requested role", async () => {
    const list = await listUsersForPicker(asSession("admin", ADMIN_ROLE), {
      scope: "role",
      role: MEMBER_ROLE,
    });
    const ids = list.map((x) => x.id);
    expect(ids).toContain(u.a1!.id);
    expect(ids).toContain(u.b1!.id);
    expect(ids).not.toContain(u.admin!.id); // admin is Administrator, not member
  });

  it("returns display-ready options ({ id, name, email })", async () => {
    const list = await listUsersForPicker(asSession("admin", ADMIN_ROLE), {
      scope: "all_users",
    });
    const a1 = list.find((x) => x.id === u.a1!.id);
    expect(a1).toBeDefined();
    expect(a1).toMatchObject({ id: u.a1!.id, email: u.a1!.email });
    expect(typeof a1!.name).toBe("string");
  });
});
