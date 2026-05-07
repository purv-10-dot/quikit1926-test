/**
 * Transaction rollback — a multi-line approval that fails partway through
 * must leave NO partial state in the ledger or the aggregate.
 *
 * Strategy: post a DPR with N lines where the last line is deliberately
 * over-tender (EXCEEDS_TENDER). The transaction should roll back entirely
 * — verified by reading the BOQ tree afterward and confirming NONE of the
 * lines landed (not just the bad one).
 */
import { test, expect } from "@playwright/test";
import { apiClient } from "../e2e/fixtures/api-client";
import { seedProjectWithMasters, importAndGetBoq } from "../e2e/fixtures/flows";

test.describe("Transaction rollback", () => {
  test("DPR with one over-tender line rolls back all good lines", async () => {
    const pm = apiClient({ role: "project_manager" });
    const admin = apiClient();
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Sanity: all three leaves start at done_qty = 0
    const pre = await admin.get(`/api/projects/${project.id}/boq`);
    for (const ref of ["1.1", "1.2", "2.1"]) {
      const leaf = pre.items.find((i: any) => i.boq_no === ref);
      expect(Number(leaf.done_qty)).toBe(0);
    }

    // DPR lines: two good ones + one over-tender. 2.1 has tender qty 200.
    const dpr = await pm.post("/api/projects/dpr", {
      projectId: project.id,
      dprDate: "2026-05-11",
      status: "submitted",
      items: [
        { boqNo: "1.1", todayQty: "50", workType: "self" },
        { boqNo: "1.2", todayQty: "30", workType: "self" },
        { boqNo: "2.1", todayQty: "999", workType: "self" }, // > tender
      ],
    });

    const res = await pm.expect("POST", `/api/projects/dpr/${dpr.id}/submit`);
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Critical: none of the three leaves moved
    const post = await admin.get(`/api/projects/${project.id}/boq`);
    for (const ref of ["1.1", "1.2", "2.1"]) {
      const leaf = post.items.find((i: any) => i.boq_no === ref);
      expect(Number(leaf.done_qty)).toBe(0);
    }

    // Summary also unchanged
    expect(Number(post.summary.executedValue)).toBe(0);
  });

  test("RAB with one over-done line rolls back all good lines", async () => {
    const pm = apiClient({ role: "project_manager" });
    const accounts = apiClient({ role: "accounts_finance" });
    const admin = apiClient();

    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    // Post some done qty to 1.1 and 1.2
    await pm.post("/api/projects/dpr", {
      projectId: project.id,
      dprDate: "2026-05-11",
      status: "submitted",
      items: [
        { boqNo: "1.1", todayQty: "100", workType: "self" },
        { boqNo: "1.2", todayQty: "50", workType: "self" },
      ],
    }).then((dpr) => pm.post(`/api/projects/dpr/${dpr.id}/submit`));

    // Now try a RAB that bills more than done on 1.2
    const rab = await accounts.post("/api/projects/rab", {
      projectId: project.id,
      status: "submitted",
      lines: [
        { boqNo: "1.1", qty: "50" },     // OK (≤ 100 done)
        { boqNo: "1.2", qty: "9999" },   // FAIL (> 50 done)
      ],
    });
    const res = await accounts.expect(
      "POST",
      `/api/projects/rab/${rab.id}/approve`
    );
    expect(res.status).toBeGreaterThanOrEqual(400);

    // Neither leaf's billed_qty should have moved — rollback all-or-nothing
    const tree = await admin.get(`/api/projects/${project.id}/boq`);
    const leaf1_1 = tree.items.find((i: any) => i.boq_no === "1.1");
    const leaf1_2 = tree.items.find((i: any) => i.boq_no === "1.2");
    expect(Number(leaf1_1.billed_qty)).toBe(0);
    expect(Number(leaf1_2.billed_qty)).toBe(0);
  });

  test("audit log is empty for a rolled-back DPR", async () => {
    const pm = apiClient({ role: "project_manager" });
    const admin = apiClient();
    const { project } = await seedProjectWithMasters(admin);
    await importAndGetBoq(admin, project.id);

    const dpr = await pm.post("/api/projects/dpr", {
      projectId: project.id,
      dprDate: "2026-05-11",
      status: "submitted",
      items: [{ boqNo: "1.1", todayQty: "99999", workType: "self" }], // bad
    });

    await pm.expect("POST", `/api/projects/dpr/${dpr.id}/submit`);

    // If there's an audit log endpoint, verify no "approve" action was
    // recorded for this DPR id. (Skipped if endpoint not yet available.)
    const auditRes = await admin.expect(
      "GET",
      `/api/audit?entityType=dpr&entityId=${dpr.id}`
    );
    if (auditRes.status === 200) {
      const approves = (auditRes.body?.data ?? []).filter(
        (row: any) => row.action === "approve"
      );
      expect(approves.length).toBe(0);
    }
  });
});
