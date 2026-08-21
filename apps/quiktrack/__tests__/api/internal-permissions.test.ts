import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { resetMockDb } from "../helpers/mockDb";
import {
  installPermissionFixture,
  USER,
  ORG,
  PROJECT,
  PROJECT_KEY,
} from "../helpers/permissionFixture";
import { GET } from "@/app/api/internal/permissions/route";
import {
  ACTIONS,
  ALL_RESOURCES,
  APP_WIDE_ONLY_RESOURCES,
  SPACE_ADMIN_ROLE_NAME,
} from "@/lib/api/permissionsRegistry";

const SECRET = "test-ai-runtime-secret";

function req(qs: string, headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return new NextRequest(`http://localhost/api/internal/permissions${qs}`, { headers });
}

function query(params: Record<string, string>) {
  return `?${new URLSearchParams(params).toString()}`;
}

beforeEach(() => {
  resetMockDb();
  process.env.INTERNAL_AI_RUNTIME_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.INTERNAL_AI_RUNTIME_SECRET;
});

describe("GET /api/internal/permissions — auth", () => {
  it("returns 401 with no x-internal-secret header", async () => {
    const res = await GET(req(query({ userId: USER, orgId: ORG }), {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("returns 401 with the wrong secret, and leaks nothing but 'Unauthorized'", async () => {
    const res = await GET(
      req(query({ userId: USER, orgId: ORG }), { "x-internal-secret": "wrong" }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, error: "Unauthorized" });
  });

  it("fails closed when INTERNAL_AI_RUNTIME_SECRET is unset server-side", async () => {
    delete process.env.INTERNAL_AI_RUNTIME_SECRET;
    const res = await GET(
      req(query({ userId: USER, orgId: ORG }), { "x-internal-secret": "anything" }),
    );
    expect(res.status).toBe(401);
  });

  it("fails closed when INTERNAL_AI_RUNTIME_SECRET is configured EMPTY", async () => {
    process.env.INTERNAL_AI_RUNTIME_SECRET = "";
    // Both an empty header and a non-empty one must be rejected — an empty
    // configured secret must never make the endpoint world-readable.
    expect((await GET(req(query({ userId: USER, orgId: ORG }), { "x-internal-secret": "" }))).status).toBe(401);
    expect((await GET(req(query({ userId: USER, orgId: ORG }), { "x-internal-secret": "x" }))).status).toBe(401);
  });

  it("rejects the auth check before reading query params", async () => {
    const res = await GET(req("", {}));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/internal/permissions — input", () => {
  it("returns 400 when userId or orgId is missing", async () => {
    expect((await GET(req(query({ orgId: ORG })))).status).toBe(400);
    expect((await GET(req(query({ userId: USER })))).status).toBe(400);
    const res = await GET(req(query({ userId: "  ", orgId: ORG })));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      success: false,
      error: "userId and orgId are required",
    });
  });
});

describe("GET /api/internal/permissions — org answer", () => {
  it("returns an EMPTY set for a userId who is not a member of orgId — not an error", async () => {
    installPermissionFixture({ orgRole: null });
    const res = await GET(req(query({ userId: "stranger", orgId: ORG })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.isAdmin).toBe(false);
    expect(body.data.orgPermissions).toEqual([]);
    // No membership oracle: the shape is identical to a real member with no
    // grants, and nothing distinguishes "no such user" from "no permissions".
    expect(body.error).toBeUndefined();
  });

  it("isAdmin is hasAdminAccess — true for an org_admin with NO QuikTrack app role", async () => {
    installPermissionFixture({ orgRole: "org_admin", appRoleGrants: [] });
    const body = await (await GET(req(query({ userId: USER, orgId: ORG })))).json();
    expect(body.data.isAdmin).toBe(true);
    // ...while orgPermissions stays the LITERAL userCan answer, which has no
    // admin bypass. Both semantics on the wire; consumer picks per call site.
    expect(body.data.orgPermissions).toEqual([]);
  });

  it("orgPermissions is role grants UNION per-user extras", async () => {
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Issue:create"],
      extras: ["Doc:update"],
    });
    const body = await (await GET(req(query({ userId: USER, orgId: ORG })))).json();
    expect(body.data.orgPermissions).toEqual(["Doc:update", "Issue:create"]);
  });

  it("omits the project key entirely when no projectId was supplied", async () => {
    installPermissionFixture({ orgRole: "member" });
    const body = await (await GET(req(query({ userId: USER, orgId: ORG })))).json();
    expect("project" in body.data).toBe(false);
  });
});

describe("GET /api/internal/permissions — permission strings come from the registry", () => {
  it("every returned string is a registry (resource, action) pair", async () => {
    const enforceable = new Set<string>();
    for (const resource of ALL_RESOURCES) {
      for (const action of ACTIONS) enforceable.add(`${resource}:${action}`);
    }
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Issue:create", "TestCase:view"],
      extras: ["Doc:update"],
      projectRoleName: "Contributor",
      projectRoleGrants: ["Issue:update"],
      isMember: true,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();

    for (const key of body.data.orgPermissions) expect(enforceable.has(key)).toBe(true);
    for (const key of body.data.project.permissions) expect(enforceable.has(key)).toBe(true);
  });

  it("drops a stored grant whose resource is no longer in the registry", async () => {
    // `userCan` returns false for these at its isResource guard, so the grant
    // is unenforceable — reporting it would over-report.
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Issue:create", "RenamedAwayResource:view"],
    });
    const body = await (await GET(req(query({ userId: USER, orgId: ORG })))).json();
    expect(body.data.orgPermissions).toEqual(["Issue:create"]);
  });

  it("ships appWideOnlyResources from the registry so the consumer can't hardcode the split", async () => {
    installPermissionFixture({ orgRole: "member" });
    const body = await (await GET(req(query({ userId: USER, orgId: ORG })))).json();
    expect(body.data.appWideOnlyResources).toEqual(
      Array.from(APP_WIDE_ONLY_RESOURCES).sort(),
    );
  });
});

describe("GET /api/internal/permissions — project answer", () => {
  it("project role OVERRIDES rather than unions with the app-wide role", async () => {
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Issue:create", "Issue:update", "Issue:delete"],
      projectRoleName: "Contributor",
      projectRoleGrants: ["Issue:update"],
      isMember: true,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();

    expect(body.data.project.resolution).toBe("project_role");
    expect(body.data.project.permissions).toEqual(["Issue:update"]);
    // The org answer still reports all three — labelled as insufficient for
    // project decisions rather than silently pretending to be complete.
    expect(body.data.orgPermissions).toEqual([
      "Issue:create",
      "Issue:delete",
      "Issue:update",
    ]);
  });

  it("Space Admin sets the flag and OMITS permissions (not an empty array)", async () => {
    installPermissionFixture({
      orgRole: "member",
      projectRoleName: SPACE_ADMIN_ROLE_NAME,
      isMember: true,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();

    expect(body.data.project.resolution).toBe("space_admin");
    // Omitted, never empty: an empty array would read as "denied everything",
    // which is the opposite of what Space Admin means.
    expect("permissions" in body.data.project).toBe(false);
  });

  it("admin bypass omits permissions too", async () => {
    installPermissionFixture({ orgRole: "org_admin", isMember: false });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    expect(body.data.project.resolution).toBe("admin_bypass");
    expect("permissions" in body.data.project).toBe(false);
  });

  it("falls back to the app-wide answer when the user holds no project role", async () => {
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Issue:create"],
      projectRoleName: null,
      isMember: true,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    expect(body.data.project.resolution).toBe("org_fallback");
    expect(body.data.project.permissions).toEqual(["Issue:create"]);
  });

  it("per-user extras appear in BOTH the org and the project answer", async () => {
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: [],
      extras: ["TestCase:create"],
      projectRoleName: "Contributor",
      projectRoleGrants: ["Issue:update"],
      isMember: true,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    expect(body.data.orgPermissions).toContain("TestCase:create");
    // Extras stay additive inside an authoritative project role.
    expect(body.data.project.permissions).toEqual(["Issue:update", "TestCase:create"]);
  });

  it("excludes app-wide-only resources from the project answer but keeps them org-wide", async () => {
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Report:view", "Issue:create"],
      projectRoleName: null,
      isMember: true,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    // "The project role is authoritative over project-scoped resources only."
    expect(body.data.orgPermissions).toContain("Report:view");
    expect(body.data.project.permissions).not.toContain("Report:view");
    expect(body.data.project.permissions).toContain("Issue:create");
  });

  it("reports isMember, the actual gate for reads", async () => {
    installPermissionFixture({ orgRole: "member", projectRoleName: null, isMember: true });
    let body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    expect(body.data.project.isMember).toBe(true);

    resetMockDb();
    installPermissionFixture({ orgRole: "member", projectRoleName: null, isMember: false });
    body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    expect(body.data.project.isMember).toBe(false);
  });

  it("reports isMember literally for an admin — not smoothed to true", async () => {
    // withProjectAccess's own admin bypass is narrower than hasAdminAccess, so
    // an org_admin non-member gets isAdmin:true here and a 404 from the route.
    // Fail-closed, and stated rather than papered over.
    installPermissionFixture({ orgRole: "org_admin", isMember: false });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })))
    ).json();
    expect(body.data.isAdmin).toBe(true);
    expect(body.data.project.isMember).toBe(false);
  });

  it("accepts a projectKey and returns the resolved cuid", async () => {
    installPermissionFixture({ orgRole: "member", projectRoleName: null, isMember: true });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT_KEY })))
    ).json();
    expect(body.data.project.projectId).toBe(PROJECT);
  });
});

