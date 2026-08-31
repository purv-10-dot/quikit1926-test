import { describe, it, expect, beforeEach } from "vitest";
import { resetMockDb } from "../helpers/mockDb";
import {
  installPermissionFixture,
  USER,
  ORG,
  PROJECT,
  type PermissionFixture,
} from "../helpers/permissionFixture";
import { userCanInProject } from "@/lib/api/permissions";
import {
  resolvePermissions,
  type ResolvedProjectPermissions,
} from "@/lib/api/resolvePermissions";
import {
  PROJECT_PERMISSION_TREE,
  SPACE_ADMIN_ROLE_NAME,
  type Action,
} from "@/lib/api/permissionsRegistry";

/**
 * THE ANTI-DRIFT TEST.
 *
 * `resolvePermissions` deliberately does not share code with
 * `userCanInProject` (see the header of lib/api/resolvePermissions.ts — making
 * the single-pair gate delegate to a list builder would convert ~45 hot call
 * sites from a 2-query check into a full-set load). What keeps the two
 * implementations of the same precedence rule from drifting is this test: the
 * whole project-scoped registry cross-product, in every resolution state,
 * asserted pairwise against the gate the app actually enforces.
 *
 * Scope note: the comparison covers PROJECT_PERMISSION_TREE only. App-wide-only
 * resources (Home / Dashboard / Report / Team) are excluded from the project
 * answer BY CONTRACT — "the project role is authoritative over project-scoped
 * resources only" — and `userCanInProject` will answer them from the app-wide
 * grant, so agreement there is not expected and not asserted. That divergence
 * is covered explicitly in internal-permissions.test.ts.
 */

// PROJECT_PERMISSION_TREE has no subModules today; assert that so a future
// nested leaf can't silently drop out of this cross-product.
const PROJECT_PAIRS: Array<{ resource: string; action: Action }> =
  PROJECT_PERMISSION_TREE.flatMap((mod) =>
    (mod.leaves ?? []).flatMap((leaf) =>
      leaf.actions.map((action) => ({ resource: leaf.resource, action })),
    ),
  );

function allowedByResolver(project: ResolvedProjectPermissions, key: string): boolean {
  switch (project.resolution) {
    // Both bypass states mean "allow everything here"; `permissions` is
    // omitted precisely because no list would be exhaustive.
    case "admin_bypass":
    case "space_admin":
      return true;
    default:
      return (project.permissions ?? []).includes(key);
  }
}

interface Scenario {
  name: string;
  fixture: PermissionFixture;
  expected: ResolvedProjectPermissions["resolution"];
}

const SCENARIOS: Scenario[] = [
  {
    // The §3.3 case: org_admin with NO QuikTrack app role. userCanInProject
    // bypasses via hasAdminAccess; the endpoint must report the same.
    name: "admin_bypass — org_admin with no QuikTrack app role",
    fixture: { orgRole: "org_admin", appRoleGrants: [], isMember: false },
    expected: "admin_bypass",
  },
  {
    name: "space_admin — full access in this space, list not exhaustive",
    fixture: {
      orgRole: "member",
      projectRoleName: SPACE_ADMIN_ROLE_NAME,
      appRoleGrants: ["Issue:create"],
      isMember: true,
    },
    expected: "space_admin",
  },
  {
    // The over-reporting case the whole design exists for: the app-wide role
    // grants Issue:create/update/delete, the project role grants only
    // Issue:update. A flat list would report all three.
    name: "project_role — overrides the app-wide role rather than unioning",
    fixture: {
      orgRole: "member",
      appRoleGrants: ["Issue:create", "Issue:update", "Issue:delete", "Doc:view"],
      projectRoleName: "Contributor",
      projectRoleGrants: ["Issue:update", "TestCase:view"],
      extras: ["TestCase:create"],
      isMember: true,
    },
    expected: "project_role",
  },
  {
    name: "org_fallback — no project role here, app-wide answer applies",
    fixture: {
      orgRole: "member",
      appRoleGrants: ["Issue:create", "Doc:view"],
      extras: ["Timesheet:create"],
      projectRoleName: null,
      isMember: true,
    },
    expected: "org_fallback",
  },
];

beforeEach(() => resetMockDb());

describe("resolvePermissions ↔ userCanInProject agreement", () => {
  it("has a non-empty project-scoped cross-product to compare", () => {
    expect(PROJECT_PAIRS.length).toBeGreaterThan(10);
    expect(
      PROJECT_PERMISSION_TREE.every((mod) => (mod.subModules?.length ?? 0) === 0),
    ).toBe(true);
  });

  for (const { name, fixture, expected } of SCENARIOS) {
    describe(name, () => {
      it(`resolves as ${expected}`, async () => {
        installPermissionFixture(fixture);
        const result = await resolvePermissions(USER, ORG, PROJECT);
        expect(result.project?.resolution).toBe(expected);
      });

      it("agrees with userCanInProject on every project-scoped pair", async () => {
        installPermissionFixture(fixture);
        const result = await resolvePermissions(USER, ORG, PROJECT);
        const project = result.project;
        expect(project).toBeTruthy();

        const mismatches: Array<{
          pair: string;
          gate: boolean;
          endpoint: boolean;
        }> = [];
        for (const { resource, action } of PROJECT_PAIRS) {
          const key = `${resource}:${action}`;
          const gate = await userCanInProject(USER, ORG, PROJECT, resource, action);
          const endpoint = allowedByResolver(project as ResolvedProjectPermissions, key);
          if (gate !== endpoint) mismatches.push({ pair: key, gate, endpoint });
        }
        expect(mismatches).toEqual([]);
      });
    });
  }
});

describe("the over-report a flat list would produce", () => {
  it("project role denies Issue:create even though the app-wide role grants it", async () => {
    installPermissionFixture(SCENARIOS[2].fixture);

    const result = await resolvePermissions(USER, ORG, PROJECT);
    // The flat/org answer says yes...
    expect(result.orgPermissions).toContain("Issue:create");
    // ...the project answer and the real gate both say no.
    expect(result.project?.permissions).not.toContain("Issue:create");
    expect(await userCanInProject(USER, ORG, PROJECT, "Issue", "create")).toBe(false);

    // And the permission the project role DOES grant is present in both.
    expect(result.project?.permissions).toContain("Issue:update");
    expect(await userCanInProject(USER, ORG, PROJECT, "Issue", "update")).toBe(true);
  });
});
