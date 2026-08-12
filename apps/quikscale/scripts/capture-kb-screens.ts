/**
 * Capture the Knowledge-Base screenshots from a running QuikScale instance.
 *
 *   npm run kb:screens                         # opens a browser, you sign in
 *   npm run kb:screens -- --url=http://localhost:3002
 *   npm run kb:screens -- --only=kpi-table,priority-table
 *
 * Flags are used rather than environment variables because `VAR=1 cmd` is bash
 * syntax that cmd.exe rejects outright ("'VAR' is not recognized as an internal
 * or external command"). Every flag still has an env-var equivalent for CI.
 *
 * Writes PNGs into `public/kb/screens/`, where the Knowledge Base picks them up
 * automatically — the web reader on reload, the PDF on the next download.
 *
 * Credentials come from the environment so nothing is committed:
 *   KB_EMAIL / KB_PASSWORD   (defaults to the e2e admin used by __tests__/e2e)
 *
 * Every recipe is best-effort and independent. A shot whose module is disabled,
 * whose permission is missing, or whose selector has moved is reported as
 * SKIPPED and the run continues — a partial capture is useful, an aborted run
 * is not. Slots left uncaptured keep their described placeholder.
 */

import { chromium, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/* ── Options: `--flag=value` first, environment variable as fallback ─────── */

const ARGV = process.argv.slice(2);
function flag(name: string): string | undefined {
  const hit = ARGV.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "true" : hit.slice(eq + 1);
}
function opt(name: string, env: string, fallback = ""): string {
  return flag(name) ?? process.env[env] ?? fallback;
}

const BASE_URL = opt("url", "KB_BASE_URL", "http://localhost:3003").replace(/\/+$/, "");
const EMAIL = opt("email", "KB_EMAIL");
const PASSWORD = opt("password", "KB_PASSWORD");
const ONLY = opt("only", "KB_ONLY").split(",").map((s) => s.trim()).filter(Boolean);
const STORAGE_STATE_IN = opt("state", "KB_STORAGE_STATE");
const SESSION_COOKIE = opt("cookie", "KB_SESSION_COOKIE");

const OUT_DIR = path.join(process.cwd(), "public", "kb", "screens");
/** Signed-in storage state, written once and reused by every shot's context. */
const STATE_FILE = path.join(process.cwd(), ".kb-auth.json");

/**
 * Manual sign-in is the DEFAULT. QuikScale authenticates through the central
 * QuikIT auth app over OAuth (and optionally Google/Microsoft), which a scripted
 * form-fill cannot complete on every environment — so unless another credential
 * source was supplied explicitly, open a real browser and let a human in.
 */
const MANUAL_LOGIN =
  flag("manual") === "true" ||
  process.env.KB_MANUAL_LOGIN === "1" ||
  (!STORAGE_STATE_IN && !SESSION_COOKIE && !(EMAIL && PASSWORD));

/**
 * 1600 CSS px at scale 1 is ~245 DPI across a printed page's text column —
 * plenty for the PDF, and it keeps the embedded manual to single-digit MB.
 * Scale 2 quadruples every file for no visible gain in print.
 */
const VIEWPORT = { width: 1600, height: 1000 };
const DEVICE_SCALE = Number(opt("scale", "KB_SCALE", "1")) || 1;

/** Blur tenant data out of the captures. On unless `--no-redact` is passed. */
const REDACT = flag("no-redact") !== "true" && process.env.KB_REDACT !== "0";

interface Shot {
  /** Output filename — must match the `file` on the figure block in the content. */
  file: string;
  /** Route to visit before capturing. */
  route: string;
  /** Optional interaction + region selection. Return a locator-ish selector to clip to. */
  prepare?: (page: Page) => Promise<string | undefined>;
}

/* ── Redaction ───────────────────────────────────────────────────────────── */

/**
 * Blur the tenant's real data out of every capture, while leaving the interface
 * itself sharp — the screenshots teach the UI, not the numbers.
 *
 * ON BY DEFAULT (`--no-redact` turns it off). The manual is downloaded as a PDF
 * and circulated, so shipping legible customer names, revenue figures and staff
 * emails inside it is a data-leak waiting to happen. Blurring at capture time
 * means the raw data never reaches the PNG at all — unlike blurring in the
 * reader, which would still leave it recoverable in the file.
 *
 * Deliberately NOT blurred: column headers, toolbars, buttons, labels, nav,
 * section titles and status colours. Those carry the instructional value, and a
 * KPI cell keeps its traffic-light colour through the blur.
 */
export const REDACT_CSS = `
  /* Table row content — names, owners, values, notes */
  tbody td, tbody th { filter: blur(5px) !important; }

  /* Identity in the header: signed-in user, org chip */
  header [data-tour="user-menu"],
  header span[title] { filter: blur(5px) !important; }

  /* Values typed into forms, drawers and modals */
  [role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select,
  aside input, aside textarea, aside select { filter: blur(5px) !important; }

  /* Free-text bodies: OPSP sections, SWT entries, notes, feedback */
  [contenteditable="true"] { filter: blur(5px) !important; }

  /* Escape hatch — mark anything else in the app with data-kb-redact */
  [data-kb-redact] { filter: blur(5px) !important; }
`;

/* ── Small helpers ───────────────────────────────────────────────────────── */

/** Click the first thing matching any of the given accessible names; ignore misses. */
async function tryClick(page: Page, names: (string | RegExp)[]): Promise<boolean> {
  for (const name of names) {
    const btn = page.getByRole("button", { name }).first();
    try {
      if (await btn.isVisible({ timeout: 1200 })) {
        await btn.click({ timeout: 2000 });
        await page.waitForTimeout(500);
        return true;
      }
    } catch { /* try the next candidate */ }
  }
  return false;
}

/** Expand a sidebar group by its label so its children are visible. */
async function expandNav(page: Page, label: string): Promise<void> {
  try {
    const item = page.locator("nav").getByText(label, { exact: true }).first();
    if (await item.isVisible({ timeout: 1500 })) {
      await item.click({ timeout: 2000 });
      await page.waitForTimeout(400);
    }
  } catch { /* group may already be open, or hidden by permissions */ }
}

/** Wait for the page to settle: network quiet plus a beat for chart/grid paint. */
async function settle(page: Page, ms = 900): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/* ── The 32 shots ────────────────────────────────────────────────────────── */

/**
 * Exported so `__tests__/unit/kbScreens.test.ts` can assert this list stays in
 * lock-step with the figure slots authored in lib/knowledge-base/content — a
 * new figure with no recipe here would otherwise silently never be captured.
 */
export const SHOTS: Shot[] = [
  // Foundations
  { file: "app-shell-overview.png", route: "/dashboard" },
  {
    file: "sidebar-expanded.png",
    route: "/dashboard",
    prepare: async (page) => {
      await expandNav(page, "Org Setup");
      await expandNav(page, "KPI");
      return "nav[data-tour='sidebar']";
    },
  },
  { file: "header-controls.png", route: "/dashboard", prepare: async () => "header" },
  {
    file: "first-run-quarter-settings.png",
    route: "/org-setup/quarters",
    prepare: async (page) => {
      await tryClick(page, [/initialize/i, /generate/i, /add|new/i]);
      return undefined;
    },
  },
  { file: "fiscal-year-model.png", route: "/org-setup/quarters" },
  { file: "period-filter.png", route: "/kpi", prepare: async () => "main header, main > div > div:first-child" },
  { file: "grid-anatomy.png", route: "/kpi" },
  {
    file: "grid-column-menu.png",
    route: "/kpi",
    prepare: async (page) => {
      // The per-column menu trigger lives inside the header cell.
      const trigger = page.locator("thead button").nth(2);
      await trigger.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      return undefined;
    },
  },

  // Execution
  { file: "dashboard-overview.png", route: "/dashboard" },
  { file: "kpi-table.png", route: "/kpi" },
  {
    file: "kpi-add-form.png",
    route: "/kpi",
    prepare: async (page) => { await tryClick(page, [/add kpi/i, /add/i]); return undefined; },
  },
  {
    file: "kpi-log-modal.png",
    route: "/kpi",
    prepare: async (page) => {
      await page.locator("tbody tr").first().locator("button").nth(1).click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(700);
      return undefined;
    },
  },
  { file: "kpi-traffic-light.png", route: "/kpi", prepare: async () => "tbody" },
  { file: "team-kpi-grid.png", route: "/kpi/teams" },
  { file: "priority-table.png", route: "/priority" },
  { file: "priority-week-cell.png", route: "/priority", prepare: async () => "tbody" },
  { file: "www-table.png", route: "/www" },
  { file: "meeting-rhythm-dashboard.png", route: "/client-meetings" },
  { file: "analytics-scorecard.png", route: "/performance/scorecard" },

  // Strategy
  { file: "opsp-editor.png", route: "/opsp" },
  { file: "opsp-cascade-modal.png", route: "/opsp" },
  {
    file: "opsp-export.png",
    route: "/opsp",
    prepare: async (page) => { await tryClick(page, [/export/i]); return undefined; },
  },
  { file: "habits-fill-form.png", route: "/performance/habits" },
  { file: "habits-aggregate.png", route: "/performance/habits" },
  { file: "swt-page.png", route: "/performance/swt" },

  // People
  { file: "people-cycle-hub.png", route: "/performance/cycle" },
  {
    file: "people-review-panel.png",
    route: "/performance/reviews",
    prepare: async (page) => { await tryClick(page, [/add|new|create/i]); return undefined; },
  },
  { file: "people-talent-grid.png", route: "/performance/talent" },
  { file: "face-chart.png", route: "/performance/face" },
  { file: "survey-list.png", route: "/performance/survey" },

  // Administration
  {
    file: "org-setup-nav.png",
    route: "/org-setup/teams",
    prepare: async (page) => { await expandNav(page, "Org Setup"); return undefined; },
  },
  { file: "settings-company.png", route: "/settings", prepare: async (page) => {
      await page.getByText(/company/i).first().click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
      return undefined;
    },
  },
];

/* ── Runner ──────────────────────────────────────────────────────────────── */

/**
 * Sign in and persist the session to STATE_FILE.
 *
 * Reached only when manual login did not already run, i.e. when one of the
 * explicit credential sources was supplied:
 *
 *   --state=<file>     reuse a Playwright storageState JSON
 *   --cookie=<value>   seed the next-auth session cookie directly
 *   --email/--password fill the form (only where /login shows a password form)
 */
async function authenticate(browser: Browser): Promise<void> {
  if (STORAGE_STATE_IN) {
    if (!fs.existsSync(STORAGE_STATE_IN)) {
      throw new Error(`KB_STORAGE_STATE file not found: ${STORAGE_STATE_IN}`);
    }
    fs.copyFileSync(STORAGE_STATE_IN, STATE_FILE);
    console.log(`Using saved session from ${STORAGE_STATE_IN}\n`);
    return;
  }

  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    if (SESSION_COOKIE) {
      const { hostname, protocol } = new URL(BASE_URL);
      await context.addCookies([
        {
          // NextAuth uses the __Secure- prefix only over https.
          name: protocol === "https:" ? "__Secure-next-auth.session-token" : "next-auth.session-token",
          value: SESSION_COOKIE,
          domain: hostname,
          path: "/",
          httpOnly: true,
          secure: protocol === "https:",
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: 25_000 });
      if (/\/login|\/api\/oauth/.test(page.url())) {
        throw new Error("The supplied session cookie was rejected — it may have expired.");
      }
      console.log("Using the supplied session cookie\n");
    } else {
      if (!EMAIL || !PASSWORD) {
        throw new Error("No credentials supplied. Run without flags to sign in manually.");
      }
      const page = await context.newPage();
      // Enter via a protected route, not /login. Hitting /login directly starts
      // a fresh OAuth authorize round-trip that a local environment may reject
      // ("redirect_uri not registered"); the guarded-route bounce lands on the
      // auth app's actual sign-in form reliably.
      await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);

      const email = page.locator('input[type="email"], #login-email').first();
      const password = page.locator('input[type="password"], #login-password').first();
      await email.waitFor({ state: "visible", timeout: 20_000 });
      await email.fill(EMAIL);
      await password.fill(PASSWORD);
      await page.getByRole("button", { name: /sign in|log ?in|continue/i }).first().click();
      await page.waitForURL(/\/dashboard/, { timeout: 40_000 });
      console.log(`Signed in as ${EMAIL}\n`);
    }
    await context.storageState({ path: STATE_FILE });
  } finally {
    await context.close();
  }
}

