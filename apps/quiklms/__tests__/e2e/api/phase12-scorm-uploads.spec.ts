/**
 * PHASE 12 — SCORM processing (`/api/scorm/*`) and upload presigning
 * (`/api/upload/*`, 10 routes).
 *
 * SCOPE NOTE — deliberately no real uploads. Storage credentials are blank in
 * this environment (`AWS_S3_BUCKET` and `AWS_ACCESS_KEY_ID` are empty strings in
 * .env.local), so nothing can reach a bucket. That is treated as the subject of
 * the test rather than an obstacle: what matters for an audit is that each route
 * (a) enforces its role guard, (b) validates type/size BEFORE touching storage,
 * and (c) fails *gracefully and quickly* when storage is unavailable, rather
 * than hanging or crashing the worker. Every storage-dependent test below
 * asserts a bounded response time as well as a JSON envelope.
 *
 * Note also that most `/api/upload/*` routes never receive a file at all — they
 * take `{ fileName, fileType, fileSize }` as JSON and hand back a presigned PUT
 * URL for the browser to upload to directly. Only `/api/upload/scorm` and the
 * three `/api/scorm/*` routes are genuinely multipart, and those are exercised
 * here with small in-memory buffers.
 *
 * Guard summary, verified against source:
 *   /api/scorm/{validate,parse,extract}      TENANT_ADMIN|SUB_ADMIN|ADMIN|TEACHER
 *   /api/upload/course-thumbnail             ADMIN|TENANT_ADMIN|SUB_ADMIN
 *   /api/upload/course-resource              ADMIN|TENANT_ADMIN|SUB_ADMIN
 *   /api/upload/scorm                        ADMIN|TENANT_ADMIN|SUB_ADMIN
 *   /api/upload/homework-resource            + TEACHER, LEARNER
 *   /api/upload/non-teaching-work-resource   + TEACHER (no LEARNER)
 *   /api/upload/welcome-kit                  ADMIN only (POST and GET)
 *   /api/upload/presigned-url                requireAuth only (metadata via HEADERS)
 *   /api/upload/generate-thumbnail           ADMIN|TENANT_ADMIN|SUB_ADMIN (stub, always fails)
 *   /api/upload/tus                          requireAuth only (stub, always 201)
 */

import { test, expect } from "@playwright/test";
import { apiAs, apiAnon, safeJson } from "../fixtures/api";

/** Not a zip — used to drive the malformed-package paths. */
const NOT_A_ZIP = Buffer.from("this is definitely not a zip archive");

function zipUpload(buffer: Buffer = NOT_A_ZIP, name = "package.zip") {
  return { file: { name, mimeType: "application/zip", buffer } };
}

/**
 * Storage is unreachable here, so any route that reaches it must still answer
 * promptly. `lib/s3.ts` builds its GCS client at module load and never
 * validates, and no presign call site has a timeout or a try/catch — so a
 * credential lookup that blocked on the cloud metadata endpoint would surface
 * as a hang. This bound is what proves it does not.
 */
const STORAGE_BUDGET_MS = 20_000;

interface ErrEnvelope {
  success?: boolean;
  error?: string;
}

test.describe("Phase 12 — SCORM processing", () => {
  test("POST /api/scorm/parse requires a file", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/parse", { multipart: {} });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("SCORM zip file is required");
    await api.dispose();
  });

  test("POST /api/scorm/parse rejects a non-zip filename before parsing", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/parse", {
      multipart: { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") } },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("File must be a .zip SCORM package");
    await api.dispose();
  });

  test("POST /api/scorm/parse reports a corrupt archive as a 400", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/parse", { multipart: zipUpload() });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.success).toBe(false);
    expect(body.error).toContain("Failed to parse SCORM package");
    await api.dispose();
  });

  test("POST /api/scorm/validate reports an invalid package as valid:false at 201", async () => {
    // Documented, deliberate contract: validate never errors on a bad package —
    // an invalid archive is a *result*, not a failure.
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/validate", { multipart: zipUpload() });
    expect(res.status()).toBe(201);
    const body = (await safeJson(res)) as { valid?: boolean; title?: string | null; message?: string };
    expect(body.valid).toBe(false);
    expect(body.title).toBeNull();
    expect(body.message).toBeTruthy();
    await api.dispose();
  });

  test("POST /api/scorm/validate requires a file", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/validate", { multipart: {} });
    expect(res.status()).toBe(400);
    await api.dispose();
  });

  test("POST /api/scorm/extract requires a file", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/extract", { multipart: {} });
    expect(res.status()).toBe(400);
    await api.dispose();
  });

  // TEACHER is on the allow-list for all three SCORM routes — assert it gets
  // past the guard (a 400 for the missing file proves authorisation passed).
  for (const path of ["/api/scorm/parse", "/api/scorm/validate", "/api/scorm/extract"]) {
    test(`TEACHER is allowed through the guard on ${path}`, async () => {
      const api = await apiAs("teacher");
      const res = await api.post(path, { multipart: {} });
      expect(res.status(), "400 = past the role guard, stopped by the missing file").toBe(400);
      await api.dispose();
    });
  }

  for (const path of ["/api/scorm/parse", "/api/scorm/validate", "/api/scorm/extract"]) {
    test(`LEARNER is refused by ${path}`, async () => {
      const api = await apiAs("learner");
      const res = await api.post(path, { multipart: zipUpload() });
      expect(res.status()).toBe(403);
      await api.dispose();
    });
  }

  test("anonymous callers are refused by /api/scorm/parse", async () => {
    const anon = await apiAnon();
    const res = await anon.post("/api/scorm/parse", { multipart: {} });
    expect([401, 403]).toContain(res.status());
    await anon.dispose();
  });
});

