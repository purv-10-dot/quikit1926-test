/**
 * Phase 5 — digest-recipients allow-list (additive unit, RED→GREEN).
 *
 * listDigestRecipients(orgId, roles, recipientUserIds?) gains an explicit
 * allow-list with REPLACE semantics (decision 2026-06-24):
 *   - recipientUserIds NON-EMPTY → ONLY those userIds receive the digest;
 *     recipientRoles is IGNORED. "Name exactly who gets it" (Akhilesh + Sanyukta),
 *     regardless of who else holds the leadership roles.
 *   - recipientUserIds EMPTY ([]) OR absent → fall back to recipientRoles
 *     (NOT "email nobody" — the explicit empty-array edge).
 *
 * CRITICAL — scope decoupling: even on the allow-list path, each recipient's
 * SessionUser carries their REAL role (Akhilesh=Administrator → org-wide scope,
 * Sanyukta=SalesManager → group scope), so per-recipient digest SCOPING stays
 * correct. Allow-list = WHO gets it; role = WHAT they see. Replace must NOT
 * flatten both to one scope.
 *
 * Mocks prisma. The allow-list arg does not exist on listDigestRecipients yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { listDigestRecipients } from "@/lib/services/notifications/digest-recipients";

// app-role rows for org1: an Administrator, a SalesManager, and a third Admin
// (the "other admin" the allow-list is meant to exclude).
const APP_ROLE_ROWS = [
  { userId: "akhilesh", role: { name: "admin" } },
  { userId: "sanyukta", role: { name: "sales-manager" } },
  { userId: "otheradmin", role: { name: "admin" } },
];

const USERS = [
  { id: "akhilesh", email: "akhilesh@x.co", firstName: "Akhilesh", lastName: "Gandhi" },
  { id: "sanyukta", email: "sanyukta@x.co", firstName: "Sanyukta", lastName: "Jha" },
  { id: "otheradmin", email: "other@x.co", firstName: "Other", lastName: "Admin" },
];

const findManyRole = prismaMock.crmUserAppRole.findMany as unknown as { mockResolvedValue: (v: unknown) => void };
const findManyUser = prismaMock.user.findMany as unknown as {
  mockImplementation: (fn: (args: unknown) => unknown) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  findManyRole.mockResolvedValue(APP_ROLE_ROWS);
  // user.findMany returns only the users whose ids are requested
  findManyUser.mockImplementation((args: unknown) => {
    const ids = ((args as { where?: { id?: { in?: string[] } } })?.where?.id?.in) ?? [];
    return Promise.resolve(USERS.filter((u) => ids.includes(u.id)));
  });
});

describe("listDigestRecipients — explicit allow-list, REPLACE semantics (Phase 5)", () => {
  it("allow-list NON-EMPTY → ONLY those userIds, roles ignored", async () => {
    const recips = await listDigestRecipients(
      "org1",
      ["Administrator", "SalesManager"], // would include otheradmin via roles…
      ["akhilesh", "sanyukta"], // …but the allow-list REPLACES that
    );
    expect(recips.map((r) => r.userId).sort()).toEqual(["akhilesh", "sanyukta"]);
    expect(recips.map((r) => r.userId)).not.toContain("otheradmin");
  });

  it("CRITICAL: allow-list recipients keep their REAL role (scope not flattened)", async () => {
    const recips = await listDigestRecipients("org1", ["Administrator", "SalesManager"], ["akhilesh", "sanyukta"]);
    const ak = recips.find((r) => r.userId === "akhilesh");
    const sa = recips.find((r) => r.userId === "sanyukta");
    expect(ak?.role).toBe("Administrator"); // org-wide scope
    expect(sa?.role).toBe("SalesManager"); // group scope — NOT flattened to Admin
  });

  it("allow-list EMPTY ([]) → fall back to roles (NOT 'email nobody')", async () => {
    const recips = await listDigestRecipients("org1", ["Administrator", "SalesManager"], []);
    // role-based path: both leadership roles (akhilesh, sanyukta, otheradmin all leadership)
    expect(recips.map((r) => r.userId).sort()).toEqual(["akhilesh", "otheradmin", "sanyukta"]);
  });

  it("allow-list ABSENT → fall back to roles (same as empty)", async () => {
    const recips = await listDigestRecipients("org1", ["Administrator", "SalesManager"]);
    expect(recips.map((r) => r.userId).sort()).toEqual(["akhilesh", "otheradmin", "sanyukta"]);
  });

  it("role fallback still filters by the requested roles (SalesManager only)", async () => {
    const recips = await listDigestRecipients("org1", ["SalesManager"]);
    expect(recips.map((r) => r.userId)).toEqual(["sanyukta"]);
  });

  it("constructs a full SessionUser (orgId + email + name) for each recipient", async () => {
    const recips = await listDigestRecipients("org1", ["Administrator", "SalesManager"], ["akhilesh"]);
    const ak = recips[0];
    expect(ak).toMatchObject({ userId: "akhilesh", orgId: "org1", role: "Administrator", email: "akhilesh@x.co" });
    expect(ak.name).toMatch(/Akhilesh/);
  });
});
