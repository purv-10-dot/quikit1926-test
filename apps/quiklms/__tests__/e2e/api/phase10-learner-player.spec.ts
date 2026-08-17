/**
 * PHASE 10 — Player runtime (`/api/learner/*`, `/api/player/*`).
 *
 * These are the endpoints the course player calls while a learner is actually
 * sitting in a lesson: position sync, resource completion, quiz submission,
 * SCORM/xAPI telemetry, and a file proxy. They share a design stance that shapes
 * every test here — **they are built never to interrupt playback**. Concretely:
 *
 *   - `PATCH /api/player/sync` catches its own errors and returns
 *     `{ success: false, message }` at **HTTP 200**. It can never return a
 *     non-2xx.
 *   - `learner/sync-progress`, `learner/sync-audio` and `player/xapi-statements`
 *     return `{ success: false }` at HTTP 200 when the session lacks org/user.
 *   - `learner/resume/[lessonId]` and `learner/assessments/[id]/attempts`
 *     swallow unknown ids into a successful empty/default payload.
 *
 * Consequence for assertions, and the reason this docblock leads with it:
 * **asserting on `res.status()` alone would pass on failure for most of this
 * surface.** Every test below asserts the `success` field and the payload
 * shape, not just the status code.
 *
 * Methods actually exported (several are PATCH, not POST):
 *   /api/learner/complete-resource                    POST
 *   /api/learner/submit-quiz                          POST
 *   /api/learner/sync-progress                        PATCH
 *   /api/learner/sync-audio                           PATCH
 *   /api/learner/resume/[lessonId]                    GET
 *   /api/learner/file-proxy                           GET
 *   /api/learner/assessments/[assessmentId]/attempts  GET
 *   /api/player/sync                                  PATCH
 *   /api/player/xapi-statements                       POST
 */

import { test, expect } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";
import { loadManifest } from "../fixtures/auth";

const m = loadManifest();
const COURSE = m.courses.published;
const MODULE = m.modules[0].id;
const LESSON = m.modules[0].lessons[0];
const ASSESSMENT = m.assessmentId;
const NONEXISTENT = "00000000-0000-4000-8000-000000000000";

interface Ok<T = unknown> {
  success?: boolean;
  data?: T;
  message?: string;
}

