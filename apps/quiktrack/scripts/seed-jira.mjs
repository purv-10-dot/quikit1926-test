#!/usr/bin/env node
/**
 * seed-jira.mjs — populates a Jira Cloud site with dummy projects, sprints,
 * issues, and comments so the QuikTrack → Jira importer has realistic data
 * to chew on.
 *
 * USAGE (PowerShell):
 *   $env:JIRA_DOMAIN     = "pms72898.atlassian.net"
 *   $env:JIRA_EMAIL      = "you@company.com"
 *   $env:JIRA_API_TOKEN  = "<token from id.atlassian.com>"
 *   node apps/quiktrack/scripts/seed-jira.mjs
 *
 * USAGE (bash):
 *   JIRA_DOMAIN=pms72898.atlassian.net \
 *   JIRA_EMAIL=you@company.com \
 *   JIRA_API_TOKEN=... \
 *   node apps/quiktrack/scripts/seed-jira.mjs
 *
 * Flags (positional, all optional):
 *   --projects=12        how many projects to create (default 12)
 *   --issues-min=8       min issues per project (default 8)
 *   --issues-max=14      max issues per project (default 14)
 *   --no-projects        skip project creation, only seed into existing ones
 *   --dry-run            print what it would do without calling Jira
 *
 * Idempotency:
 *   - Projects use a deterministic key prefix (SEED + 2 chars). If a key
 *     already exists, the existing project is reused.
 *   - Issues / sprints / comments are NOT deduped — re-running creates more.
 *     Use --no-projects to keep adding only issues/sprints to existing ones.
 *
 * Notes:
 *   - Requires Jira admin permission on the site (project creation needs it).
 *   - Throttles to ~6 req/s and honours 429 retries.
 *   - Comments use plain-text only (the simple description shape — Jira
 *     accepts a string or ADF; we use the string form for brevity).
 */

const ARGS = parseArgs(process.argv.slice(2));
const DOMAIN = need("JIRA_DOMAIN");
const EMAIL = need("JIRA_EMAIL");
const API_TOKEN = need("JIRA_API_TOKEN");
const PROJECT_COUNT = clamp(int(ARGS["projects"], 12), 1, 30);
const ISSUE_MIN = clamp(int(ARGS["issues-min"], 8), 1, 50);
const ISSUE_MAX = clamp(int(ARGS["issues-max"], 14), ISSUE_MIN, 50);
const SKIP_PROJECTS = !!ARGS["no-projects"];
const DRY = !!ARGS["dry-run"];

const BASE = `https://${DOMAIN.replace(/^https?:\/\//, "").replace(/\/+$/, "").split("/")[0]}`;
const AUTH = "Basic " + Buffer.from(`${EMAIL}:${API_TOKEN}`).toString("base64");

const PROJECT_NAMES = [
  ["E-commerce Platform",        "ECOM"],
  ["Mobile Banking App",         "MBNK"],
  ["Customer Support Portal",    "CSUP"],
  ["Internal HR System",         "HR"],
  ["Marketing Website Redesign", "MKTG"],
  ["Data Warehouse Migration",   "DWHM"],
  ["DevOps Tooling",             "DEVO"],
  ["Sales CRM Revamp",           "CRM"],
  ["Payments Service",           "PAY"],
  ["Search Service",             "SRCH"],
  ["Notifications Service",      "NOTI"],
  ["Analytics Dashboard",        "ANLY"],
  ["Mobile iOS App",             "IOS"],
  ["Mobile Android App",         "DROID"],
  ["Identity & Auth",            "AUTH"],
];

const ISSUE_TYPES = ["Story", "Task", "Bug", "Task", "Story", "Task"]; // weighted

const PRIORITIES = ["Highest", "High", "Medium", "Medium", "Medium", "Low", "Lowest"];

const TITLE_TEMPLATES = [
  (n) => `Implement ${n}`,
  (n) => `Fix ${n} regression`,
  (n) => `Investigate ${n}`,
  (n) => `Refactor ${n}`,
  (n) => `Add tests for ${n}`,
  (n) => `Improve ${n} performance`,
  (n) => `Document ${n}`,
  (n) => `Migrate ${n} to v2`,
  (n) => `Decommission legacy ${n}`,
  (n) => `Spike: evaluate ${n}`,
];

const NOUNS = [
  "checkout flow", "user profile API", "search index", "payment webhook",
  "OAuth callback", "rate limiter", "audit log", "cache layer",
  "data export", "image upload", "PDF export", "session store",
  "email template", "feature flag", "background worker", "schema migration",
  "report generator", "notification fanout", "billing job", "OTP service",
];

