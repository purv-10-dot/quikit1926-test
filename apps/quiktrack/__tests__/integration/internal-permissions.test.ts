/**
 * GET /api/internal/permissions against the REAL local Postgres.
 *
 * `__tests__/api/internal-permissions.test.ts` already covers all four
 * resolution states — against a deep-mocked Prisma client. Those tests assert
 * that the resolver's control flow does the right thing *given a mock that
 * returns what the test told it to return*. They cannot catch a wrong `where`
 * clause, a relation that doesn't load, a schema/column drift, or a unique
 * constraint that isn't where the code assumes. This file can, because every
 * row here came out of the database.
 *
 * Fixture: `packages/database/scripts/seed-permissions-demo.ts`, seeded once in
 * `beforeAll` and shared by every test. See `vitest.integration.config.ts` for
 * why there is no reset between tests and why that makes these tests read-only.
 *
 * Run: npm run test:integration   (not part of npm run test — needs a database)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/internal/permissions/route";
import { isAppWideOnly, SPACE_ADMIN_ROLE_NAME } from "@/lib/api/permissionsRegistry";
import { db } from "@/lib/db";
import {
  seedPermissionsDemo,
  FALLBACK_ROLE_NAME,
  type PermissionsDemoIds,
} from "../../../../packages/database/scripts/seed-permissions-demo";

const SECRET = "integration-ai-runtime-secret";

let ids: PermissionsDemoIds;

/** Resource half of a `Resource:action` key — mirrors the resolver's own split. */
function resourceOf(key: string): string {
  const i = key.indexOf(":");
  return i === -1 ? key : key.slice(0, i);
}

interface PermissionsBody {
  success: boolean;
  error?: string;
  data?: {
    isAdmin: boolean;
    orgPermissions: string[];
    appWideOnlyResources: string[];
    project?: {
      projectId: string;
      isMember: boolean;
      resolution: string;
      permissions?: string[];
    } | null;
  };
}

async function call(
  params: Record<string, string>,
  headers: Record<string, string> = { "x-internal-secret": SECRET },
): Promise<{ status: number; body: PermissionsBody }> {
  const qs = new URLSearchParams(params).toString();
  const res = await GET(
    new NextRequest(`http://localhost:3004/api/internal/permissions?${qs}`, { headers }),
  );
  return { status: res.status, body: (await res.json()) as PermissionsBody };
}

/** The project answer for a given demo user, with the shape narrowed. */
async function projectAnswer(userId: string) {
  const { status, body } = await call({
    userId,
    orgId: ids.orgId,
    projectId: ids.projectId,
  });
  expect(status).toBe(200);
  expect(body.success).toBe(true);
  const project = body.data?.project;
  if (!project) throw new Error("expected a project answer, got none");
  return { project, data: body.data };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is unset. vitest.integration.config.ts reads it from " +
        "apps/quiktrack/.env.local — check that file exists.",
    );
  }
  // The route reads the secret from the environment at request time. The real
  // .env.local value is irrelevant here; what matters is that the route
  // compares against whatever is configured.
  process.env.INTERNAL_AI_RUNTIME_SECRET = SECRET;
  ids = await seedPermissionsDemo();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("the seeded fixture is what the tests think it is", () => {
  it("seeds five users, one per resolution state, in one org and project", () => {
    expect(ids.orgId).toBeTruthy();
    expect(ids.projectId).toBeTruthy();
    expect(Object.keys(ids.users).sort()).toEqual([
      "adminBypass",
      "orgFallbackEmpty",
      "orgFallbackGrants",
      "projectRole",
      "spaceAdmin",
    ]);
  });

  it("is idempotent — a second run returns the same ids and no duplicate rows", async () => {
    const before = await db.qtRolePermission.count({ where: { roleId: ids.fallbackRoleId } });
    const again = await seedPermissionsDemo();

    expect(again.orgId).toBe(ids.orgId);
    expect(again.projectId).toBe(ids.projectId);
    expect(again.fallbackRoleId).toBe(ids.fallbackRoleId);
    expect(again.users).toEqual(ids.users);

    expect(await db.qtRolePermission.count({ where: { roleId: ids.fallbackRoleId } })).toBe(
      before,
    );
    expect(
      await db.qtAppRole.count({ where: { orgId: ids.orgId, name: FALLBACK_ROLE_NAME } }),
    ).toBe(1);
    expect(
      await db.qtUserAppRole.count({
        where: { userId: ids.users.orgFallbackGrants.userId, orgId: ids.orgId },
      }),
    ).toBe(1);
  });
});

