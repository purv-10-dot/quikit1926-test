/**
 * PHASE 34 — the remaining role-owned route groups:
 *   10 × `(super-admin)`, 4 × `(manager)`, 5 × `(parent)`, 1 × `(sub-admin)`.
 *
 * Each page is loaded as the role that owns its route group. Same three guards
 * as phases 31-33: a page-specific <h1>/copy pair, the `(shared)/[...slug]`
 * scaffold explicitly absent (it 200s for any URL), and no crash state.
 *
 * `/sub-admin-dashboard` needs particular care: it is built from the same
 * `DashboardScaffold` component the catch-all uses, so its <h1> alone cannot
 * distinguish the real page from the placeholder. Its subtitle
 * ("Delegated administration overview") is what separates them.
 *
 * `/master-courses/builder` is the one page in this set with no <h1> at all —
 * its title renders as an <h2>. The assertion matches reality and the missing
 * <h1> is reported as an a11y finding by phase 37, not silently tolerated here.
 */

import { test, expect } from "@playwright/test";
import { watch, gotoAs, expectRealPage, expectNoServerErrors } from "../fixtures/page";
import type { RoleKey } from "../fixtures/auth";

interface PageSpec {
  path: string;
  role: RoleKey;
  h1: string | RegExp;
  level?: 1 | 2;
  copy: RegExp;
}

const SUPER_ADMIN: PageSpec[] = [
  { path: "/dashboard",              role: "superAdmin", h1: "Super Admin Dashboard", copy: /Platform health across all tenants/i },
  { path: "/tenants",                role: "superAdmin", h1: "Platform Partners",     copy: /Monitor and manage tenant ecosystems/i },
  { path: "/platform-analytics",     role: "superAdmin", h1: "Platform Analytics",    copy: /Cross-tenant usage overview/i },
  { path: "/system-health",          role: "superAdmin", h1: "System Health",         copy: /Monitor operational status, tenant performance/i },
  { path: "/master-courses",         role: "superAdmin", h1: "Master Library",        copy: /Architect complex learning journeys/i },
  { path: "/master-courses/builder", role: "superAdmin", h1: "Master Course Studio", level: 2, copy: /3-tier hierarchy/i },
  { path: "/approvals",              role: "superAdmin", h1: "Quality Assurance",     copy: /Review and moderate content submissions/i },
  { path: "/audit",                  role: "superAdmin", h1: "Audit & Analytics",     copy: /Platform-wide storage intelligence/i },
  { path: "/certificate-templates",  role: "superAdmin", h1: "Certificate Templates", copy: /Design premium credentials/i },
  { path: "/onboarding",             role: "superAdmin", h1: "Tenant Onboarding",     copy: /Complete all steps to create a new tenant/i },
];

const MANAGER: PageSpec[] = [
  { path: "/manager-dashboard",              role: "manager", h1: "Team Dashboard",  copy: /Monitor your team.s learning progress/i },
  { path: "/manager-dashboard/team",         role: "manager", h1: "My Team",         copy: /Manage and monitor your team.s learning progress/i },
  { path: "/manager-dashboard/courses",      role: "manager", h1: "My Courses",      copy: /Your assigned learning courses/i },
  { path: "/manager-dashboard/certificates", role: "manager", h1: "My Certificates", copy: /Your earned certificates and achievements/i },
];

const PARENT: PageSpec[] = [
  { path: "/parent-dashboard",              role: "parent", h1: "Dashboard",         copy: /Track your organization.s performance/i },
  { path: "/parent-dashboard/credits",      role: "parent", h1: "Class Credits",     copy: /View your child.s credit balance/i },
  { path: "/parent-dashboard/homework",     role: "parent", h1: "Homework Status",   copy: /Track your child.s homework assignments/i },
  { path: "/parent-dashboard/live-classes", role: "parent", h1: "Live Class Status", copy: /Monitor your child.s live classes/i },
  { path: "/parent-dashboard/schedule",     role: "parent", h1: "Class Schedule",    copy: /View your child.s upcoming classes/i },
];

const SUB_ADMIN: PageSpec[] = [
  { path: "/sub-admin-dashboard", role: "subAdmin", h1: "Sub Admin Dashboard", copy: /Delegated administration overview/i },
];

function suite(name: string, specs: PageSpec[]) {
  test.describe(name, () => {
    for (const { path, role, h1, level, copy } of specs) {
      test(`${role} renders ${path}`, async ({ page }) => {
        test.setTimeout(150_000);

        const probe = watch(page);
        const status = await gotoAs(page, role, path);

        expect(status, `${path}: navigation did not return 200`).toBe(200);
        await expectRealPage(page, { path, heading: { name: h1, level: level ?? 1 }, text: copy });
        expectNoServerErrors(probe, path);

        if (probe.apiFailures.length) {
          console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
        }
      });
    }
  });
}

suite("Phase 34 — (super-admin) pages", SUPER_ADMIN);
suite("Phase 34 — (manager) pages", MANAGER);
suite("Phase 34 — (parent) pages", PARENT);
suite("Phase 34 — (sub-admin) pages", SUB_ADMIN);

test.describe("Phase 34 — super-admin pages surface cross-tenant data", () => {
  /**
   * SUPER_ADMIN crosses tenants by design (CONVENTIONS rule 6), so `/tenants`
   * is the one place where seeing BOTH fixture orgs is correct behaviour and
   * their absence would mean the list never loaded.
   */
  test("/tenants lists both seeded organizations", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    await gotoAs(page, "superAdmin", "/tenants", { settle: 2_000 });

    await expect(page.getByText("QuikLMS E2E", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText("QuikLMS E2E Other", { exact: false }).first(),
      "/tenants did not list the second seeded org — the cross-tenant read returned nothing",
    ).toBeVisible({ timeout: 20_000 });

    expectNoServerErrors(probe, "/tenants");
  });
});
