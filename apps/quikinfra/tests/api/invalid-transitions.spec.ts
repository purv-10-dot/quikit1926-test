/**
 * Illegal state transitions return 400 INVALID_TRANSITION.
 *
 * Every entity has an allowed-transition map in
 * `src/lib/workflow/transitions.ts`. The tests pick a known terminal or
 * mid-flow state and try to move it somewhere the map doesn't allow.
 */
import { test, expect } from "@playwright/test";
import { apiClient } from "../e2e/fixtures/api-client";
import {
  seedProjectWithMasters,
  importAndGetBoq,
  submitAndApproveDPR,
} from "../e2e/fixtures/flows";

test.describe("Invalid state transitions", () => {
  test("approving an already-approved DPR returns conflict", async () => {
    // Use distinct idempotency keys for the two approve attempts — otherwise
    // the guard replays the first success on the second call (that's the
    // guard working correctly; we want to test the underlying state gate).
    const pmFirst = apiClient({
      role: "project_manager",
      idempotencyKey: `e2e-first-${Date.now()}`,
    });
    const pmSecond = apiClient({
      role: "project_manager",
      idempotencyKey: `e2e-second-${Date.now()}`,
    });
    const admin = apiClient();
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Create + approve once
    const dpr = await pmFirst.post("/api/projects/dpr", {
      projectId: project.id,
      dprDate: "2026-05-07",
      status: "submitted",
      items: [{ boqNo: "1.1", todayQty: "10", workType: "self" }],
    });
    const first = await pmFirst.post(`/api/projects/dpr/${dpr.id}/submit`);
    expect(first.success).toBe(true);

    // Second approve attempt with a DIFFERENT key — should hit the real
    // state gate and fail because dpr.status is now "approved".
    const second = await pmSecond.expect("POST", `/api/projects/dpr/${dpr.id}/submit`);
    expect(second.status).toBeGreaterThanOrEqual(400);
    if (second.body?.code) {
      expect(["INVALID_TRANSITION", "APPROVAL_CONFLICT", "ALREADY_APPROVED"]).toContain(
        second.body.code
      );
    }
  });

  test("approving an already-approved RAB returns conflict", async () => {
    const pm = apiClient({ role: "project_manager" });
    // Distinct idempotency keys so the state gate, not the replay cache,
    // produces the second-attempt result.
    const accFirst = apiClient({
      role: "accounts_finance",
      idempotencyKey: `e2e-rab-first-${Date.now()}`,
    });
    const accSecond = apiClient({
      role: "accounts_finance",
      idempotencyKey: `e2e-rab-second-${Date.now()}`,
    });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);
    await submitAndApproveDPR(pm, {
      projectId: project.id,
      lines: [{ boqNo: "1.1", qty: 50, workType: "self" }],
    });

    const rab = await accFirst.post("/api/projects/rab", {
      projectId: project.id,
      status: "submitted",
      lines: [{ boqNo: "1.1", qty: "25" }],
    });
    await accFirst.post(`/api/projects/rab/${rab.id}/approve`);

    const second = await accSecond.expect("POST", `/api/projects/rab/${rab.id}/approve`);
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  test("BOQ unlock when already unlocked is a no-op (idempotent) or 400", async () => {
    const admin = apiClient();
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Fresh BOQ is unlocked. Try to unlock it directly.
    const res = await admin.expect("POST", `/api/projects/${project.id}/boq/unlock`);
    // Either 200 (no-op ok) or 400 (strict transition).
    expect([200, 201, 400]).toContain(res.status);
  });

  test("BOQ import into a locked project is rejected with BOQ_LOCKED", async () => {
    const admin = apiClient();
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);
    await admin.post(`/api/projects/${project.id}/boq/lock`);

    const res = await admin.expect(
      "POST",
      `/api/projects/${project.id}/boq/import`,
      {
        sheets: [{ sheetName: "Civil_Building", rows: [] }],
        replaceExisting: true,
      }
    );
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("BOQ_LOCKED");
  });
});