test.describe("Phase 10 — progress sync", () => {
  test("PATCH /api/learner/sync-progress records position and percentage", async () => {
    const api = await apiAs("learner");
    const res = await api.patch("/api/learner/sync-progress", {
      data: { courseId: COURSE, moduleId: MODULE, lessonId: LESSON, completionPercentage: 40, currentPosition: "time:90" },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ learnerId: string; orgId: string }>;
    expect(body.success, "success:false is returned at HTTP 200 — assert the field, not the status").toBe(true);
    expect(body.message).toBe("Progress synced successfully");
    expect(body.data?.learnerId).toBe(m.users.learner.userId);
    await api.dispose();
  });

  test("PATCH /api/learner/sync-audio maps audio fields onto the progress row", async () => {
    const api = await apiAs("learner");
    const res = await api.patch("/api/learner/sync-audio", {
      // Note the distinct field names this route expects: subModuleId → lessonId,
      // progress → completionPercentage, currentTime → currentPosition.
      data: { courseId: COURSE, subModuleId: LESSON, progress: 30, currentTime: 12 },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ learnerId: string }>;
    expect(body.success).toBe(true);
    expect(body.message).toBe("Audio progress synced successfully");
    expect(body.data?.learnerId).toBe(m.users.learner.userId);
    await api.dispose();
  });

  test("POST /api/learner/complete-resource marks a resource complete", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/learner/complete-resource", {
      data: { courseId: COURSE, subModuleId: LESSON, type: "pdf", percentRead: 100, lastPageSeen: 12 },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ lessonProgress?: Record<string, unknown> }>;
    expect(body.success).toBe(true);
    expect(body.message).toBe("Resource marked as completed");
    // Read back through the progress surface — proves the lessonProgress blob
    // was actually written, not just echoed.
    const readBack = await api.get(`/api/progress/${COURSE}`);
    const rb = (await safeJson(readBack)) as Ok<{ lessonProgress?: Record<string, unknown> }>;
    expect(rb.data?.lessonProgress, "the completed resource must persist on the progress row").toHaveProperty(LESSON);
    await api.dispose();
  });

  test("PATCH /api/player/sync accepts SCORM suspend data", async () => {
    const api = await apiAs("learner");
    const res = await api.patch("/api/player/sync", {
      data: {
        courseId: COURSE,
        lessonId: LESSON,
        completionPercentage: 60,
        suspendData: "phase10-suspend-blob",
        scormData: { "cmi.core.lesson_status": "incomplete", "cmi.core.score.raw": "70" },
      },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ learnerId: string }>;
    expect(body.success, "this route returns success:false at 200 on any failure").toBe(true);
    expect(body.message).toBe("Progress synced successfully");
    await api.dispose();
  });

  test("POST /api/player/xapi-statements accepts a statement batch", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/player/xapi-statements", {
      data: {
        statements: [
          { verb: { id: "http://adlnet.gov/expapi/verbs/experienced" }, object: { id: `urn:lesson:${LESSON}` } },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok;
    expect(body.success).toBe(true);
    expect(body.message).toBe("xAPI statements processed successfully");
    await api.dispose();
  });

  test("POST /api/player/xapi-statements rejects a malformed statement with 400", async () => {
    const api = await apiAs("learner");
    // `verb.id` is the one field the schema actually requires.
    const res = await api.post("/api/player/xapi-statements", { data: { statements: [{ verb: {} }] } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error?.length).toBeGreaterThan(0);
    await api.dispose();
  });
});

test.describe("Phase 10 — resume, attempts, file proxy", () => {
  test("GET /api/learner/resume/[lessonId] returns a resume position", async () => {
    const api = await apiAs("learner");
    await api.patch("/api/learner/sync-progress", {
      data: { courseId: COURSE, lessonId: LESSON, completionPercentage: 25, currentPosition: "time:77" },
    });
    const res = await api.get(`/api/learner/resume/${LESSON}?courseId=${COURSE}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ lastTime: number; lastPage: number }>;
    expect(body.success).toBe(true);
    expect(typeof body.data?.lastTime).toBe("number");
    expect(typeof body.data?.lastPage).toBe("number");
    await api.dispose();
  });

  test("GET /api/learner/resume/[lessonId] defaults cleanly for an unknown lesson", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/learner/resume/${NONEXISTENT}?courseId=${COURSE}`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{ lastTime: number; lastPage: number }>;
    expect(body.success).toBe(true);
    // Documented default rather than a 404 — the player must always get a
    // startable position.
    expect(body.data?.lastTime).toBe(0);
    expect(body.data?.lastPage).toBe(1);
    await api.dispose();
  });

  test("GET attempts returns an array for an unknown assessment rather than 404", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/learner/assessments/${NONEXISTENT}/attempts`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<unknown[]>;
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    await api.dispose();
  });

  test("GET /api/learner/file-proxy requires a url parameter", async () => {
    const api = await apiAs("learner");
    const res = await api.get("/api/learner/file-proxy");
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { message?: string };
    expect(body.message).toContain("URL parameter is required");
    await api.dispose();
  });

  test("GET /api/learner/file-proxy refuses a link-local SSRF target", async () => {
    const api = await apiAs("learner");
    // 169.254.169.254 is the cloud metadata endpoint — the canonical SSRF
    // target. `assertSafeFetchUrl` resolves and rejects it.
    const res = await api.get(
      `/api/learner/file-proxy?url=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`,
    );
    expect(
      res.status(),
      "SSRF guard must reject the cloud metadata address",
    ).toBe(400);
    await api.dispose();
  });

  test("GET /api/learner/file-proxy refuses a loopback SSRF target", async () => {
    const api = await apiAs("learner");
    const res = await api.get(`/api/learner/file-proxy?url=${encodeURIComponent("http://127.0.0.1:3014/api/health")}`);
    expect(res.status(), "SSRF guard must reject loopback").toBe(400);
    await api.dispose();
  });

  test("unauthenticated callers are rejected across the player surface", async () => {
    const anon = await apiAnon();
    const res = await anon.patch("/api/player/sync", { data: { courseId: COURSE } });
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });
});

test.describe("Phase 10 — submit-quiz", () => {
  test("POST /api/learner/submit-quiz grades a submission and returns a tally", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/learner/submit-quiz", {
      data: {
        assessmentId: ASSESSMENT,
        courseId: COURSE,
        // Answers are matched by POSITIONAL index as a string, NOT by a real
        // question id — see the phase 11 docblock. "0"/"1"/"2" are the only
        // values that can ever match.
        answers: [
          { questionId: "0", selectedAnswerIndex: 1 },
          { questionId: "1", selectedAnswerIndex: 1 },
          { questionId: "2", selectedAnswerIndex: 1 },
        ],
      },
    });
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<{
      correctCount: number;
      wrongCount: number;
      totalQuestions: number;
      attemptsRemaining: number;
    }>;
    expect(body.success).toBe(true);
    expect(body.data?.totalQuestions).toBe(3);
    // The seeded assessment's correct answers are indices 1, 1, 1.
    expect(body.data?.correctCount).toBe(3);
    expect(body.data?.wrongCount).toBe(0);
    await api.dispose();
  });

  test("POST /api/learner/submit-quiz with an unknown assessment is 404", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/learner/submit-quiz", {
      data: { assessmentId: NONEXISTENT, courseId: COURSE, answers: [] },
    });
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test("POST /api/learner/submit-quiz requires assessmentId and courseId", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/learner/submit-quiz", { data: { answers: [] } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as { error?: string };
    expect(body.error).toContain("assessmentId");
    expect(body.error).toContain("courseId");
    await api.dispose();
  });
});

test.describe("Phase 10 — findings", () => {
  /**
   * FINDING (Medium) — three player routes return 500 for a missing courseId.
   *
   * Endpoint : POST  /api/learner/complete-resource
   *            PATCH /api/learner/sync-progress
   *            PATCH /api/learner/sync-audio
   * Observed : a body of `{}` → HTTP 500 `{"statusCode":500,"message":
   *            "Internal server error"}` on all three.
   * Expected : 400 identifying the missing field.
   * Root cause: each route parses with `parseBody(req, z.object({}).passthrough())`
   *            — no validation — and reads `courseId` with a bare cast, so
   *            `undefined` flows into `syncProgress`
   *            (lib/services/progress-service.ts) and is used as a component of
   *            the `orgId_learnerId_courseId` compound key in a
   *            `prisma.lmsProgress.upsert`. Prisma rejects it and lib/http.ts's
   *            catch-all converts it to a 500.
   *            This is the same defect as the phase 09 finding on
   *            `POST /api/progress` / `PATCH /api/progress/sync-progress` —
   *            five routes in total share the pattern, which is why it is worth
   *            fixing at the schema level rather than per route.
   *
   * Notable inconsistency: `PATCH /api/player/sync`, which does exactly the same
   * job, DOES check for `courseId` — but answers with
   * `{ success: false, message: 'Course ID is required' }` at HTTP **200**. So
   * across one feature area the same missing field produces a 500 on three
   * routes and a masked 200 on a fourth.
   *
   * Left FAILING intentionally (three tests).
   */
  const MISSING_COURSE_ID: Array<{ label: string; run: (api: Awaited<ReturnType<typeof apiAs>>) => Promise<{ status(): number }> }> = [
    {
      label: "POST /api/learner/complete-resource",
      run: (api) => api.post("/api/learner/complete-resource", { data: {} }),
    },
    {
      label: "PATCH /api/learner/sync-progress",
      run: (api) => api.patch("/api/learner/sync-progress", { data: {} }),
    },
    {
      label: "PATCH /api/learner/sync-audio",
      run: (api) => api.patch("/api/learner/sync-audio", { data: {} }),
    },
  ];

  for (const c of MISSING_COURSE_ID) {
    test(`${c.label} rejects a missing courseId with 400, not 500`, async () => {
      const api = await apiAs("learner");
      const res = await c.run(api);
      expect(
        res.status(),
        "z.object({}).passthrough() validates nothing; undefined reaches the Prisma compound key",
      ).toBe(400);
      await api.dispose();
    });
  }

  /**
   * FINDING (Medium) — /api/player/sync reports every failure as HTTP 200.
   *
   * Endpoint : PATCH /api/player/sync
   * Observed : a body with no `courseId` returns HTTP 200 with
   *            `{ success: false, message: "Course ID is required" }`. The
   *            route's own catch does the same for a service throw:
   *            `{ success: false, message: <error.message> }`, also at 200. It
   *            is structurally incapable of returning a non-2xx.
   * Expected : 400 for the missing field; 5xx for a genuine service failure.
   * Root cause: app/api/player/sync/route.ts — the handler wraps its body in a
   *            try/catch and both the guard and the catch call `json({ success:
   *            false, … })` without the second `status` argument, so
   *            lib/http.ts's `json()` defaults to 200.
   *
   * Severity Medium, and higher in practice than it first looks: this is the
   * SCORM progress-sync endpoint. Any client, monitor or retry layer that keys
   * on HTTP status — which is the normal thing to do — will record a silent,
   * permanent loss of learner progress as a success. Nothing will alert.
   *
   * Left FAILING intentionally.
   */
  test("PATCH /api/player/sync signals a missing courseId with a non-2xx status", async () => {
    const api = await apiAs("learner");
    const res = await api.patch("/api/player/sync", { data: {} });
    const body = (await safeJson(res)) as Ok;
    // Record the masking explicitly, then assert the contract.
    expect(body.success, "the body does correctly report failure").toBe(false);
    expect(
      res.status(),
      `progress-sync failure masked as HTTP ${res.status()} with success:false — ` +
        `retry/alerting layers keying on status will never see it`,
    ).toBe(400);
    await api.dispose();
  });

  /**
   * FINDING (Medium) — quiz attempt history is never recorded for real assessments.
   *
   * Endpoint : GET /api/learner/assessments/[assessmentId]/attempts
   * Observed : after successfully submitting the seeded assessment (which
   *            returns correctCount 3), this endpoint returns
   *            `{ success: true, data: [] }`. It returns `[]` for every
   *            assessment in the fixture, always.
   * Expected : the attempt just submitted appears in the history.
   * Root cause: lib/services/assessments-service.ts:119 and :253 —
   *              const UUID_RE = /^[0-9a-f]{8}-…-[0-9a-f]{12}$/i;   // :19
   *              // getQuizAttempts
   *              if (UUID_RE.test(assessmentId)) return [];          // :119
   *              // submitQuiz — persist only when NOT a UUID
   *              if (!UUID_RE.test(dto.assessmentId)) { …create LmsQuizAttempt… } // :253
   *            The intent (per the inline comment, "master-course quizzes aren't
   *            stored by assessmentId") is to skip attempt rows for quizzes
   *            embedded in master-course JSON, which carry synthetic non-UUID
   *            ids. But `lmsAssessment.id` is a Prisma-generated UUID, so
   *            `UUID_RE.test()` is TRUE for every assessment created through
   *            `POST /api/assessments`. The condition is inverted with respect
   *            to the id space that actually exists: the branch that writes
   *            `LmsQuizAttempt` rows is unreachable for standard assessments.
   *
   * Knock-on effect: `countLearnerAttempts` counts those same rows to enforce
   * `retryLimit`. With no rows ever written it falls back to inferring a single
   * prior attempt from `lessonProgress`, so the configured retry limit
   * (3 on the seeded assessment) is not actually enforced from attempt history.
   *
   * Left FAILING intentionally.
   */
  test("a submitted quiz attempt appears in the learner's attempt history", async () => {
    const api = await apiAs("learner");
    const submitted = await api.post("/api/learner/submit-quiz", {
      data: {
        assessmentId: ASSESSMENT,
        courseId: COURSE,
        answers: [
          { questionId: "0", selectedAnswerIndex: 1 },
          { questionId: "1", selectedAnswerIndex: 1 },
          { questionId: "2", selectedAnswerIndex: 1 },
        ],
      },
    });
    expect(submitted.status(), "setup: the submission itself must succeed").toBe(200);

    const res = await api.get(`/api/learner/assessments/${ASSESSMENT}/attempts`);
    expect(res.status()).toBe(200);
    const body = (await safeJson(res)) as Ok<unknown[]>;
    expect(
      body.data?.length,
      `no LmsQuizAttempt row is ever written for a UUID assessment id ` +
        `(assessments-service.ts:253 inverts the check) — history is permanently empty`,
    ).toBeGreaterThan(0);
    await api.dispose();
  });
});
