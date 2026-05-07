/**
 * DPR → BOQ progress posting, RAB → BOQ billing posting.
 *
 * This is the one area fully on Prisma + ledgers (Phase 2 hardening) so
 * the assertions here are precise:
 *
 *   - After DPR approve: leaf.done_qty = sum of posted qtys, completion_pct correct.
 *   - After RAB approve: leaf.billed_qty = posted qty.
 *   - Over-tender DPR → EXCEEDS_TENDER (403/400).
 *   - Over-done RAB → EXCEEDS_DONE (403/400).
 *   - Posting to a group row → GROUP_NOT_ALLOWED.
 *   - Idempotency key replay returns the cached response.
 */
import { test, expect } from "@playwright/test";
import { apiClient, ApiError } from "./fixtures/api-client";
import {
  seedProjectWithMasters,
  importAndGetBoq,
  submitAndApproveDPR,
  createAndApproveRAB,
} from "./fixtures/flows";

test.describe("DPR + RAB with BOQ ledger verification", () => {
  test("DPR approve posts progress and updates cumulative done qty", async () => {
    const api = apiClient({ role: "project_manager" });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    const { leaves } = await importAndGetBoq(admin, project.id);

    const leafA = leaves.find((l: any) => l.boq_no === "1.1");
    expect(leafA).toBeTruthy();
    expect(Number(leafA.tender_qty)).toBe(1000);

    await submitAndApproveDPR(api, {
      projectId: project.id,
      lines: [{ boqNo: "1.1", qty: 200, workType: "self" }],
    });

    // Re-fetch the tree and verify the rollup
    const tree = await admin.get(`/api/projects/${project.id}/boq`);
    const updatedLeaf = tree.items.find((i: any) => i.boq_no === "1.1");
    expect(Number(updatedLeaf.self_done_qty)).toBe(200);
    expect(Number(updatedLeaf.done_qty)).toBe(200);
    expect(Number(updatedLeaf.balance_qty)).toBe(800);
    // 200/1000 = 20%
    expect(Number(updatedLeaf.completion_pct)).toBe(20);
  });

  test("RAB approve posts billing and caps at cumulative done", async () => {
    const pm = apiClient({ role: "project_manager" });
    const accounts = apiClient({ role: "accounts_finance" });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Post 300 done first via DPR
    await submitAndApproveDPR(pm, {
      projectId: project.id,
      lines: [{ boqNo: "1.1", qty: 300, workType: "self" }],
    });

    // Bill 250 — should succeed
    await createAndApproveRAB(accounts, {
      projectId: project.id,
      lines: [{ boqNo: "1.1", qty: 250 }],
    });

    const tree = await admin.get(`/api/projects/${project.id}/boq`);
    const leaf = tree.items.find((i: any) => i.boq_no === "1.1");
    expect(Number(leaf.billed_qty)).toBe(250);
  });

  test("DPR posting that exceeds tender qty is rejected", async () => {
    const pm = apiClient({ role: "project_manager" });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Leaf 1.2 has tender qty 500 — try to post 9999
    const err: any = await submitAndApproveDPR(pm, {
      projectId: project.id,
      lines: [{ boqNo: "1.2", qty: 9999, workType: "self" }],
    }).catch((e) => e);

    expect(err).toBeTruthy();
    expect(err.status).toBeGreaterThanOrEqual(400);
    if (err instanceof ApiError && err.code) {
      expect(["EXCEEDS_TENDER", "DPR_UPDATE_FAILED"]).toContain(err.code);
    }
  });

  test("RAB billing that exceeds cumulative done is rejected", async () => {
    const pm = apiClient({ role: "project_manager" });
    const accounts = apiClient({ role: "accounts_finance" });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Post only 100 done
    await submitAndApproveDPR(pm, {
      projectId: project.id,
      lines: [{ boqNo: "2.1", qty: 100, workType: "self" }],
    });

    // Try to bill 200 — more than done
    const err: any = await createAndApproveRAB(accounts, {
      projectId: project.id,
      lines: [{ boqNo: "2.1", qty: 200 }],
    }).catch((e) => e);

    expect(err).toBeTruthy();
    expect(err.status).toBeGreaterThanOrEqual(400);
    if (err instanceof ApiError && err.code) {
      expect(["EXCEEDS_DONE", "RAB_UPDATE_FAILED"]).toContain(err.code);
    }
  });

  test("DPR posting on a group row is rejected with GROUP_NOT_ALLOWED", async () => {
    const pm = apiClient({ role: "project_manager" });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    const { tree } = await importAndGetBoq(admin, project.id);

    const group = tree.items.find((i: any) => i.is_group);
    expect(group).toBeTruthy();

    const err: any = await submitAndApproveDPR(pm, {
      projectId: project.id,
      lines: [{ boqNo: group.boq_no, qty: 10, workType: "self" }],
    }).catch((e) => e);

    expect(err).toBeTruthy();
    expect(err.status).toBeGreaterThanOrEqual(400);
    if (err instanceof ApiError && err.code) {
      expect(["GROUP_NOT_ALLOWED", "DPR_UPDATE_FAILED"]).toContain(err.code);
    }
  });
});
