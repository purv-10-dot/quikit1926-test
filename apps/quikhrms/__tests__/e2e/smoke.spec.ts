import { test, expect } from "@playwright/test";

/**
 * First e2e test — a smoke test.
 * Verifies the HRMS app is up and the /login route responds successfully.
 *
 * We use `waitUntil: "commit"` so the assertion runs on the FIRST server
 * response, before any client-side SSO redirect (login redirects to QuikIT).
 * That keeps this test stable even when SSO is configured.
 */
test("app is up — /login responds", async ({ page }) => {
  const response = await page.goto("/login", { waitUntil: "commit" });

  // The server answered without an error status (2xx/3xx).
  expect(response, "no response from /login").not.toBeNull();
  expect(response!.status(), `unexpected status ${response!.status()}`).toBeLessThan(400);

  // The page rendered a body (it's a real HTML page, not a blank error).
  await expect(page.locator("body")).toBeVisible();
});
