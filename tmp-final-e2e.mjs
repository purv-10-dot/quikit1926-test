import { chromium } from "playwright-core";
import { robustLogin } from "./login_helper.mjs";

const BASE = "http://localhost:3003";
const EMAIL = process.argv[2];
const PASSWORD = process.argv[3];
const SHOT_DIR = "C:\\Users\\user\\AppData\\Local\\Temp\\claude\\c--workStation-3-quikit1926\\636f48c9-470b-473f-8b89-56f4b5ca844b\\scratchpad\\final_shots";

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }
async function shot(page, name) { await page.screenshot({ path: `${SHOT_DIR}\\${name}.png` }); }

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--host-resolver-rules=MAP localhost 127.0.0.1'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on("pageerror", (e) => log("PAGE ERROR:", e.message));

  log("STEP 1: fresh login (brand-new org, never visited dashboard before)");
  await robustLogin(page, BASE, EMAIL, PASSWORD, log);
  log("post-login url:", page.url());

  log("STEP 2: first-ever navigation to /dashboard — no manual trigger, no prior visit");
  const t0 = Date.now();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  log(`dashboard responded in ${Date.now() - t0}ms`);
  await page.waitForTimeout(3000);
  await shot(page, "01-dashboard-first-ever-load");

  const bannerVisible = await page.getByText("You're viewing sample data").isVisible({ timeout: 8000 }).catch(() => false);
  log("demo-data banner visible on first load:", bannerVisible);

  const modules = [
    { name: "Quarter Settings", url: "/org-setup/quarters" },
    { name: "Teams", url: "/org-setup/teams" },
    { name: "Individual KPI", url: "/kpi" },
    { name: "Team KPI", url: "/kpi/teams" },
    { name: "Priority", url: "/priority" },
    { name: "WWW", url: "/www" },
    { name: "Create OPSP", url: "/opsp" },
    { name: "Category Mgmt", url: "/opsp/categories" },
    { name: "OPSP Review", url: "/opsp/review" },
  ];

  for (const m of modules) {
    await page.goto(`${BASE}${m.url}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2800);
    const shotName = `chk-${m.name.replace(/[^a-z0-9]/gi, "_")}`;
    await shot(page, shotName);
    const itemsText = await page.locator("text=/\\d+ items/").first().innerText().catch(() => "N/A");
    const noneMarker = await page.getByText(/No .* found|not set up yet|Add your first/i).first().isVisible({ timeout: 500 }).catch(() => false);
    log(`${m.name.padEnd(18)} items=${itemsText.padEnd(10)} emptyStateVisible=${noneMarker}`);
  }

  await browser.close();
  log("DONE");
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