describe("org_fallback — the app-wide answer applies", () => {
  it("resolves org_fallback with the EXACT seeded grant set, not merely a non-empty one", async () => {
    const user = ids.users.orgFallbackGrants;
    const { project, data } = await projectAnswer(user.userId);

    expect(project.resolution).toBe("org_fallback");

    // The whole point of this assertion: `.length > 0` would pass even if the
    // resolver returned somebody else's permissions, or the union of every
    // role in the org. Set equality is what proves the fallback path read THIS
    // user's app-wide role.
    expect(data?.orgPermissions).toEqual(ids.fallbackGrantKeys);
    expect(data?.isAdmin).toBe(false);

    // The project answer is the same set minus app-wide-only resources. Derived
    // from the registry rather than hand-listed, so the split can't drift here
    // without the resolver's split drifting the same way.
    const expectedInProject = ids.fallbackGrantKeys.filter(
      (key) => !isAppWideOnly(resourceOf(key)),
    );
    expect(project.permissions).toEqual(expectedInProject);

    // Sanity: the two sets really do differ, otherwise the assertion above is
    // vacuous and would keep passing if the split were dropped entirely.
    expect(expectedInProject.length).toBeLessThan(ids.fallbackGrantKeys.length);
  });

  it("resolves org_fallback with an EMPTY list for a user holding no app-wide role", async () => {
    const { project, data } = await projectAnswer(ids.users.orgFallbackEmpty.userId);

    expect(project.resolution).toBe("org_fallback");
    expect(data?.orgPermissions).toEqual([]);
    // Empty, but present — `org_fallback` always ships a list, unlike the two
    // bypass states which omit the key.
    expect(project.permissions).toEqual([]);
    expect(project).toHaveProperty("permissions");
  });
});

describe("project_role — the project role is authoritative", () => {
  it("resolves project_role and returns the role's real stored grants", async () => {
    const user = ids.users.projectRole;
    const { project } = await projectAnswer(user.userId);

    expect(project.resolution).toBe("project_role");
    expect(project.projectId).toBe(ids.projectId);
    expect(project.isMember).toBe(true);

    // Compare against the grants actually stored on the assigned role, read
    // back through a separate query. The resolver and this assertion reach the
    // same rows by different paths.
    const assignment = await db.qtProjectUserRole.findUnique({
      where: { projectId_userId: { projectId: ids.projectId, userId: user.userId } },
      select: {
        projectRole: {
          select: { name: true, permissions: { select: { resource: true, action: true } } },
        },
      },
    });
    const stored = (assignment?.projectRole.permissions ?? [])
      .map((p) => `${p.resource}:${p.action}`)
      .filter((key) => !isAppWideOnly(resourceOf(key)))
      .sort();

    expect(stored.length).toBeGreaterThan(0);
    expect(project.permissions).toEqual(stored);
  });

  it("does NOT consult the app-wide role — this user holds none, and still has grants", async () => {
    const user = ids.users.projectRole;
    const { project, data } = await projectAnswer(user.userId);

    expect(data?.orgPermissions).toEqual([]);
    expect(project.permissions?.length).toBeGreaterThan(0);
  });
});

describe("space_admin and admin_bypass omit the list rather than emptying it", () => {
  it("resolves space_admin for the holder of the Space Admin project role", async () => {
    const user = ids.users.spaceAdmin;
    const { project, data } = await projectAnswer(user.userId);

    expect(project.resolution).toBe("space_admin");
    expect(data?.isAdmin).toBe(false);
    // Omitted, not empty — an empty array here would read as "denied everything".
    expect(project.permissions).toBeUndefined();
    expect(project).not.toHaveProperty("permissions");

    const assignment = await db.qtProjectUserRole.findUnique({
      where: { projectId_userId: { projectId: ids.projectId, userId: user.userId } },
      select: { projectRole: { select: { name: true } } },
    });
    expect(assignment?.projectRole.name).toBe(SPACE_ADMIN_ROLE_NAME);
  });

  it("resolves admin_bypass for an org-tier admin, ahead of any project role", async () => {
    const user = ids.users.adminBypass;
    const { project, data } = await projectAnswer(user.userId);

    expect(project.resolution).toBe("admin_bypass");
    expect(data?.isAdmin).toBe(true);
    expect(project.permissions).toBeUndefined();

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId: ids.orgId, userId: user.userId } },
      select: { role: true },
    });
    expect(membership?.role).toBe("admin");
  });
});

describe("auth and project resolution against real rows", () => {
  it("rejects a request with no x-internal-secret before touching the database", async () => {
    const { status, body } = await call(
      { userId: ids.users.adminBypass.userId, orgId: ids.orgId },
      {},
    );
    expect(status).toBe(401);
    expect(body).toEqual({ success: false, error: "Unauthorized" });
  });

  it("accepts the projectKey and resolves it to the same cuid as the id", async () => {
    const user = ids.users.projectRole;
    const byKey = await call({
      userId: user.userId,
      orgId: ids.orgId,
      projectId: ids.projectKey,
    });
    expect(byKey.status).toBe(200);
    expect(byKey.body.data?.project?.projectId).toBe(ids.projectId);
    expect(byKey.body.data?.project?.resolution).toBe("project_role");
  });

  it("returns project: null for a project id that exists in no org of this caller", async () => {
    const { status, body } = await call({
      userId: ids.users.projectRole.userId,
      orgId: ids.orgId,
      projectId: "definitely-not-a-project",
    });
    expect(status).toBe(200);
    expect(body.data?.project).toBeNull();
  });

  it("returns an empty answer, not an error, for a userId in no org", async () => {
    const { status, body } = await call({ userId: "no-such-user", orgId: ids.orgId });
    expect(status).toBe(200);
    expect(body.data?.isAdmin).toBe(false);
    expect(body.data?.orgPermissions).toEqual([]);
  });
});