test.describe("Phase 12 — upload validation (before storage)", () => {
  test("course-thumbnail rejects a non-image type with 400", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/course-thumbnail", {
      data: { fileName: "payload.exe", fileType: "application/x-msdownload", fileSize: 1024 },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("Only image files are allowed");
    await api.dispose();
  });

  test("course-thumbnail rejects a file over 5MB with 400", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/course-thumbnail", {
      data: { fileName: "huge.png", fileType: "image/png", fileSize: 6 * 1024 * 1024 },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("File size must be less than 5MB");
    await api.dispose();
  });

  test("course-thumbnail requires all three fields", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/course-thumbnail", { data: { fileName: "a.png" } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("fileType");
    expect(body.error).toContain("fileSize");
    await api.dispose();
  });

  test("course-resource rejects a file over 50MB with 413", async () => {
    // 413 rather than 400: this route ported a multer `limits.fileSize`, which
    // Nest mapped to PayloadTooLarge. The distinction is deliberate in lib/http.ts.
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/course-resource", {
      data: { fileName: "huge.pdf", fileType: "application/pdf", fileSize: 60 * 1024 * 1024 },
    });
    expect(res.status()).toBe(413);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toBe("File too large");
    await api.dispose();
  });

  test("homework-resource rejects a file over 50MB with 413", async () => {
    const api = await apiAs("teacher");
    const res = await api.post("/api/upload/homework-resource", {
      data: { fileName: "huge.pdf", fileType: "application/pdf", fileSize: 60 * 1024 * 1024 },
    });
    expect(res.status()).toBe(413);
    await api.dispose();
  });

  test("welcome-kit rejects a non-PDF with 400", async () => {
    const api = await apiAs("superAdmin");
    const res = await api.post("/api/upload/welcome-kit", { data: { fileType: "image/png", fileSize: 1024 } });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("Only PDF files are allowed");
    await api.dispose();
  });

  test("presigned-url requires the x-file-name and x-file-type headers", async () => {
    // This route takes its metadata from headers, not a body — an easy one to
    // test wrongly.
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/presigned-url", { data: {} });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("x-file-name and x-file-type headers are required");
    await api.dispose();
  });

  test("generate-thumbnail reports itself unimplemented with 501", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/generate-thumbnail", { data: { courseTitle: "Anything" } });
    expect(res.status()).toBe(501);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("not available in this build");
    await api.dispose();
  });

  test("generate-thumbnail rejects an unsupported provider with 400", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/generate-thumbnail", {
      data: { courseTitle: "Anything", provider: "midjourney" },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("coming soon");
    await api.dispose();
  });

  test("tus is a stub that always succeeds", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/upload/tus", { data: {} });
    expect(res.status()).toBe(201);
    const body = (await safeJson(res)) as { success?: boolean; message?: string };
    expect(body.success).toBe(true);
    expect(body.message).toContain("TUS upload endpoint");
    await api.dispose();
  });
});