/** Headed sign-in: open a window, wait for the operator to reach the dashboard. */
async function manualLogin(): Promise<void> {
  console.log("Opening a browser window — sign in as you normally would.");
  console.log("Capture starts automatically once you land on the dashboard.\n");
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/dashboard/, { timeout: 5 * 60_000 });
    await page.waitForTimeout(1500);
    await context.storageState({ path: STATE_FILE });
    console.log("Signed in — session captured.\n");
  } finally {
    await browser.close();
  }
}

async function capture(browser: Browser, shot: Shot): Promise<"captured" | "skipped"> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
    storageState: STATE_FILE,
  });
  const page = await context.newPage();
  try {
    await page.goto(`${BASE_URL}${shot.route}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await settle(page);

    // Never save an auth screen into the manual. A silently-expired session
    // would otherwise fill `public/kb/screens/` with 32 copies of the login
    // page — worse than no screenshot at all, because it looks like it worked.
    if (/\/login|\/api\/oauth|\/auth\//.test(page.url())) {
      console.warn(`  ! ${shot.file} — not signed in (landed on ${new URL(page.url()).pathname})`);
      return "skipped";
    }

    const clip = shot.prepare ? await shot.prepare(page) : undefined;

    // Inject AFTER prepare() — a modal or drawer opened there needs redacting
    // too, and a style tag added earlier would not cover nodes mounted since.
    if (REDACT) await page.addStyleTag({ content: REDACT_CSS });
    await page.waitForTimeout(400);

    const target = clip ? page.locator(clip).first() : null;
    const dest = path.join(OUT_DIR, shot.file);

    if (target && (await target.count()) > 0 && (await target.isVisible().catch(() => false))) {
      await target.screenshot({ path: dest });
    } else {
      await page.screenshot({ path: dest });
    }
    return "captured";
  } catch (err) {
    console.warn(`  ! ${shot.file} — ${(err as Error).message.split("\n")[0]}`);
    return "skipped";
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const shots = ONLY.length
    ? SHOTS.filter((s) => ONLY.some((o) => s.file.startsWith(o)))
    : SHOTS;

  if (shots.length === 0) {
    console.error(`No shots match --only="${ONLY.join(",")}"`);
    process.exit(1);
  }

  console.log(`Capturing ${shots.length} screenshot(s) from ${BASE_URL}`);
  console.log(
    REDACT
      ? "Tenant data will be blurred out of every capture (--no-redact to disable)\n"
      : "WARNING: redaction disabled — captures will contain real tenant data\n",
  );

  // A stale state file from an aborted run would silently reuse a dead session.
  fs.rmSync(STATE_FILE, { force: true });
  if (MANUAL_LOGIN) await manualLogin();

  const browser = await chromium.launch();
  try {
    // One sign-in, reused by every shot's context.
    if (!fs.existsSync(STATE_FILE)) await authenticate(browser);

    let captured = 0;
    let skipped = 0;
    for (const shot of shots) {
      process.stdout.write(`  ${shot.file.padEnd(34)} `);
      const result = await capture(browser, shot);
      if (result === "captured") { captured++; console.log("ok"); }
      else { skipped++; }
    }

    const bytes = fs
      .readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".png"))
      .reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);

    console.log(`\nDone. ${captured} captured, ${skipped} skipped.`);
    console.log(`${OUT_DIR} — ${(bytes / 1024 / 1024).toFixed(1)} MB of PNGs`);
    console.log("Reload /help to see them; Download PDF embeds them on the next run.");
    if (skipped > 0) {
      console.log("Skipped slots keep their placeholder — re-run with --only=<name> to retry.");
    }
  } finally {
    await browser.close();
    fs.rmSync(STATE_FILE, { force: true });
  }
}

/** Only drive a browser when run as a script — importers just want SHOTS. */
const isDirectRun = process.argv[1]?.replace(/\\/g, "/").includes("capture-kb-screens");

if (isDirectRun) main().catch((err) => {
  fs.rmSync(STATE_FILE, { force: true });
  console.error(`\nCapture failed: ${(err as Error).message.split("\n")[0]}`);
  console.error(`
Checklist:
  • Is QuikScale running and reachable at ${BASE_URL}?
      npm run kb:screens -- --url=http://localhost:3003

  • Sign-in. Running with no flags opens a real browser so you can sign in
    yourself — that is the reliable route, because QuikScale authenticates
    through the central QuikIT auth app over OAuth.

  Other options:
      --cookie=<next-auth.session-token from your browser devtools>
      --state=./auth.json          (a saved Playwright storageState file)
      --email=... --password=...   (only where /login shows a password form)

  • Capture a subset while iterating:
      npm run kb:screens -- --only=kpi-table,priority-table
`);
  process.exit(1);
});