const COMMENTS = [
  "Looks good to me, shipping after review.",
  "Reproduced on staging — root cause looks like the new cache layer.",
  "Pushed a fix to the feature branch, waiting on CI.",
  "Customer reported this on Tuesday; bumping priority.",
  "Adding more tests before we merge — coverage was at 62%.",
  "Spoke to the architect — agreed on approach in the design doc.",
  "Holding for the next sprint, not enough capacity this week.",
];

const TRANSITIONS = ["In Progress", "Done"]; // for status variety

let lastReq = 0;
async function jira(method, path, body) {
  const now = Date.now();
  const gap = now - lastReq;
  if (gap < 170) await sleep(170 - gap);
  lastReq = Date.now();
  if (DRY) {
    console.log(`[dry] ${method} ${path}${body ? " " + JSON.stringify(body).slice(0, 80) : ""}`);
    return method === "GET" ? {} : { id: "dry", key: "DRY-1" };
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: AUTH,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 3) {
      const wait = Number(res.headers.get("retry-after") ?? "2") * 1000;
      console.warn(`  429 — sleeping ${wait}ms`);
      await sleep(wait);
      continue;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`${method} ${path} → ${res.status} ${res.statusText} ${txt.slice(0, 300)}`);
    }
    if (!ct.includes("application/json")) return null;
    return res.json();
  }
  throw new Error(`${method} ${path} — exhausted retries`);
}