test.describe("Phase 12 — upload role guards", () => {
  const REFUSALS: Array<{ label: string; role: "learner" | "teacher" | "tenantAdmin"; path: string; data: unknown }> = [
    {
      label: "LEARNER → course-thumbnail",
      role: "learner",
      path: "/api/upload/course-thumbnail",
      data: { fileName: "a.png", fileType: "image/png", fileSize: 1024 },
    },
    {
      label: "LEARNER → course-resource",
      role: "learner",
      path: "/api/upload/course-resource",
      data: { fileName: "a.pdf", fileType: "application/pdf", fileSize: 1024 },
    },
    {
      label: "LEARNER → non-teaching-work-resource",
      role: "learner",
      path: "/api/upload/non-teaching-work-resource",
      data: { fileName: "a.pdf", fileType: "application/pdf", fileSize: 1024 },
    },
    {
      label: "TEACHER → course-thumbnail",
      role: "teacher",
      path: "/api/upload/course-thumbnail",
      data: { fileName: "a.png", fileType: "image/png", fileSize: 1024 },
    },
    {
      label: "TENANT_ADMIN → welcome-kit",
      role: "tenantAdmin",
      path: "/api/upload/welcome-kit",
      data: { fileType: "application/pdf", fileSize: 1024 },
    },
  ];

  for (const r of REFUSALS) {
    test(`${r.label} is refused with 403`, async () => {
      const api = await apiAs(r.role);
      const res = await api.post(r.path, { data: r.data });
      expect(res.status()).toBe(403);
      await api.dispose();
    });
  }

  test("LEARNER is refused by POST /api/upload/scorm", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/upload/scorm", { multipart: zipUpload() });
    expect(res.status()).toBe(403);
    await api.dispose();
  });

  test("LEARNER IS allowed on homework-resource (the one upload route that admits them)", async () => {
    const api = await apiAs("learner");
    const res = await api.post("/api/upload/homework-resource", {
      data: { fileName: "essay.pdf", fileType: "application/pdf", fileSize: 1024 },
    });
    // Storage is unreachable, so a 5xx here still proves the guard let them
    // through — a 403 would prove the opposite.
    expect(res.status(), "learners must be able to submit homework").not.toBe(403);
    await api.dispose();
  });

  test("POST /api/upload/scorm rejects a non-zip filename", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/scorm", {
      multipart: { file: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") } },
    });
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.error).toContain("Only ZIP files are allowed");
    await api.dispose();
  });
});

test.describe("Phase 12 — degradation with storage unavailable", () => {
  /**
   * The core requirement from the brief: with blank credentials these must fail
   * *gracefully* — a JSON envelope, promptly — rather than hanging or crashing.
   * Each case asserts the envelope shape AND a time bound.
   */
  const STORAGE_ROUTES: Array<{ label: string; role: "tenantAdmin" | "superAdmin"; path: string; data: unknown }> = [
    {
      label: "POST /api/upload/course-thumbnail",
      role: "tenantAdmin",
      path: "/api/upload/course-thumbnail",
      data: { fileName: "valid.png", fileType: "image/png", fileSize: 2048 },
    },
    {
      label: "POST /api/upload/course-resource",
      role: "tenantAdmin",
      path: "/api/upload/course-resource",
      data: { fileName: "valid.pdf", fileType: "application/pdf", fileSize: 2048 },
    },
    {
      label: "POST /api/upload/homework-resource",
      role: "tenantAdmin",
      path: "/api/upload/homework-resource",
      data: { fileName: "valid.pdf", fileType: "application/pdf", fileSize: 2048 },
    },
    {
      label: "POST /api/upload/welcome-kit",
      role: "superAdmin",
      path: "/api/upload/welcome-kit",
      data: { fileType: "application/pdf", fileSize: 2048 },
    },
  ];

  for (const r of STORAGE_ROUTES) {
    test(`${r.label} fails gracefully when storage is unconfigured`, async () => {
      const api = await apiAs(r.role);
      const started = Date.now();
      const res = await api.post(r.path, { data: r.data, timeout: STORAGE_BUDGET_MS });
      const elapsed = Date.now() - started;

      // A 4xx/5xx is expected; what must NOT happen is a hang, a socket reset,
      // or a non-JSON crash page.
      expect(res.status(), "must be a definite refusal, not a success").toBeGreaterThanOrEqual(400);
      const body = (await safeJson(res)) as ErrEnvelope & { __nonJson?: boolean };
      expect(body.__nonJson, "the response must be JSON, not an HTML crash page").toBeUndefined();
      expect(body.success, "standard error envelope from lib/http.ts").toBe(false);
      expect(res.headers()["x-request-id"], "response must carry an X-Request-Id header for correlation").toBeTruthy();
      expect(elapsed, `took ${elapsed}ms — a credential lookup must not block`).toBeLessThan(STORAGE_BUDGET_MS);
      await api.dispose();
    });
  }

  test("GET /api/upload/welcome-kit fails gracefully when the object cannot be read", async () => {
    const api = await apiAs("superAdmin");
    const started = Date.now();
    const res = await api.get("/api/upload/welcome-kit", { timeout: STORAGE_BUDGET_MS });
    const elapsed = Date.now() - started;
    expect(res.status()).toBeGreaterThanOrEqual(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.success).toBe(false);
    expect(elapsed).toBeLessThan(STORAGE_BUDGET_MS);
    await api.dispose();
  });

  test("POST /api/upload/scorm fails gracefully rather than hanging on a bad package", async () => {
    const api = await apiAs("tenantAdmin");
    const started = Date.now();
    const res = await api.post("/api/upload/scorm", { multipart: zipUpload(), timeout: STORAGE_BUDGET_MS });
    const elapsed = Date.now() - started;
    expect(res.status()).toBe(400);
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(body.success).toBe(false);
    expect(elapsed).toBeLessThan(STORAGE_BUDGET_MS);
    await api.dispose();
  });

  /**
   * INFORMATIONAL — unconfigured storage surfaces as a generic 500.
   *
   * With `AWS_S3_BUCKET` empty, `bucket()` in lib/s3.ts throws a plain
   * `new Error('GCS_BUCKET is not configured')`. Because that is not an
   * `ApiError`, lib/http.ts:126-134 catches it in the unknown branch and returns
   * `{"statusCode":500,"message":"Internal server error"}` — the real reason
   * appears only in the server console.
   *
   * The behaviour is correct and, importantly, FAST (~1.5s measured, no
   * metadata-server stall) and well-formed. It is recorded only because an
   * operator misconfiguration is indistinguishable, from the response alone,
   * from a genuine application fault — and this is a startup-time condition that
   * could be detected once at boot rather than per request.
   *
   * Not asserted as a verdict.
   */
  test("[informational] a misconfigured bucket is reported as a generic 500", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/upload/course-thumbnail", {
      data: { fileName: "valid.png", fileType: "image/png", fileSize: 2048 },
      timeout: STORAGE_BUDGET_MS,
    });
    const body = (await safeJson(res)) as ErrEnvelope;
    console.log(
      `[INFO] storage-unconfigured response: ${res.status()} "${body.error}" ` +
        `— cause ('GCS_BUCKET is not configured') is console-only`,
    );
    expect([400, 500, 503]).toContain(res.status());
    await api.dispose();
  });
});

