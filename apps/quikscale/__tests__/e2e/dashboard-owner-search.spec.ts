import { test, expect } from "@playwright/test";

// E2E: the Dashboard Team-tab Owner filter must search the server (the full
// member set), not just the page already loaded into the dropdown. This asserts
// the wiring end-to-end by catching the `/api/users?...&search=` request the
// app fires when you type — which is seed-data independent. (Verifying that a
// user living past page 1 becomes findable additionally requires the e2e seed
// to contain >25 active members; run `npm run db:seed:e2e` first.)

const ADMIN_EMAIL = "e2e-admin@test.com";
const ADMIN_PASSWORD = "E2ETest123!";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/dashboard/);
});

test("owner filter issues a server-side search request", async ({ page }) => {
  await page.goto("/dashboard");

  // Filter button only renders on the Team tab.
  await page.getByRole("button", { name: /^team$/i }).click();
  await page.getByRole("button", { name: /filter|\d+ filters?/i }).click();

  // Open the Owner picker — it's the last "All Users" trigger in the panel
  // (Team scope picker comes first, Owner second).
  await page.getByRole("button", { name: /all users/i }).last().click();

  // Typing must trigger a server search hit, regardless of seed contents.
  const [request] = await Promise.all([
    page.waitForRequest(/\/api\/users\?.*search=sh/),
    page.getByPlaceholder(/search/i).last().fill("sh"),
  ]);
  expect(request.url()).toContain("search=sh");
});
