/**
 * Captures real screenshots of the QuikTest flow by driving the running dev
 * server with Playwright, then emits an HTML guide that prints to PDF.
 *
 * Usage:
 *   cd apps/quiktrack
 *   QT_SESSION=<next-auth.session-token value> node scripts/capture-quiktest-guide.mjs
 *
 * On Windows PowerShell:
 *   $env:QT_SESSION="<value>"; node scripts/capture-quiktest-guide.mjs
 *
 * Read-only: it navigates and screenshots. It opens panels (which is a click)
 * but never submits a create/delete form, so your data is untouched.
 *
 * Output: scripts/quiktest-guide/ — one PNG per step + guide.html
 * Print guide.html to PDF from the browser (Ctrl+P → Save as PDF).
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.QT_BASE ?? "http://localhost:3004";
const SESSION = process.env.QT_SESSION;
const PROJECT_ID = process.env.QT_PROJECT_ID ?? "cmpqrve90001t97sjla4q6qp0";
const OUT = path.join(process.cwd(), "scripts", "quiktest-guide");

if (!SESSION) {
  console.error(
    "QT_SESSION is required — copy the next-auth.session-token cookie value.\n" +
      'PowerShell:  $env:QT_SESSION="<value>"; node scripts/capture-quiktest-guide.mjs',
  );
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

/** Each step: what the reader does, what to expect, and the shot to take. */
const STEPS = [
  {
    n: "01",
    title: "Open the Tests tab",
    url: `/spaces/${PROJECT_ID}/test`,
    does: "Open your project and click the Tests tab.",
    expect:
      "The test case repository: suite tree on the left, case list on the right.",
    fields: [],
  },
  {
    n: "02",
    title: "Create a test suite",
    url: `/spaces/${PROJECT_ID}/test`,
    click: '[aria-label="New suite"]',
    does: 'Click + next to "SUITES".',
    expect:
      "A side panel opens. A suite is a container for this project's cases; creating one also seeds a root folder.",
    fields: [
      ["Suite name", "Regression"],
      ["Description", "(optional)"],
    ],
  },
  {
    n: "03",
    title: "Add a folder",
    url: `/spaces/${PROJECT_ID}/test`,
    click: "text=Add folder",
    does: 'Click "Add folder" under the tree (or + on a folder to nest one inside it).',
    expect:
      'Root-level folders send parentId: null. Name it after the area under test, e.g. "Login".',
    fields: [["Folder name", "Login"]],
  },
  {
    n: "04",
    title: "Create a test case",
    url: `/spaces/${PROJECT_ID}/test`,
    click: "text=New test case",
    does: 'Select a folder, then click "New test case".',
    expect:
      "Only Title is required. Set Automation ID if CI will report results for this case — without it, automated results come back as unmatched.",
    fields: [
      ["Title", "Login with valid credentials redirects to dashboard"],
      ["Priority", "Medium (or High)"],
      ["Type", "Functional"],
      ["Automation", "Manual"],
      ["Automation ID", "login.spec.ts::valid_creds"],
      ["Preconditions", "A registered user exists with a verified email address."],
    ],
  },
  {
    n: "05",
    title: "Add the steps",
    url: `/spaces/${PROJECT_ID}/test`,
    click: "text=New test case",
    then: "text=Add step",
    does: 'Click "Add step" once per step, filling Action and Expected result.',
    expect:
      "Steps are ordered; use the arrows to reorder. A case can be saved with no steps.",
    fields: [
      ["Step 1", "Navigate to /login → Login form is displayed"],
      ["Step 2", "Enter valid email and password, submit → Redirected to /dashboard within 2s"],
      ["Step 3", "Check the header → User's name is displayed top-right"],
    ],
  },
  {
    n: "06",
    title: "Link coverage to a work item",
    url: `/spaces/${PROJECT_ID}/test`,
    does:
      'Save the case, reopen it from the table, scroll to Coverage → "Link a work item" → search a key and pick it.',
    expect:
      "This link is what makes the QuikTest panel appear on that work item. Coverage is only available on a SAVED case.",
    fields: [["Search", "QUIKTR (or any issue key/title)"]],
  },
  {
    n: "07",
    title: "Open the runs list",
    url: `/spaces/${PROJECT_ID}/test/runs`,
    does: 'Click "Test runs" in the repository header.',
    expect: "Every run for this project, with its pass rate and state.",
    fields: [],
  },
  {
    n: "08",
    title: "Create a run",
    url: `/spaces/${PROJECT_ID}/test/runs`,
    click: "text=New run",
    does: 'Click "New run", pick the suite, then Create run.',
    expect:
      'Materialises one test per case. Draft cases are EXCLUDED unless you tick "Include draft cases" — a new case is DRAFT, so tick it or the run comes back empty.',
    fields: [
      ["Name", "Sprint 14 regression"],
      ["Suite", "Regression"],
      ["Build", "1.4.0"],
      ["Environment", "staging"],
      ["Include draft cases", "✔ tick this"],
    ],
  },
  {
    n: "09",
    title: "The three-pane runner",
    url: `/spaces/${PROJECT_ID}/test/runs`,
    does: "Creating a run opens the runner. Or click a run name in the list.",
    expect:
      "Left: the work list with status glyphs. Middle: the steps AS PINNED to this run. Right: result entry.",
    fields: [],
  },
  {
    n: "10",
    title: "Record a result",
    url: `/spaces/${PROJECT_ID}/test/runs`,
    does:
      "Click Passed / Failed / Blocked, or press 1–5. Use j/k to move between tests.",
    expect:
      "The result is appended, the donut and left-hand glyph update, and the next test opens. Record a SECOND result on the same test — both persist; results are never overwritten.",
    fields: [
      ["1", "Passed"],
      ["2", "Failed"],
      ["3", "Blocked"],
      ["4", "Retest"],
      ["5", "Skipped"],
      ["Comment", "optional — what a developer needs to reproduce"],
      ["Timer", "optional — starts on click, not on open"],
    ],
  },
  {
    n: "11",
    title: "Close the run",
    url: `/spaces/${PROJECT_ID}/test/runs`,
    does: 'Click "Close run" in the runner header.',
    expect:
      "Results freeze: the entry pane locks and the API rejects further results with 409. Reopen to continue.",
    fields: [],
  },
  {
    n: "12",
    title: "The work-item panel",
    url: `/spaces/${PROJECT_ID}/backlog`,
    does:
      "Open the work item you linked in step 6. Look between Linked work items and Development.",
    expect:
      '"QuikTest: Results" — six tabs, the status donut, and rows that expand to Project / Milestone / Test Run. The Details sidebar gains QuikTest: Cases and QuikTest: Runs.',
    fields: [],
  },
];

