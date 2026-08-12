import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { seedAllDefaultRoles } from "@/lib/api/seedAdminAppRole";

const ORG = "org_1";
const APP_ID = "app_quiktrack";
const ADMIN_ROLE_ID = "role_admin";

// findFirst's real return type is Prisma's fluent client wrapper, not a bare
// Promise — mockImplementation needs a same-shape function, so cast through
// unknown to a plain (args) => Promise fn, same pattern used for groupBy in
// reports-tasks-due-before.test.ts.
type FindFirstMock = { mockImplementation: (fn: (args?: unknown) => Promise<unknown>) => void };

beforeEach(() => {
  resetMockDb();
  mockDb.app.findUnique.mockResolvedValue({ id: APP_ID } as never);
  // Force the cold path every time (skip seedAllDefaultRoles' own in-process
  // cache) by never satisfying its "cached && roles all exist" branch — the
  // simplest way is to let qtAppRole.findFirst resolve consistently below,
  // since the module-level seededOrgs Map starts empty per fresh test file.
  (mockDb.qtAppRole.findFirst as unknown as FindFirstMock).mockImplementation((args?: unknown) => {
    const where = (args as { where?: { name?: string } } | undefined)?.where;
    if (where?.name === "admin") return Promise.resolve({ id: ADMIN_ROLE_ID });
    return Promise.resolve(null);
  });
  mockDb.qtAppRole.create.mockResolvedValue({ id: "role_created" } as never);
  mockDb.qtRolePermission.count.mockResolvedValue(1); // grants already exist — the exact scenario the backfill exists for
  mockDb.qtRoleNavigation.count.mockResolvedValue(1);
  mockDb.qtRolePermission.findMany.mockResolvedValue([]);
  mockDb.qtRoleNavigation.findMany.mockResolvedValue([]);
  mockDb.qtProjectRolePermission.findMany.mockResolvedValue([]);
  mockDb.qtRolePermission.createMany.mockResolvedValue({ count: 0 } as never);
});

// PAT-adjacent regression: Team:create is a registry leaf added AFTER every
// existing org's admin role was already seeded. seedAdminAppRole only grants
// permissions once (grantCount === 0), so without an explicit backfill,
// every existing tenant admin would be silently locked out of POST /api/teams
// the moment it switched from hasAdminAccess to userCan(...,"Team","create").
describe("seedAllDefaultRoles — Team:create backfill for existing admin roles", () => {
  it("grants Team:create to the admin role even though its permission-grant count is already > 0", async () => {
    await seedAllDefaultRoles(ORG);
    expect(mockDb.qtRolePermission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ roleId: ADMIN_ROLE_ID, resource: "Team", action: "create" }),
        ]),
      }),
    );
  });

  it("is idempotent — uses skipDuplicates so re-running never errors or double-grants", async () => {
    await seedAllDefaultRoles(ORG);
    const teamGrantCall = mockDb.qtRolePermission.createMany.mock.calls.find((c) =>
      (c[0] as { data: Array<{ resource: string }> }).data.some((d) => d.resource === "Team"),
    );
    expect(teamGrantCall?.[0]).toEqual(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
});
