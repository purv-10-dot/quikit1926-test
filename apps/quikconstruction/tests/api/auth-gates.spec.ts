/**
 * API auth gates — unauthorized (401) and forbidden (403) responses.
 *
 * These tests run via Playwright's test runner but make no browser calls.
 * They exercise the HTTP surface directly against a running dev server.
 *
 * Note: AUTH_DEMO_MODE=true short-circuits the 401 path because the
 * resolver returns a valid super-admin context for every request. To
 * exercise 401 paths, the tests either:
 *   (a) send x-test-role: <unknown_role> — the resolver drops the override,
 *       falls back to DEMO_CTX, and the request succeeds. This is a
 *       limitation of demo mode, and these tests assert the CONTRACT of
 *       what WOULD happen in production.
 *   (b) send x-test-role: viewer_auditor + hit a write endpoint to get 403.
 *
 * Production test runs (AUTH_DEMO_MODE=false) test the real 401 path.
 */
import { test, expect } from "@playwright/test";
import { apiClient } from "../e2e/fixtures/api-client";
import { seedProjectWithMasters, importAndGetBoq } from "../e2e/fixtures/flows";

test.describe("Auth gates", () => {
  test("403 FORBIDDEN when role lacks required permission", async () => {
    const admin = apiClient();
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // viewer_auditor has boq.read but NOT boq.lock
    const viewer = apiClient({ role: "viewer_auditor" });
    const res = await viewer.expect("POST", `/api/projects/${project.id}/boq/lock`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(res.body.error).toMatch(/boq\.lock/);
  });

  test("403 when site_engineer tries to approve DPR", async () => {
    const admin = apiClient();
    const engineer = apiClient({ role: "site_engineer" });
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    const dpr = await engineer.post("/api/projects/dpr", {
      projectId: project.id,
      dprDate: "2026-05-05",
      items: [{ boqNo: "1.1", todayQty: "10", workType: "self" }],
    });

    const res = await engineer.expect("POST", `/api/projects/dpr/${dpr.id}/submit`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  test("401 UNAUTHORIZED contract (production-mode only)", async () => {
    // This path is only reachable when AUTH_DEMO_MODE=false. Skip in demo mode.
    test.skip(
      process.env.AUTH_DEMO_MODE !== "false",
      "AUTH_DEMO_MODE is on; 401 path is bypassed"
    );
    const res = await fetch(
      `${process.env.E2E_BASE_URL ?? "http://localhost:3010"}/api/me`
    );
    expect(res.status).toBe(401);
  });

  test("error envelope contains { error, code } on 403", async () => {
    const admin = apiClient();
    const viewer = apiClient({ role: "viewer_auditor" });
    const { project } = await seedProjectWithMasters(admin);
    const res = await viewer.expect("POST", `/api/projects/${project.id}/boq/lock`);
    expect(res.body).toHaveProperty("error");
    expect(res.body).toHaveProperty("code");
  });
});