const shots = [];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 1,
});

// Inject the session so Playwright browses as you. Both cookie names are set
// because NextAuth uses the __Secure- prefix only over HTTPS.
await context.addCookies([
  {
    name: "next-auth.session-token",
    value: SESSION,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);

const page = await context.newPage();
page.setDefaultTimeout(15_000);

for (const step of STEPS) {
  const file = `${step.n}-${step.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  try {
    await page.goto(`${BASE}${step.url}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    if (step.click) {
      const target = page.locator(step.click).first();
      if (await target.count()) {
        await target.click().catch(() => undefined);
        await page.waitForTimeout(900);
      }
    }
    if (step.then) {
      const t2 = page.locator(step.then).first();
      if (await t2.count()) {
        await t2.click().catch(() => undefined);
        await page.waitForTimeout(500);
      }
    }

    await page.screenshot({ path: path.join(OUT, file) });
    shots.push({ ...step, file, ok: true });
    console.log(`  captured ${step.n} ${step.title}`);
  } catch (e) {
    shots.push({ ...step, file: null, ok: false, err: String(e).slice(0, 200) });
    console.log(`  FAILED   ${step.n} ${step.title} — ${String(e).slice(0, 120)}`);
  }
}

// Detect a login redirect, which means the cookie didn't take.
const finalUrl = page.url();
if (/\/login/.test(finalUrl)) {
  console.log(
    "\nWARNING: ended on /login — the session cookie was rejected.\n" +
      "The screenshots will show the login page. Re-copy the cookie value and retry.",
  );
}

await browser.close();

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<!doctype html>
<meta charset="utf-8">
<title>QuikTest — test flow guide</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font: 13px/1.55 -apple-system,Segoe UI,Roboto,sans-serif; color: #1f2933; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  .sub { color: #6b7280; margin-bottom: 28px; }
  .step { page-break-inside: avoid; page-break-before: always; margin-bottom: 28px; }
  .step:first-of-type { page-break-before: avoid; }
  .num { display: inline-block; background: #1f2933; color: #fff; border-radius: 4px;
         padding: 1px 7px; font-size: 12px; font-weight: 600; margin-right: 8px; }
  h2 { font-size: 17px; margin: 0 0 8px; display: flex; align-items: center; }
  .does { margin: 0 0 6px; }
  .expect { background: #f0f7ff; border-left: 3px solid #2563eb; padding: 7px 10px;
            margin: 8px 0; font-size: 12.5px; }
  table { border-collapse: collapse; margin: 10px 0; font-size: 12.5px; width: 100%; }
  th { background: #eef2f7; text-align: left; padding: 5px 8px; font-weight: 600; }
  td { border-bottom: 1px solid #edf0f3; padding: 5px 8px; vertical-align: top; }
  td:first-child { width: 34%; color: #475569; }
  img { width: 100%; border: 1px solid #d7dde3; border-radius: 5px; margin-top: 10px; }
  .missing { border: 1px dashed #cbd5e1; border-radius: 5px; padding: 26px;
             text-align: center; color: #94a3b8; font-size: 12px; margin-top: 10px; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
  .api { page-break-before: always; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px;
        padding: 10px; font-size: 11.5px; overflow-x: auto; white-space: pre-wrap; }
</style>
<h1>QuikTest — test flow guide</h1>
<p class="sub">Author a case, run it, record results, and see them on a work item.
Screenshots captured from the running app on ${esc(BASE)}.</p>

${shots
  .map(
    (s) => `<div class="step">
  <h2><span class="num">${s.n}</span>${esc(s.title)}</h2>
  <p class="does">${esc(s.does)}</p>
  <div class="expect"><strong>Expect:</strong> ${esc(s.expect)}</div>
  ${
    s.fields.length
      ? `<table><tr><th>Field</th><th>Value</th></tr>${s.fields
          .map((f) => `<tr><td>${esc(f[0])}</td><td>${esc(f[1])}</td></tr>`)
          .join("")}</table>`
      : ""
  }
  ${
    s.ok && s.file
      ? `<img src="${s.file}" alt="${esc(s.title)}">`
      : `<div class="missing">Screenshot not captured${s.err ? ` — ${esc(s.err)}` : ""}<br>Paste your own here.</div>`
  }
</div>`,
  )
  .join("\n")}

<div class="api">
<h2><span class="num">13</span>CI ingestion (optional)</h2>
<p class="does">Both write paths land in the same append-only store; <code>source</code> is
the only difference. Mint a token via <code>POST /api/v1/token</code>, then:</p>
<div class="expect"><strong>Expect:</strong> <code>inserted: 1</code> and the unknown id
returned in <code>unmatched</code> — an unmapped test never fails the batch and is never
silently dropped.</div>
<pre>curl -X POST ${esc(BASE)}/api/test/runs/&lt;runId&gt;/results \\
  -H "Authorization: Bearer &lt;token&gt;" \\
  -H "Content-Type: application/json" \\
  -d '{"results":[
        {"automationId":"login.spec.ts::valid_creds","status":"Passed","elapsedMs":1250},
        {"automationId":"ghost::missing","status":"Failed"}
      ]}'</pre>
<p class="does">JUnit XML upload — same store, different format:</p>
<pre>curl -X POST ${esc(BASE)}/api/test/runs/&lt;runId&gt;/results/junit \\
  -H "Authorization: Bearer &lt;token&gt;" -H "Content-Type: text/xml" \\
  --data '&lt;testsuite name="Login"&gt;&lt;testcase classname="login.spec.ts" name="valid_creds" time="1.2"/&gt;&lt;/testsuite&gt;'</pre>
<div class="expect"><strong>Note:</strong> automated results land on
<em>Automation Passed / Failed / Error</em>, kept separate from the manual statuses so the
donut's two columns stay meaningful. Malformed XML returns 400 with the line and column.</div>
</div>
`;

writeFileSync(path.join(OUT, "guide.html"), html, "utf8");

const okCount = shots.filter((s) => s.ok).length;
console.log(`\n${okCount}/${shots.length} screenshots captured`);
console.log(`guide: ${path.join(OUT, "guide.html")}`);
console.log("Open it in a browser and Ctrl+P → Save as PDF.");
