import { test, expect } from "@playwright/test";
import pkg from "pg";
import { readFileSync } from "node:fs";

/**
 * Onboarding side-effects — deeper end-to-end (real server routes + real DB).
 *
 * Exercises the *actual writes* behind the checklist against the dev-bypass
 * server, then verifies the database changed:
 *   1. Complete Profile  → PATCH employee, assert fields persisted.
 *   2. Joining Letter     → GET the PDF, assert a real application/pdf comes back.
 *   3. Confirm Employment → POST confirm, assert status→Active + a new active
 *                           salary for the revised CTC (old one deactivated).
 *
 * NOTE: nextReviewDate + a *custom* joining-letter body need `prisma generate`
 * (two columns added this session). Those are intentionally NOT asserted here —
 * this spec covers everything that works without the regenerate.
 */

const { Client } = pkg;
const ORG = "tenant_dev_001";
const DEV_HEADERS = { "x-tenant-id": ORG, "x-user-id": "user_dev_001", "x-user-roles": "admin" };

function readEnvLocal(): string {
  for (const p of [".env.local", "apps/quikhrms/.env.local"]) {
    try { return readFileSync(p, "utf8"); } catch { /* next */ }
  }
  throw new Error("Could not locate .env.local");
}
const DB_URL = process.env.DATABASE_URL ?? readEnvLocal().match(/^DATABASE_URL="?([^"\n]+)"?/m)![1];

const PREFIX = "e2e_onb_sfx";
const empId = `${PREFIX}_emp`;
const mgrId = `${PREFIX}_mgr`;
const instId = `${PREFIX}_inst`;

const T = (t: string) => `"app_quikhrms"."${t}"`;
async function withDb<T>(fn: (c: InstanceType<typeof Client>) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

test.beforeAll(async () => {
  await withDb(async (c) => {
    // clean leftovers
    await c.query(`DELETE FROM ${T("EmployeeSalary")} WHERE "employeeId"=$1`, [empId]);
    await c.query(`DELETE FROM ${T("OnboardingTask")} WHERE "instanceId"=$1`, [instId]);
    await c.query(`DELETE FROM ${T("OnboardingInstance")} WHERE id=$1`, [instId]);
    await c.query(`DELETE FROM ${T("Employee")} WHERE id = ANY($1)`, [[empId, mgrId]]);

    // manager (Active) — needed as reportingManagerId
    await c.query(
      `INSERT INTO ${T("Employee")} (id,"orgId","employeeCode","firstName","lastName","workEmail","dateOfJoining",status,"createdAt","updatedAt")
       VALUES ($1,$2,'E2E-MGR','Meera','Manager','e2e-mgr@example.com',now(),'Active',now(),now())`,
      [mgrId, ORG]);
    // the new hire (PreBoarding) — joined today, so a 1995 DOB is valid
    await c.query(
      `INSERT INTO ${T("Employee")} (id,"orgId","employeeCode","firstName","lastName","workEmail","jobTitle","dateOfJoining",status,"createdAt","updatedAt")
       VALUES ($1,$2,'E2E-SFX','Sam','Newhire','e2e-sfx@example.com','Software Engineer',now(),'PreBoarding',now(),now())`,
      [empId, ORG]);
    // onboarding instance
    await c.query(
      `INSERT INTO ${T("OnboardingInstance")} (id,"orgId","employeeId","startDate",status,"createdAt","updatedAt")
       VALUES ($1,$2,$3,now(),'InProgress',now(),now())`,
      [instId, ORG, empId]);
    // an initial active salary — confirm should deactivate this + open a new one
    await c.query(
      `INSERT INTO ${T("EmployeeSalary")} (id,"orgId","employeeId",ctc,"effectiveFrom","isActive","createdAt","updatedAt")
       VALUES ($1,$2,$3,1000000,now(),true,now(),now())`,
      [`${PREFIX}_sal0`, ORG, empId]);
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query(`DELETE FROM ${T("EmployeeSalary")} WHERE "employeeId"=$1`, [empId]);
    await c.query(`DELETE FROM ${T("OnboardingTask")} WHERE "instanceId"=$1`, [instId]);
    await c.query(`DELETE FROM ${T("OnboardingInstance")} WHERE id=$1`, [instId]);
    await c.query(`DELETE FROM ${T("Employee")} WHERE id = ANY($1)`, [[empId, mgrId]]);
  });
});

test.describe("Onboarding side-effects (real writes)", () => {
  test("Complete Profile → saves to the employee record", async ({ request }) => {
    const res = await request.patch(`/api/v1/hrms/employees/${empId}`, {
      headers: DEV_HEADERS,
      data: {
        dateOfBirth: "1995-06-15",
        gender: "Male",
        reportingManagerId: mgrId,
        panNumber: "ABCDE1234F",
        currentAddress: { line1: "12 MG Road", city: "Indore", state: "MP", country: "India", zipCode: "452001" },
      },
    });
    expect(res.ok(), `PATCH failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const row = await withDb((c) => c.query(
      `SELECT "dateOfBirth","gender","reportingManagerId","panNumber","currentAddress" FROM ${T("Employee")} WHERE id=$1`, [empId],
    ).then(r => r.rows[0]));
    expect(row.reportingManagerId).toBe(mgrId);
    expect(row.gender).toBe("Male");
    expect(row.panNumber).toBe("ABCDE1234F");
    expect(row.dateOfBirth).not.toBeNull();
    expect(row.currentAddress?.city).toBe("Indore");
  });

  test("Joining Letter → returns a real PDF", async ({ request }) => {
    const res = await request.get(`/api/v1/hrms/onboarding/${empId}/joining-letter`, { headers: DEV_HEADERS });
    expect(res.ok(), `PDF request failed: ${res.status()}`).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("application/pdf");
    const buf = await res.body();
    expect(buf.length).toBeGreaterThan(1000);            // a non-trivial document
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-"); // real PDF header
  });

  test("Confirm Employment → activates + revises salary", async ({ request }) => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await request.post(`/api/v1/hrms/employees/${empId}/confirm`, {
      headers: DEV_HEADERS,
      data: { confirmationDate: today, revisedCTC: 1500000, sendEmail: false },
    });
    expect(res.ok(), `confirm failed: ${res.status()} ${await res.text()}`).toBeTruthy();

    const { emp, salaries } = await withDb(async (c) => ({
      emp: (await c.query(`SELECT status,"confirmationDate" FROM ${T("Employee")} WHERE id=$1`, [empId])).rows[0],
      salaries: (await c.query(`SELECT ctc,"isActive" FROM ${T("EmployeeSalary")} WHERE "employeeId"=$1 ORDER BY "isActive" DESC`, [empId])).rows,
    }));

    expect(emp.status).toBe("Active");
    expect(emp.confirmationDate).not.toBeNull();

    const active = salaries.filter((s: { isActive: boolean }) => s.isActive);
    expect(active.length).toBe(1);                        // exactly one active salary
    expect(Number(active[0].ctc)).toBe(1500000);         // = revised CTC
    const deactivated = salaries.filter((s: { isActive: boolean }) => !s.isActive);
    expect(deactivated.some((s: { ctc: string }) => Number(s.ctc) === 1000000)).toBeTruthy(); // old one closed
  });
});
