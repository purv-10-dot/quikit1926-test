/**
 * PHASE 35 — the six `(fullscreen)` pages.
 *
 * These are the only pages that need real entity ids: five take the seeded
 * published course id from the manifest, and `/exam/[examId]/take` takes an
 * exam id fetched at runtime from `GET /api/exams` as the tenant admin (exam
 * ids are not in the manifest).
 *
 * Unlike every other route group, `(fullscreen)/layout.tsx` renders no shell, so
 * an unmatched id here produces a genuinely blank page rather than the catch-all
 * scaffold — which makes the "did the real page render" question sharper, not
 * looser. Each assertion keys on content that can only come from the seeded
 * course/exam (its title, its module names, the exam's proctoring disclosure).
 *
 * Note on the video errors these pages log: the seed points lessons at
 * `https://example.test/v.mp4`, which does not resolve. `MEDIA_ERR_SRC_NOT_SUPPORTED`
 * is therefore fixture data, not an app defect, and is not asserted against.
 */

import { test, expect } from "@playwright/test";
import { watch, gotoAs, expectRealPage, expectNoServerErrors, bodyText } from "../fixtures/page";
import { loadManifest } from "../fixtures/auth";
import { apiAs, safeJson } from "../fixtures/api";

const m = loadManifest();
const COURSE = m.courses.published;

let examId = "";

test.beforeAll(async () => {
  // Rule 9: setTimeout inside the hook — a describe-level call does not extend it.
  test.setTimeout(90_000);
  const admin = await apiAs("tenantAdmin", { timeout: 60_000 });
  try {
    const res = await admin.get("/api/exams");
    const body = (await safeJson(res)) as { data?: Array<{ id: string; title: string }> };
    examId = body?.data?.[0]?.id ?? "";
    console.log(`[SETUP] exam id from GET /api/exams → ${examId || "(none)"}`);
  } finally {
    await admin.dispose();
  }
});

test.describe("Phase 35 — course player surfaces", () => {
  const PLAYERS: Array<{ path: string; h1: string; copy: RegExp; distinguishes: string }> = [
    {
      path: `/learner/course/${COURSE}`,
      h1: "E2E Published Course",
      copy: /Save & Exit/i,
      distinguishes: "UniversalLMSPlayer — the 'standard' mode of components/players/CoursePlayer",
    },
    {
      path: `/learner/course/${COURSE}/legacy`,
      h1: "E2E Published Course",
      copy: /Overall Progress/i,
      distinguishes: "LockedCoursePlayer — the 'legacy' mode of CoursePlayer",
    },
  ];

  /**
   * `/course-player/:id` and `/learner/course/:id/view` are RETIRED — both now
   * redirect to the canonical player. They used to be separate learner-facing
   * players with no forward-seek restriction, and `/course-player` additionally
   * offered a "Mark Complete" button on quiz lessons, which let a learner reach
   * 100% and earn a certificate without answering a question.
   *
   * Asserting the redirect (rather than deleting these cases) is what stops a
   * future change from quietly reinstating a second, unrestricted player: if
   * either path renders its own shell again, this fails.
   */
  for (const retired of [`/course-player/${COURSE}`, `/learner/course/${COURSE}/view`]) {
    test(`LEARNER is redirected from the retired ${retired}`, async ({ page }) => {
      test.setTimeout(180_000);

      const probe = watch(page);
      const status = await gotoAs(page, "learner", retired, { settle: 2_500 });

      expect(status, `${retired}: navigation did not return 200`).toBe(200);
      expect(
        new URL(page.url()).pathname,
        `${retired}: expected a redirect to the canonical player`,
      ).toBe(`/learner/course/${COURSE}`);

      // And it must be the REAL canonical player, not an empty shell.
      await expectRealPage(page, {
        path: retired,
        heading: { name: "E2E Published Course", level: 1 },
        text: /Save & Exit/i,
      });
      expectNoServerErrors(probe, retired);
    });
  }

  for (const { path, h1, copy, distinguishes } of PLAYERS) {
    test(`LEARNER renders ${path}`, async ({ page }) => {
      test.setTimeout(180_000);

      const probe = watch(page);
      const status = await gotoAs(page, "learner", path, { settle: 2_500 });

      expect(status, `${path}: navigation did not return 200`).toBe(200);
      await expectRealPage(page, { path, heading: { name: h1, level: 1 }, text: copy });

      // The course structure is the proof the player actually loaded ITS course.
      const text = await bodyText(page);
      expect(text, `${path}: ${distinguishes} did not render the seeded module tree`).toMatch(
        /Module 1 — Basics/i,
      );

      expectNoServerErrors(probe, path);
      if (probe.apiFailures.length) console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
    });
  }
});

