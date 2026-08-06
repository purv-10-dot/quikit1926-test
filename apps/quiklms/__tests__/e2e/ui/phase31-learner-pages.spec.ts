/**
 * PHASE 31 — the seven `(learner)` pages.
 *
 * Each page is loaded in a real browser as the seeded LEARNER (its owning role —
 * F-001 means a wrong-role load still renders, but its XHRs 403 and the page
 * would look broken for reasons that have nothing to do with the page).
 *
 * "It returned 200" proves nothing here: `app/(shared)/[...slug]/page.tsx` 200s
 * with a placeholder for any unmatched URL. Every test therefore asserts a
 * heading/copy pair that only the real component renders, asserts the scaffold
 * marker is ABSENT, and asserts no crash state — plus that none of the page's
 * own XHRs 5xx'd underneath a shell that still looked fine.
 *
 * Markers were taken from an actual browser render against the freshly seeded
 * fixture tenant, not from reading JSX, so they match what a user sees.
 */

import { test, expect } from "@playwright/test";
import {
  watch, gotoAs, expectRealPage, expectNoServerErrors, bodyText,
} from "../fixtures/page";

const PAGES: Array<{ path: string; h1: string | RegExp; copy: RegExp }> = [
  { path: "/learner/dashboard",     h1: /^Welcome back,/,            copy: /Always keep learning and growing your skills/i },
  { path: "/learner/certificates",  h1: "Certificates & Achievements", copy: /Your learning accomplishments/i },
  { path: "/learner/course-status", h1: "Course status",             copy: /Assigned courses by status/i },
  { path: "/learner/exams",         h1: "My Exams",                  copy: /View upcoming exams and past results/i },
  { path: "/learner/homework",      h1: "Homework",                  copy: /View assignments and submit work/i },
  { path: "/learner/schedule",      h1: "My Classes",                copy: /Upcoming live sessions for this week/i },
  { path: "/learner/tutoring",      h1: "One-on-One Tutoring",       copy: /Request personalized sessions with your teachers/i },
];

test.describe("Phase 31 — (learner) pages render for their owning role", () => {
  for (const { path, h1, copy } of PAGES) {
    test(`LEARNER renders ${path}`, async ({ page }) => {
      // Cold App Router compiles on this dev server run 20-40s per new route.
      test.setTimeout(150_000);

      const probe = watch(page);
      const status = await gotoAs(page, "learner", path);

      expect(status, `${path}: navigation did not return 200`).toBe(200);
      await expectRealPage(page, { path, heading: { name: h1, level: 1 }, text: copy });
      expectNoServerErrors(probe, path);

      if (probe.apiFailures.length) {
        console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
      }
    });
  }
});

test.describe("Phase 31 — learner pages surface their seeded data", () => {
  /**
   * A page that renders its chrome but never resolves its data reads as "works"
   * to a shell-only assertion. The fixture tenant seeds exactly one published
   * course assigned to the learner, so the dashboard must show it — this is the
   * assertion that would catch a silently-failing data path.
   */
  test("dashboard lists the seeded course assignment", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    await gotoAs(page, "learner", "/learner/dashboard");

    await expect(
      page.getByText("E2E Published Course").first(),
      "learner dashboard did not render the learner's one seeded course assignment",
    ).toBeVisible({ timeout: 20_000 });

    expectNoServerErrors(probe, "/learner/dashboard");
  });

  /**
   * The seed creates one ScheduledClass (`scheduledClassId`) on the batch the
   * learner belongs to. The weekly grid must therefore either show it or an
   * explicit empty state — what it must NOT do is sit on a spinner forever,
   * which is what an unresolved/erroring XHR looks like to a user.
   */
  test("schedule resolves its week grid rather than hanging on a spinner", async ({ page }) => {
    test.setTimeout(150_000);
    const probe = watch(page);
    await gotoAs(page, "learner", "/learner/schedule", { settle: 4_000 });

    const text = await bodyText(page);
    console.log(`[SCHEDULE] tail=${JSON.stringify(text.slice(-160))}`);
    expectNoServerErrors(probe, "/learner/schedule");

    expect(
      /Loading\.\.\.\s*$/.test(text),
      "/learner/schedule is still showing 'Loading…' after the network went idle — " +
        "its class-list XHR never resolved into a rendered state",
    ).toBe(false);
  });
});