describe("GET /api/internal/permissions — unresolvable project", () => {
  it("returns project: null for a project in a different org", async () => {
    installPermissionFixture({ orgRole: "member", appRoleGrants: ["Issue:create"] });
    const body = await (
      await GET(req(query({ userId: USER, orgId: "other_org", projectId: PROJECT })))
    ).json();
    expect(body.success).toBe(true);
    expect(body.data.project).toBeNull();
  });

  it("returns project: null for a deleted or unknown project, with no reason code", async () => {
    installPermissionFixture({ orgRole: "member", projectExists: false });
    const res = await GET(req(query({ userId: USER, orgId: ORG, projectId: PROJECT })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.project).toBeNull();
    // One indistinct answer — deleted, cross-org and never-existed must not be
    // tellable apart, or the endpoint becomes a project-existence oracle.
    expect(JSON.stringify(body)).not.toMatch(/deleted|not found|forbidden/i);
  });

  it("never falls back to the org answer for an unresolvable project", async () => {
    installPermissionFixture({
      orgRole: "member",
      appRoleGrants: ["Issue:create", "Issue:delete"],
      projectExists: false,
    });
    const body = await (
      await GET(req(query({ userId: USER, orgId: ORG, projectId: "ghost" })))
    ).json();
    expect(body.data.project).toBeNull();
    // orgPermissions is still returned, but it is NOT presented as a project
    // answer — the consumer would otherwise read it as project authority.
    expect(body.data.orgPermissions).toEqual(["Issue:create", "Issue:delete"]);
  });
});
