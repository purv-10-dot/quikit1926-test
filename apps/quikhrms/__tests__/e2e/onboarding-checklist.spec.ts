import { test, expect } from "@playwright/test";
import pkg from "pg";
import { readFileSync } from "node:fs";

/**
 * Onboarding checklist — end-to-end (real browser, real DB).
 *
 * Seeds an onboarding instance with ONE task per selectable step type into the
 * dev-bypass org (tenant_dev_001 — see lib/hooks/use-api.ts), drives the live
 * tracker page, and verifies each step type renders its control, that completing
 * a task moves the progress counter, and cleans everything up afterwards.
 *
 * Runs against the DEV-BYPASS server (playwright.config.ts): SSO off, header
 * identity x-tenant-id=tenant_dev_001 / x-user-id=user_dev_001.
 */

const { Client } = pkg;
const ORG = "tenant_dev_001";

function readEnvLocal(): string {
  for (const p of [".env.local", "apps/quikhrms/.env.local"]) {
    try { return readFileSync(p, "utf8"); } catch { /* try next */ }
  }
  throw new Error("Could not locate .env.local for DATABASE_URL");
}
const DB_URL = process.env.DATABASE_URL
  ?? readEnvLocal().match(/^DATABASE_URL="?([^"\n]+)"?/m)![1];

const PREFIX = "e2e_onb_chk";
const empId = `${PREFIX}_emp`;
const instId = `${PREFIX}_inst`;

const STEPS = [
  { stepType: "CustomTask",      category: "TaskOther",     title: "Sign employee handbook",  config: {} },
  { stepType: "CompleteProfile", category: "TaskOther",     title: "Complete your profile",   config: {} },
  { stepType: "DocumentUpload",  category: "Documentation", title: "Upload PAN card",         config: { allowedTypes: "PDF" } },
  { stepType: "SendEmail",       category: "Introduction",  title: "Send welcome email",      config: { template: "employee.welcome" } },
  { stepType: "ReadPolicy",      category: "Compliance",    title: "Read Code of Conduct",    config: { ack: true } },
  { stepType: "ITProvisioning",  category: "ItSetup",       title: "Provision IT access",     config: { systems: ["Email Account"] } },
  { stepType: "AssetAssignment", category: "ItSetup",       title: "Assign laptop",           config: { assets: [{ type: "Laptop", qty: 1 }] } },
  { stepType: "CustomTask",      category: "Documentation", title: "Salary Bank Account",     config: {} },
];

async function withDb<T>(fn: (c: InstanceType<typeof Client>) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DB_URL });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}
const T = (t: string) => `"app_quikhrms"."${t}"`;

test.beforeAll(async () => {
  await withDb(async (c) => {
    // clean any leftover from a previous run
    await c.query(`DELETE FROM ${T("OnboardingTask")} WHERE "instanceId"=$1`, [instId]);
    await c.query(`DELETE FROM ${T("OnboardingInstance")} WHERE id=$1`, [instId]);
    await c.query(`DELETE FROM ${T("Employee")} WHERE id=$1`, [empId]);

    await c.query(
      `INSERT INTO ${T("Employee")} (id,"orgId","employeeCode","firstName","lastName","workEmail","dateOfJoining",status,"createdAt","updatedAt")
       VALUES ($1,$2,'E2E-CHK','E2E','Checklist','e2e-checklist@example.com',now(),'PreBoarding',now(),now())`,
      [empId, ORG]);
    await c.query(
      `INSERT INTO ${T("OnboardingInstance")} (id,"orgId","employeeId","startDate",status,"createdAt","updatedAt")
       VALUES ($1,$2,$3,now(),'InProgress',now(),now())`,
      [instId, ORG, empId]);
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i];
      await c.query(
        `INSERT INTO ${T("OnboardingTask")} (id,"orgId","instanceId",title,category,status,"isMandatory","sortOrder","stepType",config,"createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,'TaskPending',true,$6,$7,$8,now(),now())`,
        [`${PREFIX}_task_${i}`, ORG, instId, s.title, s.category, i, s.stepType, JSON.stringify(s.config)]);
    }
  });
});

test.afterAll(async () => {
  await withDb(async (c) => {
    await c.query(`DELETE FROM ${T("OnboardingTask")} WHERE "instanceId"=$1`, [instId]);
    await c.query(`DELETE FROM ${T("OnboardingInstance")} WHERE id=$1`, [instId]);
    await c.query(`DELETE FROM ${T("Employee")} WHERE id=$1`, [empId]);
  });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ }
  });
});

test.describe("Onboarding checklist — every step type", () => {
  test("renders each step type with its control", async ({ page }) => {
    await page.goto(`/onboarding/${empId}`);

    // The tracker loaded for our seeded employee.
    await expect(page.getByRole("heading", { name: /Onboarding:/i })).toBeVisible();
    await expect(page.getByText("E2E Checklist")).toBeVisible();

    // Every seeded step title is on the page.
    for (const s of STEPS) {
      await expect(page.getByText(s.title, { exact: false }).first()).toBeVisible();
    }

    // Step-type-specific controls (the text-bearing ones).
    await expect(page.getByRole("button", { name: /Complete Profile/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Send now/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /document request/i })).toBeVisible();

    // Progress starts at 0 of 8.
    await expect(page.getByText(/0\s*\/\s*8/)).toBeVisible();
  });

  test("completing a task advances the progress counter", async ({ page }) => {
    await page.goto(`/onboarding/${empId}`);
    await expect(page.getByText(/0\s*\/\s*8/)).toBeVisible();

    // Find the "Sign employee handbook" task card and click its Mark-complete (✓) button.
    const card = page.locator("div.row-stagger", { hasText: "Sign employee handbook" });
    await card.getByRole("button", { name: "Mark complete" }).click();

    // Counter moves to 1 / 8.
    await expect(page.getByText(/1\s*\/\s*8/)).toBeVisible();
  });
});
