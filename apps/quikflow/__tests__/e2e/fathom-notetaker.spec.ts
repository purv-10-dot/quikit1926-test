import { test, expect } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Chromium e2e for the Fathom notetaker auto-invite feature: an org admin
 * sets a bot email on a connected Teams calendar account via /connections,
 * and it round-trips through the real PATCH/GET API + Postgres — not mocks.
 *
 * Real OAuth against Microsoft Graph can't be automated here, so the Teams
 * connection itself is seeded directly (status "connected", no tokens
 * needed — the settings PATCH/GET path never calls getFreshAccessToken).
 */
test.use({ storageState: "__tests__/e2e/.auth/e2e-admin.json" });

const db = new PrismaClient();
const CONNECTION_LABEL = "E2E Teams Calendar";
let orgId: string;
let connectionId: string;

test.beforeAll(async () => {
  const org = await db.org.findUniqueOrThrow({ where: { slug: "e2e-tenant" } });
  orgId = org.id;
  const conn = await db.wfConnection.upsert({
    where: { orgId_provider_label: { orgId, provider: "teams", label: CONNECTION_LABEL } },
    // Prisma.DbNull, not `null`: on a nullable Json column plain null is
    // ambiguous (JSON null vs SQL NULL) and the client rejects it. DbNull is
    // the SQL NULL this reset wants — a connection with no settings at all.
    update: { status: "connected", settings: Prisma.DbNull },
    create: {
      orgId,
      provider: "teams",
      label: CONNECTION_LABEL,
      status: "connected",
      scopes: [],
      createdBy: "e2e-seed",
    },
  });
  connectionId = conn.id;
});

test.afterAll(async () => {
  await db.wfConnection.deleteMany({ where: { id: connectionId } });
  await db.$disconnect();
});

test("admin sets, persists, and clears the Fathom account email on a Teams connection", async ({ page }) => {
  await page.goto("/connections");

  const card = page.locator("li", { hasText: CONNECTION_LABEL });
  await expect(card).toBeVisible({ timeout: 10_000 });

  const input = card.getByLabel(/fathom account email/i);
  const saveButton = card.getByRole("button", { name: "Save" });

  // Save is disabled until the field is dirty.
  await expect(saveButton).toBeDisabled();

  await input.fill("rohit@quikit.com");
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(page.getByText("Fathom auto-join updated.")).toBeVisible();
  await expect(saveButton).toBeDisabled();

  // Reload to prove the value round-tripped through PATCH → Postgres → GET,
  // not just local component state.
  await page.reload();
  const reloadedInput = page.locator("li", { hasText: CONNECTION_LABEL }).getByLabel(/fathom account email/i);
  await expect(reloadedInput).toHaveValue("rohit@quikit.com");

  const stored = await db.wfConnection.findUniqueOrThrow({ where: { id: connectionId } });
  expect((stored.settings as { notetakerEmail?: string } | null)?.notetakerEmail).toBe("rohit@quikit.com");

  // Clearing the field removes the override (falls back to the org-wide env var).
  await reloadedInput.fill("");
  await page.locator("li", { hasText: CONNECTION_LABEL }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Fathom auto-join updated.")).toBeVisible();

  const cleared = await db.wfConnection.findUniqueOrThrow({ where: { id: connectionId } });
  expect((cleared.settings as { notetakerEmail?: string } | null)?.notetakerEmail).toBeUndefined();
});