test.describe("Phase 35 — lesson completion page", () => {
  /**
   * `/learner/course/[courseId]/complete` reads `params.lessonId`
   * (page.tsx:50) but its own route segment provides only `courseId` — no
   * `[lessonId]` segment exists anywhere under `app/` (only under `app/api/`).
   * `currentLesson` is therefore permanently null and the page can only ever
   * render its "No lesson selected" placeholder. The assertion below records
   * that as the observed behaviour; the finding is in the report.
   */
  test("renders, but can never select a lesson", async ({ page }) => {
    test.setTimeout(180_000);
    const path = `/learner/course/${COURSE}/complete`;

    const probe = watch(page);
    const status = await gotoAs(page, "learner", path, { settle: 2_000 });

    expect(status).toBe(200);
    await expectRealPage(page, { path, heading: { name: "Lesson", level: 1 }, text: /Course Information/i });
    expectNoServerErrors(probe, path);

    const text = await bodyText(page);
    console.log(`[COMPLETE] body=${JSON.stringify(text.slice(0, 200))}`);

    expect(
      /No lesson selected/i.test(text),
      `${path}: the page selected a lesson — the dead \`params.lessonId\` read at ` +
        `app/(fullscreen)/learner/course/[courseId]/complete/page.tsx:50 has been fixed, ` +
        `update this test and the finding`,
    ).toBe(true);
  });
});

test.describe("Phase 35 — exam runner", () => {
  test("LEARNER renders /exam/[examId]/take for the seeded exam", async ({ page }) => {
    test.setTimeout(180_000);
    expect(examId, "GET /api/exams returned no exam — reseed before running this phase").not.toBe("");

    const path = `/exam/${examId}/take`;
    const probe = watch(page);
    const status = await gotoAs(page, "learner", path, { settle: 2_500 });

    expect(status, `${path}: navigation did not return 200`).toBe(200);
    // NOTE on what this does and does not prove: ExamRunner fetches nothing on
    // mount (components/players/ExamRunner.tsx:74-145) — the disclosure screen
    // is static and the exam is only resolved by
    // `POST /exam-sessions/[examId]/start` behind the Start button. So this
    // asserts the runner MOUNTS, not that the exam exists; the identity check is
    // the next test, which starts from the same screen with a bogus id.
    await expectRealPage(page, {
      path,
      heading: { name: "Proctored Exam", level: 1 },
      text: /Exam Rules & Proctoring Disclosure/i,
    });
    expectNoServerErrors(probe, path);

    if (probe.apiFailures.length) console.log(`[XHR ${path}] ${JSON.stringify(probe.apiFailures)}`);
  });

  test("[informational] the runner shows its rules screen for a non-existent exam", async ({ page }) => {
    /**
     * Control for the test above, and a finding in its own right: because the
     * disclosure phase does no lookup, `/exam/<any-uuid>/take` renders a full
     * proctoring disclosure for an exam that does not exist. The learner only
     * finds out when they press Start and the session POST fails. Cosmetic, not
     * a security issue — the start endpoint is authorised server-side.
     */
    test.setTimeout(180_000);
    const path = "/exam/00000000-0000-0000-0000-000000000000/take";
    await gotoAs(page, "learner", path, { settle: 2_000 });
    const text = await bodyText(page);
    console.log(`[EXAM-BOGUS-ID] body=${JSON.stringify(text.slice(0, 160))}`);

    expect(text, `${path}: the (shared) scaffold rendered for a fullscreen route`).not.toMatch(
      /wired to its API and ready for UI build-out/i,
    );
    // Documents the observed behaviour so a future fix shows up as a red test.
    expect(
      /Exam Rules & Proctoring Disclosure/i.test(text),
      `${path}: the runner now validates the exam id before showing its rules screen — ` +
        `good; update this test and drop the finding`,
    ).toBe(true);
  });
});