test.describe("Phase 12 — findings", () => {
  /**
   * FINDING (Medium) — /api/scorm/extract returns 500 for a malformed archive,
   * where its two sibling routes return 400 for the identical input.
   *
   * Endpoint : POST /api/scorm/extract
   * Observed : the same corrupt buffer, uploaded as `package.zip`, produces
   *              /api/scorm/parse     → 400 "Failed to parse SCORM package: …"
   *              /api/scorm/validate  → 201 { valid: false, … }
   *              /api/scorm/extract   → 500 "Internal server error"
   * Expected : 400 — a user-supplied file that is not a valid zip is a client
   *            error, and the neighbouring route already classifies it as one.
   * Root cause: lib/services/scorm-service.ts —
   *              export async function extractScormFiles(zipBuffer, _extractPath) {
   *                const entries = await readEntries(zipBuffer);   // ← unguarded
   *                return entries.filter(…).map(…);
   *              }
   *            `readEntries` lets the JSZip error ("Can't find end of central
   *            directory") propagate raw. Compare `parseScormPackage` in the
   *            same file, which wraps the same call and rethrows as
   *            `BadRequest('Failed to parse SCORM package: …')`. The route
   *            (app/api/scorm/extract/route.ts) calls the service directly with
   *            no try/catch, so the raw error reaches lib/http.ts's catch-all.
   *
   * Severity Medium: unauthenticated users cannot reach it (the route requires
   * TENANT_ADMIN|SUB_ADMIN|ADMIN|TEACHER), and nothing is written to disk
   * — `extractScormFiles` only lists entry names. But any authoring user can
   * drive 5xx by uploading a truncated or corrupt file, which is an ordinary
   * accident rather than an attack, and it pollutes error budgets and alerting
   * with what is really a bad upload.
   *
   * Left FAILING intentionally.
   */
  test("POST /api/scorm/extract reports a corrupt archive as 400, not 500", async () => {
    const api = await apiAs("tenantAdmin");
    const res = await api.post("/api/scorm/extract", { multipart: zipUpload() });
    const body = (await safeJson(res)) as ErrEnvelope;
    expect(
      res.status(),
      `corrupt zip → ${res.status()} "${body.error}"; the same buffer on /api/scorm/parse → 400. ` +
        `extractScormFiles (scorm-service.ts) does not wrap readEntries the way parseScormPackage does`,
    ).toBe(400);
    await api.dispose();
  });
});
