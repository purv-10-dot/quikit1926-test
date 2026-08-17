/**
 * PHASE 33 — a representative 20 of the 40 `(tenant-admin)` pages.
 *
 * The 13 pages the audit brief names explicitly are all here (`/tenant-dashboard`,
 * `/courses`, `/students`, `/teachers`, `/batches`, `/exams`, `/certificates`,
 * `/user-management`, `/analytics`, `/branding`, `/groups`, `/payouts`,
 * `/question-bank`), plus seven that exercise the remaining shapes in the group:
 * a wizard (`/create-course`), a settings surface (`/storage`), a media list
 * (`/recordings`), a cross-entity assignment view (`/course-assignments`), and
 * three roster/administration pages.
 *
 * Loaded as TENANT_ADMIN — the owner. Because layouts enforce nothing (F-001),
 * loading these as anyone else produces a rendered-but-empty shell whose failure
 * mode is indistinguishable from a broken page, which would make every result
 * here meaningless.
 *
 * Every assertion pairs an <h1> with page-specific body copy and requires the
 * `(shared)/[...slug]` scaffold to be absent — the catch-all 200s for any URL.
 */

import { test, expect } from "@playwright/test";
import { watch, gotoAs, expectRealPage, expectNoServerErrors } from "../fixtures/page";

const PAGES: Array<{ path: string; h1: string | RegExp; copy: RegExp }> = [
  { path: "/tenant-dashboard",    h1: "Dashboard",              copy: /Overview of your learning management system/i },
  { path: "/courses",             h1: "Content Library",        copy: /All courses assigned to your organi/i },
  { path: "/students",            h1: "Student Management",     copy: /Manage enrolled students/i },
  { path: "/teachers",            h1: "Teacher Management",     copy: /Manage your school'?s teaching st/i },
  { path: "/batches",             h1: "Batch Management",       copy: /Manage your class batches/i },
  { path: "/exams",               h1: "Exams",                  copy: /Create and manage proctored/i },
  { path: "/certificates",        h1: "Certificate Templates",  copy: /Create and manage certificate/i },
  { path: "/user-management",     h1: "Learner Management",     copy: /Manage and bulk upload learners/i },
  { path: "/analytics",           h1: "Analytics Dashboard",    copy: /Corporate learning performance/i },
  { path: "/branding",            h1: /Local Branding/,         copy: /Customize your organ/i },
  { path: "/groups",              h1: "Groups",                 copy: /Organize learners into groups/i },
  { path: "/payouts",             h1: "Teacher Payouts",        copy: /Manage monthly teacher payments/i },
  { path: "/question-bank",       h1: "Question Bank",          copy: /questions? availab/i },
  { path: "/parents",             h1: "Parent Management",      copy: /Manage parents and their child/i },
  { path: "/sub-admins",          h1: "Sub Admins",             copy: /Manage delegated admins/i },
  { path: "/compliance",          h1: "Compliance & Analytics", copy: /Monitor training progress/i },
  { path: "/course-assignments",  h1: "Course Assignments",     copy: /Assign courses to users or group/i },
  { path: "/create-course",       h1: "Create New Course",      copy: /Step 1 of 4/i },
  { path: "/recordings",          h1: "Class Recordings",       copy: /View and manage recorded classes/i },
  { path: "/storage",             h1: "Storage Monitor",        copy: /Monitor your organization/i },
];

test.describe("Phase 33 — (tenant-admin) pages render for their owning role", () => {
  for (const { path, h1, copy } of PAGES) {
    test(`TENANT_ADMIN renders ${path}`, async ({ page }) => {
      test.setTimeout(150_000);

      const probe = watch(page);
      const status = await gotoAs(page, "tenantAdmin", path);

      expect(status, `${path}: navigation did not return 200`).toBe(200);
      await expectRealPage(page, { path, heading: { name: h1, level: 1 }, text: copy });
      expectNoServerErrors(probe, path);

      if (probe.apiFailures.length) {
        console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
      }
    });
  }
});

test.describe("Phase 33 — admin pages surface their seeded tenant data", () => {
  /**
   * Chrome-only assertions can't tell "the list is empty because the tenant has
   * no rows" from "the list is empty because the read failed". The fixture
   * tenant has exactly one of each of these, so their absence is a real signal.
   */
  const DATA: Array<{ path: string; needle: string }> = [
    { path: "/batches",         needle: "E2E Batch A" },
    { path: "/exams",           needle: "E2E Midterm" },
    { path: "/user-management", needle: "e2e-learner@quiklms.test" },
  ];

  for (const { path, needle } of DATA) {
    test(`${path} shows ${needle}`, async ({ page }) => {
      test.setTimeout(150_000);
      const probe = watch(page);
      await gotoAs(page, "tenantAdmin", path, { settle: 2_000 });

      await expect(
        page.getByText(needle, { exact: false }).first(),
        `${path} rendered but did not list the seeded row "${needle}" — its list XHR ` +
          `returned nothing, or scoped the query to the wrong org`,
      ).toBeVisible({ timeout: 20_000 });

      expectNoServerErrors(probe, path);
    });
  }

  /**
   * Two admin pages render an empty list against the fixture tenant, and both
   * were verified to be CORRECT rather than broken — recorded here so the next
   * person does not re-investigate them:
   *
   *  - `/courses` ("Content Library") reads `/api/course-assignments/courses`,
   *    i.e. MASTER courses a ADMIN has assigned down to the org. The seed
   *    creates org-authored courses (`/api/courses` returns both of them) but no
   *    master-course assignment, so "All Courses (0)" is the right answer.
   *  - `/teachers` and `/parents` read `/api/users`, which at
   *    `app/api/users/route.ts:14` excludes TEACHER and PARENT for any tenant
   *    whose `tenantType` is `corporate`. The fixture org is corporate, and the
   *    corporate sidebar does not link either page. Empty is by design.
   */
  test("[informational] /courses lists master-course assignments, not org courses", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    await gotoAs(page, "tenantAdmin", "/courses", { settle: 2_000 });

    const assignmentReads = probe.apiFailures.length;
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
    console.log(`[INFO /courses] ${JSON.stringify(text.slice(-220))} apiFailures=${assignmentReads}`);

    // The page is healthy: it resolved to a definitive state, not a spinner.
    expect(text).toMatch(/All Courses \(\d+\)/);
    expectNoServerErrors(probe, "/courses");
  });
});

test.describe("Phase 33 — the catch-all does not masquerade as an admin page", () => {
  /**
   * Control test. Without this, every assertion above could be satisfied by the
   * scaffold, and the phase would prove nothing. `/total-nonsense` is not a
   * route; it must produce the scaffold, and the scaffold must be detectable.
   */
  test("an unmatched admin-looking URL renders the scaffold, not a page", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoAs(page, "tenantAdmin", "/definitely-not-a-real-admin-page");
    const text = await page.evaluate(() => document.body.innerText);

    expect(
      /wired to its API and ready for UI build-out/i.test(text),
      "the (shared)/[...slug] catch-all did not render for an unmatched URL — " +
        "the scaffold guard used by every other test in this phase would be vacuous",
    ).toBe(true);
  });
});
