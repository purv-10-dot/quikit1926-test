export async function robustLogin(page, base, email, password, log) {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });

  for (let attempt = 0; attempt < 4; attempt++) {
    const emailInput = page.locator('#login-email, input[type="email"]:visible, input[name="email"]:visible').first();
    const hasEmailField = await emailInput.waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
    if (!hasEmailField) {
      log?.(`attempt ${attempt}: no email field visible after wait, url=${page.url()}`);
      await page.waitForTimeout(1500);
      continue;
    }
    log?.(`attempt ${attempt}: filling login form at ${page.url()}`);
    await emailInput.fill(email);
    const passwordInput = page.locator('#login-password, input[type="password"]:visible').first();
    await passwordInput.fill(password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => null),
      page.locator('button[type="submit"]:visible').first().click(),
    ]);
    await page.waitForTimeout(1500);
    const stillOnLoginWithFields = await emailInput.isVisible().catch(() => false);
    if (!stillOnLoginWithFields) break; // moved past this login form
  }
  await page.waitForTimeout(1500);
}
