/**
 * PHASE 32 — the nine `(teacher)` pages under /teacher-dashboard/*.
 *
 * Same contract as phase 31: loaded as the owning TEACHER, asserted on a
 * heading+copy pair that only the real component produces, with the
 * `(shared)/[...slug]` scaffold explicitly required to be absent (it 200s for
 * any unmatched URL, so a bare status assertion is meaningless).
 *
 * The teacher fixture is the one role with meaningful seeded data across most
 * of its surface — one batch (`E2E Batch A`), one scheduled class
 * (`E2E Class 1`) and one homework (`E2E Homework 1`) — so the second describe
 * checks those actually reach the screen rather than settling for chrome.
 */

import { test, expect } from "@playwright/test";
import { watch, gotoAs, expectRealPage, expectNoServerErrors } from "../fixtures/page";

const PAGES: Array<{ path: string; h1: string | RegExp; copy: RegExp }> = [
  { path: "/teacher-dashboard",              h1: "Dashboard",             copy: /Your weekly class schedule/i },
  { path: "/teacher-dashboard/attendance",   h1: "Mark Attendance",       copy: /Record student attendance for your classes/i },
  { path: "/teacher-dashboard/availability", h1: "My Availability",       copy: /Set your weekly available time slots/i },
  { path: "/teacher-dashboard/batches",      h1: "My Classes",            copy: /Your weekly class schedule/i },
  { path: "/teacher-dashboard/homework",     h1: "Homework",              copy: /Create and manage homework assignments/i },
  { path: "/teacher-dashboard/level",        h1: "Teacher Level",         copy: /Track your performance and progress/i },
  { path: "/teacher-dashboard/non-teaching", h1: "My Non-Teaching Tasks", copy: /Tasks assigned to you outside of class work/i },
  { path: "/teacher-dashboard/payouts",      h1: "My Payouts",            copy: /View your earnings and payout history/i },
  { path: "/teacher-dashboard/tutoring",     h1: "Tutoring Requests",     copy: /Review and manage student session proposals/i },
];

test.describe("Phase 32 — (teacher) pages render for their owning role", () => {
  for (const { path, h1, copy } of PAGES) {
    test(`TEACHER renders ${path}`, async ({ page }) => {
      test.setTimeout(150_000);

      const probe = watch(page);
      const status = await gotoAs(page, "teacher", path);

      expect(status, `${path}: navigation did not return 200`).toBe(200);
      await expectRealPage(page, { path, heading: { name: h1, level: 1 }, text: copy });
      expectNoServerErrors(probe, path);

      if (probe.apiFailures.length) {
        console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
      }
    });
  }
});

test.describe("Phase 32 — teacher pages surface their seeded data", () => {
  const DATA: Array<{ path: string; needle: string; why: string }> = [
    { path: "/teacher-dashboard/batches",  needle: "E2E Class 1",    why: "the seeded ScheduledClass on the teacher's own batch" },
    { path: "/teacher-dashboard/homework", needle: "E2E Homework 1", why: "the seeded Homework row for the teacher's batch" },
  ];

  for (const { path, needle, why } of DATA) {
    test(`${path} shows ${needle}`, async ({ page }) => {
      test.setTimeout(150_000);
      const probe = watch(page);
      await gotoAs(page, "teacher", path, { settle: 2_000 });

      await expect(
        page.getByText(needle).first(),
        `${path} rendered its shell but not ${why} — the data XHR resolved empty or errored`,
      ).toBeVisible({ timeout: 20_000 });

      expectNoServerErrors(probe, path);
    });
  }

  /**
   * The attendance page's class list lives in a <select>. `toBeVisible()` is
   * wrong here — Playwright reports every <option> inside a closed select as
   * hidden, so a visibility assertion fails on a page that is working perfectly.
   * Assert on the option's presence in the DOM instead.
   */
  test("/teacher-dashboard/attendance populates its class picker", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    await gotoAs(page, "teacher", "/teacher-dashboard/attendance", { settle: 2_000 });

    const options = page.locator("select option");
    await expect
      .poll(() => options.count(), { timeout: 20_000 })
      .toBeGreaterThan(1); // placeholder + at least one real class

    const labels = await options.allTextContents();
    expect(
      labels.some((l) => /E2E Class 1/.test(l)),
      `/teacher-dashboard/attendance did not offer the teacher's seeded class; options were ` +
        JSON.stringify(labels.slice(0, 5)),
    ).toBe(true);

    expectNoServerErrors(probe, "/teacher-dashboard/attendance");
  });
});