(async function main() {
  console.log(`Seeding ${BASE} as ${EMAIL}`);
  if (DRY) console.log("DRY RUN — no calls will be made\n");

  const me = await jira("GET", "/rest/api/3/myself");
  console.log(`Authenticated as ${me.displayName ?? me.emailAddress ?? me.accountId}`);

  const projects = [];
  if (SKIP_PROJECTS) {
    const list = await jira("GET", "/rest/api/3/project/search?maxResults=50");
    projects.push(...(list.values ?? []).slice(0, PROJECT_COUNT));
    console.log(`Reusing ${projects.length} existing projects (--no-projects)`);
  } else {
    for (let i = 0; i < PROJECT_COUNT; i++) {
      const [name, baseKey] = PROJECT_NAMES[i % PROJECT_NAMES.length];
      // Suffix the key for uniqueness when re-running.
      const key = uniqueKey(baseKey);
      console.log(`\n→ Project ${i + 1}/${PROJECT_COUNT}: ${name} (${key})`);
      try {
        const created = await jira("POST", "/rest/api/3/project", {
          key,
          name: `${name}`,
          projectTypeKey: "software",
          // Scrum template so we get a board + can create sprints.
          projectTemplateKey:
            "com.pyxis.greenhopper.jira:gh-simplified-scrum-classic",
          leadAccountId: me.accountId,
          assigneeType: "PROJECT_LEAD",
        });
        projects.push({ id: created.id, key: created.key, name });
      } catch (e) {
        // Most common cause: key already exists, or you don't have admin perms.
        console.warn(`  skipped: ${e.message.slice(0, 200)}`);
      }
    }
  }

  if (projects.length === 0) {
    console.error("No projects to seed into. Bailing.");
    process.exit(1);
  }

  for (const p of projects) {
    console.log(`\n=== Seeding ${p.key} — ${p.name ?? "(existing)"} ===`);

    // Discover the auto-created scrum board.
    const boards = await jira(
      "GET",
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(p.key)}`,
    );
    const scrumBoard = (boards.values ?? []).find((b) => b.type === "scrum");
    const boardId = scrumBoard?.id;

    // Sprints — one active, one future, one past (closed). Only on scrum boards.
    const sprintsForIssues = [];
    if (boardId) {
      for (const cfg of [
        { name: `Sprint ${rand(100, 199)}`, state: "active" },
        { name: `Sprint ${rand(200, 299)}`, state: "future" },
        { name: `Sprint ${rand(300, 399)}`, state: "closed" },
      ]) {
        try {
          const s = await jira("POST", "/rest/agile/1.0/sprint", {
            originBoardId: boardId,
            name: cfg.name,
            goal: pick([
              "Ship the MVP",
              "Reduce bug backlog by 30%",
              "Onboard 3 new customers",
              "Cut p95 latency in half",
              "Migrate to v2 schema",
            ]),
          });
          // active/closed require start/end dates and a state transition.
          if (cfg.state === "active") {
            await jira("POST", `/rest/agile/1.0/sprint/${s.id}`, {
              startDate: daysAgo(3),
              endDate: daysFromNow(11),
              state: "active",
            });
          } else if (cfg.state === "closed") {
            await jira("POST", `/rest/agile/1.0/sprint/${s.id}`, {
              startDate: daysAgo(28),
              endDate: daysAgo(14),
              state: "active",
            });
            await jira("POST", `/rest/agile/1.0/sprint/${s.id}`, {
              state: "closed",
            });
          }
          sprintsForIssues.push({ id: s.id, name: s.name, state: cfg.state });
        } catch (e) {
          console.warn(`  sprint failed: ${e.message.slice(0, 200)}`);
        }
      }
    } else {
      console.warn("  no scrum board found — skipping sprints");
    }

    // Issues — 1 epic, mixed types beneath it.
    const issueCount = rand(ISSUE_MIN, ISSUE_MAX);

    // Try to create an Epic first so we can link Stories under it.
    let epicKey = null;
    try {
      const epic = await jira("POST", "/rest/api/3/issue", {
        fields: {
          project: { key: p.key },
          summary: `Epic: ${pick(NOUNS)} rollout`,
          issuetype: { name: "Epic" },
          priority: { name: "High" },
        },
      });
      epicKey = epic.key;
    } catch (e) {
      console.warn(`  epic creation failed: ${e.message.slice(0, 160)}`);
    }

    let createdIssues = 0;
    for (let i = 0; i < issueCount; i++) {
      const type = pick(ISSUE_TYPES);
      const noun = pick(NOUNS);
      const title = pick(TITLE_TEMPLATES)(noun);
      const sprint =
        sprintsForIssues.length > 0 && Math.random() < 0.6
          ? pick(sprintsForIssues)
          : null;
      const fields = {
        project: { key: p.key },
        summary: title,
        issuetype: { name: type },
        priority: { name: pick(PRIORITIES) },
        description: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: `Auto-generated dummy issue for ${noun}. Owner TBD.`,
                },
              ],
            },
          ],
        },
      };
      // Linking to an Epic — works on company-managed projects via the
      // "parent" field for next-gen, or the legacy "customfield_10014" for
      // classic. We try parent first; classic projects ignore it silently.
      if (epicKey && type === "Story") fields.parent = { key: epicKey };

      let created;
      try {
        created = await jira("POST", "/rest/api/3/issue", { fields });
      } catch (e) {
        console.warn(`  issue ${i + 1} failed: ${e.message.slice(0, 160)}`);
        continue;
      }
      createdIssues += 1;

      // Move some to In Progress / Done for status variety.
      if (Math.random() < 0.55) {
        try {
          const t = await jira(
            "GET",
            `/rest/api/3/issue/${created.key}/transitions`,
          );
          const target = pick(TRANSITIONS);
          const tr = (t.transitions ?? []).find(
            (x) => x.to?.name?.toLowerCase() === target.toLowerCase(),
          );
          if (tr) {
            await jira(
              "POST",
              `/rest/api/3/issue/${created.key}/transitions`,
              { transition: { id: tr.id } },
            );
          }
        } catch {
          /* swallow */
        }
      }

      // Add the issue to a sprint via the Agile API.
      if (sprint && sprint.state !== "closed") {
        try {
          await jira("POST", `/rest/agile/1.0/sprint/${sprint.id}/issue`, {
            issues: [created.key],
          });
        } catch {
          /* swallow */
        }
      }

      // Add 0-2 comments.
      const nCmt = Math.random() < 0.6 ? rand(1, 2) : 0;
      for (let k = 0; k < nCmt; k++) {
        try {
          await jira("POST", `/rest/api/3/issue/${created.key}/comment`, {
            body: {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: pick(COMMENTS) }],
                },
              ],
            },
          });
        } catch {
          /* swallow */
        }
      }
    }

    console.log(
      `  ✓ ${createdIssues} issues, ${sprintsForIssues.length} sprints, epic=${epicKey ?? "none"}`,
    );
  }

  console.log("\nDone.");
})().catch((e) => {
  console.error("\nFATAL:", e.message);
  process.exit(1);
});

/* ─────────── helpers ─────────── */

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(2);
  }
  return v.trim();
}
function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    out[k] = v ?? true;
  }
  return out;
}
function int(v, def) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function rand(lo, hi) {
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function uniqueKey(base) {
  // 2–10 chars, uppercase letters/digits only. Append a 2-char suffix.
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 2).toUpperCase();
  const trimmed = base.slice(0, 8);
  return (trimmed + suffix).slice(0, 10);
}
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
