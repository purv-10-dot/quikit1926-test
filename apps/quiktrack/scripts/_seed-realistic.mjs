/**
 * Wipe app_quiktrack data on Neon and reseed with realistic data for the
 * Moreyeahs org. 12 personas + 6 projects + issues + sprints + comments +
 * history + timesheet entries.
 *
 * Run:
 *   NEON_URL=... node scripts/_seed-realistic.mjs
 */
import pg from "pg";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const { Client } = pg;
const NEON = process.env.NEON_URL;
if (!NEON) throw new Error("Set NEON_URL");

const ORG_SLUG = "moreyeahs";
const APP_SLUG = "quiktrack";
const PASSWORD = "Demo@2026";

const PERSONAS = [
  { firstName: "Priya",   lastName: "Sharma",   email: "priya.sharma@moreyeahs-demo.com",   role: "manager",  title: "Engineering Manager" },
  { firstName: "Rohan",   lastName: "Singh",    email: "rohan.singh@moreyeahs-demo.com",    role: "manager",  title: "Tech Lead — Backend" },
  { firstName: "Arjun",   lastName: "Verma",    email: "arjun.verma@moreyeahs-demo.com",    role: "employee", title: "Senior Backend Engineer" },
  { firstName: "Kavya",   lastName: "Iyer",     email: "kavya.iyer@moreyeahs-demo.com",     role: "employee", title: "Senior Frontend Engineer" },
  { firstName: "Vikram",  lastName: "Nair",     email: "vikram.nair@moreyeahs-demo.com",    role: "employee", title: "DevOps Engineer" },
  { firstName: "Ananya",  lastName: "Kapoor",   email: "ananya.kapoor@moreyeahs-demo.com",  role: "employee", title: "Senior QA Engineer" },
  { firstName: "Karthik", lastName: "Reddy",    email: "karthik.reddy@moreyeahs-demo.com",  role: "employee", title: "Backend Engineer" },
  { firstName: "Sneha",   lastName: "Gupta",    email: "sneha.gupta@moreyeahs-demo.com",    role: "employee", title: "Frontend Engineer" },
  { firstName: "Meera",   lastName: "Joshi",    email: "meera.joshi@moreyeahs-demo.com",    role: "employee", title: "Product Designer" },
  { firstName: "Aarav",   lastName: "Mehta",    email: "aarav.mehta@moreyeahs-demo.com",    role: "employee", title: "QA Engineer" },
  { firstName: "Riya",    lastName: "Patel",    email: "riya.patel@moreyeahs-demo.com",     role: "employee", title: "Data Engineer" },
  { firstName: "Ishaan",  lastName: "Khanna",   email: "ishaan.khanna@moreyeahs-demo.com",  role: "employee", title: "Mobile Engineer" },
];

const PROJECTS = [
  { key: "CWP",    name: "Customer Web Portal",       description: "Public-facing customer dashboard and self-service portal", color: "#2563eb", leadEmail: "rohan.singh@moreyeahs-demo.com" },
  { key: "MOB",    name: "Mobile App (iOS/Android)",  description: "React Native cross-platform mobile experience",            color: "#a855f7", leadEmail: "ishaan.khanna@moreyeahs-demo.com" },
  { key: "API",    name: "Platform API",              description: "Core REST + GraphQL services and webhook infrastructure",   color: "#10b981", leadEmail: "arjun.verma@moreyeahs-demo.com" },
  { key: "DATA",   name: "Data & Analytics",          description: "ETL pipelines, warehouse, and customer-facing dashboards",  color: "#f59e0b", leadEmail: "riya.patel@moreyeahs-demo.com" },
  { key: "DEVOPS", name: "DevOps & Infrastructure",   description: "CI/CD, observability, security hardening, k8s",            color: "#ef4444", leadEmail: "vikram.nair@moreyeahs-demo.com" },
  { key: "MKT",    name: "Marketing Site & Content",  description: "Marketing website, blog, SEO, content management",         color: "#ec4899", leadEmail: "kavya.iyer@moreyeahs-demo.com" },
];

const STATUSES = [
  { name: "Backlog",     color: "#94a3b8", category: "BACKLOG",     orderIndex: 0 },
  { name: "To Do",       color: "#64748b", category: "TODO",        orderIndex: 1 },
  { name: "In Progress", color: "#2563eb", category: "IN_PROGRESS", orderIndex: 2 },
  { name: "In Review",   color: "#a855f7", category: "IN_PROGRESS", orderIndex: 3 },
  { name: "Done",        color: "#10b981", category: "DONE",        orderIndex: 4 },
];

const ISSUE_TYPES = [
  { name: "Epic",    color: "#a855f7", icon: "layers",       orderIndex: 0 },
  { name: "Story",   color: "#10b981", icon: "bookmark",     orderIndex: 1 },
  { name: "Task",    color: "#2563eb", icon: "check-square", orderIndex: 2 },
  { name: "Bug",     color: "#ef4444", icon: "bug",          orderIndex: 3 },
  { name: "Subtask", color: "#64748b", icon: "list-tree",    orderIndex: 4 },
];

const EPICS = {
  CWP:    ["Self-Service Onboarding", "Billing & Subscriptions", "Accessibility & i18n", "Account Settings Overhaul"],
  MOB:    ["Offline-First Experience", "Push Notifications", "Native Performance", "iOS App Store Launch"],
  API:    ["Auth & Identity (OAuth2)", "Webhooks Reliability", "Multi-Tenant Hardening", "GraphQL Migration"],
  DATA:   ["Customer 360 Dashboard", "Data Platform Migration", "Data Governance", "Real-time Analytics"],
  DEVOPS: ["Kubernetes 1.30 Migration", "Observability Overhaul", "Cost & Security Audit", "Multi-Region Failover"],
  MKT:    ["Website Redesign", "SEO & Performance", "Content Hub", "Marketing Automation"],
};

const ISSUES = {
  CWP: [
    "Onboarding wizard redesign","Account settings page","Billing history view","SSO integration with Okta",
    "Dark mode polish","Accessibility audit fixes","Mobile responsive navigation","Empty-state illustrations",
    "Password reset flow update","Two-factor auth setup screen","Notification preferences UI","Login page A/B test",
    "Profile photo upload","Email verification gate","Session timeout warning","Cookie consent banner",
    "Subscription upgrade flow","Cancel subscription survey","Invoice download PDF","Onboarding video embed",
  ],
  MOB: [
    "Push notification service setup","Offline mode caching layer","Biometric login (Face ID)","Deep link routing",
    "Crash reporting integration","In-app purchase flow","Pull-to-refresh polish","Dark mode parity",
    "Camera upload permission","App icon refresh","Onboarding tour","Build size optimization",
    "iOS 17 compatibility","Android tablet layout","Splash screen update","Privacy nutrition labels",
    "App Store screenshots","Play Store listing update","Crash on logout (P0)","Memory leak in feed",
  ],
  API: [
    "Migrate auth to OAuth2","Rate limiting middleware","Webhook delivery retry logic","GraphQL pagination cursors",
    "Audit log endpoint","Refresh token rotation","Field-level permissions","Soft-delete cascade fix",
    "API key revocation","Bulk import endpoint","Tenant isolation tests","OpenAPI spec generation",
    "Webhook signature HMAC","Idempotency keys","Sandbox API environment","API rate limit headers",
    "GraphQL N+1 prevention","REST → GraphQL migration","API key dashboard","Postman collection export",
  ],
  DATA: [
    "Nightly ETL pipeline","Customer churn dashboard","Revenue cohort report","Data quality alerts",
    "Snowflake to BigQuery migration","Anomaly detection model","Self-serve query builder","PII masking rules",
    "Dimensional model refactor","Looker dashboard refresh","Daily KPI digest email","Schema registry",
    "Real-time event streaming","Data lineage tracking","GDPR data export","Data dictionary",
    "Customer 360 view","Retention cohort analysis","Marketing attribution","Sales funnel report",
  ],
  DEVOPS: [
    "Migrate to k8s 1.30","Datadog APM rollout","Secret rotation policy","Cost optimization audit",
    "Multi-region failover","Terraform module split","Renovate bot config","WAF tuning",
    "Image scanning in CI","Blue/green deploy script","Pager rotation cleanup","Backup verification job",
    "Container vulnerability scan","Helm chart refactor","CI pipeline caching","CDN configuration",
    "Database connection pooling","Log aggregation upgrade","Monitoring dashboard","Incident runbook",
  ],
  MKT: [
    "Homepage redesign","Pricing page A/B test","Blog migration to Ghost","SEO meta tags audit",
    "Open Graph image generator","Sitemap.xml automation","Cookie consent banner","Newsletter signup",
    "Customer testimonial section","Case study landing pages","Lead capture form","Marketo integration",
    "Heatmap tracking setup","Conversion rate optimization","Page speed optimization","Image lazy loading",
    "404 page redesign","Search functionality","Author bio pages","RSS feed generation",
  ],
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const COMMENTS = [
  "Looks good, ready to merge after CI passes.",
  "Can you add a unit test for the edge case I flagged?",
  "Hit a blocker — see thread in #eng-platform.",
  "PR is up for review, would love a second pair of eyes.",
  "Re-tested in staging, all good.",
  "Bumping priority — customer escalation on this.",
  "Spec needs review with design before we move further.",
  "Closing as duplicate of CWP-12.",
  "Reproduced on Chrome 120 + Safari 17.",
  "Backporting to release/24.05 too.",
  "Reviewed the design with @priya, ready to implement.",
  "Performance regression — let's profile before merging.",
  "Approved. Ship it.",
];

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const cuid = () => "cm" + crypto.randomBytes(12).toString("hex");
const now = new Date();
function daysAgo(d) { const x = new Date(now); x.setDate(x.getDate() - d); return x; }
function daysFromNow(d) { const x = new Date(now); x.setDate(x.getDate() + d); return x; }
function ident(s) { return `"${s.replace(/"/g, '""')}"`; }

async function main() {
  const c = new Client({ connectionString: NEON });
  await c.connect();

  // Locate Moreyeahs org and quiktrack app.
  const orgRow = await c.query(`SELECT id, name, slug FROM "quikit"."Org" WHERE slug=$1`, [ORG_SLUG]);
  if (orgRow.rows.length === 0) throw new Error(`Org ${ORG_SLUG} not found on Neon`);
  const orgId = orgRow.rows[0].id;
  const appRow = await c.query(`SELECT id, name, slug FROM "quikit"."App" WHERE slug=$1`, [APP_SLUG]);
  if (appRow.rows.length === 0) throw new Error(`App ${APP_SLUG} not found on Neon`);
  const appId = appRow.rows[0].id;

  // Locate existing ashwin (we won't recreate him).
  const ashwinRow = await c.query(`SELECT id FROM "auth"."User" WHERE email=$1`, ["ashwin@moreyeahs.com"]);
  const ashwinId = ashwinRow.rows[0]?.id ?? null;

  console.log(`Org: ${orgRow.rows[0].name} (${orgId})`);
  console.log(`App: ${appRow.rows[0].name} (${appId})`);
  console.log(`Ashwin existing: ${ashwinId ? "yes" : "no"}`);

  console.log(`\nWiping app_quiktrack tables …`);
  await c.query("BEGIN");
  try {
    // 1) Drop FK constraints inside app_quiktrack (cascade truncate alone doesn't always work cross-table).
    const fks = await c.query(
      `SELECT cl.relname AS table_name, con.conname AS constraint_name
       FROM pg_constraint con
       JOIN pg_class cl ON cl.oid=con.conrelid
       JOIN pg_namespace n ON n.oid=cl.relnamespace
       WHERE con.contype='f' AND n.nspname='app_quiktrack'`,
    );
    const fkDefs = [];
    for (const fk of fks.rows) {
      const def = await c.query(
        `SELECT pg_get_constraintdef(con.oid) AS def
         FROM pg_constraint con
         JOIN pg_class cl ON cl.oid=con.conrelid
         JOIN pg_namespace n ON n.oid=cl.relnamespace
         WHERE n.nspname='app_quiktrack' AND cl.relname=$1 AND con.conname=$2`,
        [fk.table_name, fk.constraint_name],
      );
      fkDefs.push({ table: fk.table_name, constraint: fk.constraint_name, def: def.rows[0].def });
      await c.query(`ALTER TABLE "app_quiktrack".${ident(fk.table_name)} DROP CONSTRAINT ${ident(fk.constraint_name)}`);
    }

    // 2) Truncate all quiktrack tables.
    const tables = await c.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='app_quiktrack' ORDER BY table_name`,
    );
    const truncList = tables.rows.map((r) => `"app_quiktrack".${ident(r.table_name)}`).join(", ");
    await c.query(`TRUNCATE TABLE ${truncList} RESTART IDENTITY CASCADE`);

    console.log(`  ✓ dropped ${fks.rows.length} FKs, truncated ${tables.rows.length} tables`);

    // 3) Seed users + memberships.
    console.log(`\nSeeding users + memberships …`);
    const hashed = await bcrypt.hash(PASSWORD, 10);
    const userIds = {};
    for (const p of PERSONAS) {
      // Upsert user.
      const existing = await c.query(`SELECT id FROM "auth"."User" WHERE email=$1`, [p.email]);
      let uid;
      if (existing.rows[0]) {
        uid = existing.rows[0].id;
        await c.query(
          `UPDATE "auth"."User" SET "firstName"=$2, "lastName"=$3, "password"=$4, "emailVerified"=now(), "updatedAt"=now() WHERE id=$1`,
          [uid, p.firstName, p.lastName, hashed],
        );
      } else {
        uid = cuid();
        await c.query(
          `INSERT INTO "auth"."User" (id, email, "firstName", "lastName", "password", "emailVerified", "themeMode", "accentColor", "isSuperAdmin", "createdAt", "updatedAt", "mustChangePassword")
           VALUES ($1, $2, $3, $4, $5, now(), 'light', '#0066cc', false, now(), now(), false)`,
          [uid, p.email, p.firstName, p.lastName, hashed],
        );
      }
      userIds[p.email] = uid;
      // OrgMember (with team set to NULL — local data may have references we don't care about).
      await c.query(
        `INSERT INTO "quikit"."OrgMember" (id, "orgId", "userId", role, status, "acceptedAt", "createdAt", "updatedAt", "customPermissions", "inviteAppIds")
         VALUES ($1, $2, $3, $4, 'active', now(), now(), now(), '{}', '{}')
         ON CONFLICT ("orgId", "userId") DO UPDATE SET role=EXCLUDED.role, status='active', "updatedAt"=now()`,
        [cuid(), orgId, uid, p.role],
      );
      // UserAppAccess for quiktrack.
      await c.query(
        `INSERT INTO "quikit"."UserAppAccess" (id, "userId", "orgId", "appId", role, "grantedAt", "grantedBy")
         VALUES ($1, $2, $3, $4, $5, now(), $6)
         ON CONFLICT ("userId", "orgId", "appId") DO UPDATE SET role=EXCLUDED.role`,
        [cuid(), uid, orgId, appId, p.role === "manager" ? "admin" : "member", uid],
      );
    }
    console.log(`  ✓ ${PERSONAS.length} users ready`);

    // Make sure OrgAppAccess(quiktrack) exists.
    await c.query(
      `INSERT INTO "quikit"."OrgAppAccess" (id, "orgId", "appId", enabled, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, true, now(), now())
       ON CONFLICT ("orgId", "appId") DO UPDATE SET enabled=true, "updatedAt"=now()`,
      [cuid(), orgId, appId],
    );

    const allUserIdsInProject = (leadEmail) => {
      // Lead first, then all other personas.
      const lead = userIds[leadEmail];
      const others = PERSONAS.map((p) => userIds[p.email]).filter((id) => id !== lead);
      const set = [lead, ...others];
      if (ashwinId) set.push(ashwinId);
      return set;
    };

    // 4) Seed projects + statuses + issue types + sprints + issues + comments + history + timesheet.
    console.log(`\nSeeding ${PROJECTS.length} projects …`);
    let totalIssues = 0, totalComments = 0, totalHistory = 0, totalTimesheet = 0;
    for (const p of PROJECTS) {
      const projectId = cuid();
      const leadId = userIds[p.leadEmail];
      await c.query(
        `INSERT INTO "app_quiktrack"."QtProject" (id, "orgId", "projectKey", name, description, "projectType", color, status, "leadUserId", "startDate", "createdBy", "createdAt", "updatedAt", "isDeleted")
         VALUES ($1, $2, $3, $4, $5, 'software', $6, 'active', $7, now(), $8, now(), now(), false)`,
        [projectId, orgId, p.key, p.name, p.description, p.color, leadId, leadId],
      );

      // Members (everyone joins every project for richer demo).
      for (const uid of allUserIdsInProject(p.leadEmail)) {
        await c.query(
          `INSERT INTO "app_quiktrack"."QtProjectMember" (id, "projectId", "userId", role, "invitedBy", "joinedAt", "isDeleted", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, now(), false, now(), now())`,
          [cuid(), projectId, uid, uid === leadId ? "PROJECT_ADMIN" : "MEMBER", leadId],
        );
      }

      // Statuses.
      const statusIds = {};
      for (const s of STATUSES) {
        const sid = cuid();
        await c.query(
          `INSERT INTO "app_quiktrack"."QtIssueStatus" (id, "projectId", name, color, category, "orderIndex", "createdAt", "updatedAt", "isDeleted", "isHidden")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now(), false, false)`,
          [sid, projectId, s.name, s.color, s.category, s.orderIndex],
        );
        statusIds[s.name] = sid;
      }

      // Issue types.
      for (const t of ISSUE_TYPES) {
        await c.query(
          `INSERT INTO "app_quiktrack"."QtIssueType" (id, "projectId", name, color, icon, "orderIndex", "createdAt", "updatedAt", "isDeleted")
           VALUES ($1, $2, $3, $4, $5, $6, now(), now(), false)`,
          [cuid(), projectId, t.name, t.color, t.icon, t.orderIndex],
        );
      }

      // Sprints — 2 completed + 1 active + 1 planned.
      const sprintData = [
        { name: `${p.key} Sprint ${randInt(1, 5)}`,                start: daysAgo(56), end: daysAgo(42), startedAt: daysAgo(56), completedAt: daysAgo(42), status: "COMPLETED", goal: "Foundation work + first delivery" },
        { name: `${p.key} Sprint ${randInt(6, 10)}`,               start: daysAgo(42), end: daysAgo(28), startedAt: daysAgo(42), completedAt: daysAgo(28), status: "COMPLETED", goal: "MVP feature set" },
        { name: `${p.key} Sprint ${randInt(11, 14)} (Active)`,     start: daysAgo(14), end: daysFromNow(0),  startedAt: daysAgo(14), completedAt: null,          status: "ACTIVE",    goal: "Polish + launch readiness" },
        { name: `${p.key} Sprint ${randInt(15, 18)} (Planned)`,    start: daysFromNow(1), end: daysFromNow(14), startedAt: null,        completedAt: null,          status: "PLANNED",   goal: "Post-launch improvements" },
      ];
      const sprintIds = [];
      for (const s of sprintData) {
        const sid = cuid();
        await c.query(
          `INSERT INTO "app_quiktrack"."QtSprint" (id, "projectId", name, goal, status, "startDate", "endDate", "startedAt", "completedAt", "createdBy", "createdAt", "updatedAt", "isDeleted")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now(), false)`,
          [sid, projectId, s.name, s.goal, s.status, s.start, s.end, s.startedAt, s.completedAt, leadId],
        );
        sprintIds.push({ id: sid, status: s.status });
      }

      // Default task group ("Ungrouped").
      const groupId = cuid();
      await c.query(
        `INSERT INTO "app_quiktrack"."QtTaskGroup" (id, "orgId", "projectId", name, color, "order", "isDefault", "isCollapsed", "isDeleted", "createdAt", "updatedAt", "createdBy")
         VALUES ($1, $2, $3, 'Ungrouped', '#94a3b8', 0, true, false, false, now(), now(), $4)`,
        [groupId, orgId, projectId, leadId],
      );

      // Issues — 4 epics first, then ~18 stories/tasks/bugs.
      let counter = 0;
      const epicIds = [];
      for (const epicTitle of EPICS[p.key]) {
        counter++;
        const issueId = cuid();
        const sprintId = rand(sprintIds.filter((s) => s.status !== "PLANNED")).id;
        await c.query(
          `INSERT INTO "app_quiktrack"."QtIssue"
            (id, "orgId", "projectId", key, title, description, type, "statusId", priority, "assigneeId", "reporterId", "sprintId", "startDate", "dueDate", "storyPoints", "createdBy", "createdAt", "updatedAt", "isDeleted", "orderInColumn", "groupId", "orderInGroup")
           VALUES ($1, $2, $3, $4, $5, $6, 'EPIC', $7, 'HIGH', $8, $9, $10, $11, $12, 21, $13, $14, now(), false, $15, $16, $17)`,
          [
            issueId, orgId, projectId, `${p.key}-${counter}`, epicTitle,
            `${epicTitle} — multi-sprint epic spanning the entire team. Owner is the lead engineer.`,
            statusIds["In Progress"], leadId, leadId, sprintId,
            daysAgo(20), daysFromNow(28), counter,
            daysAgo(randInt(30, 60)),
            counter * 10, groupId, counter,
          ],
        );
        epicIds.push(issueId);
      }

      // Stories/Tasks/Bugs.
      const projectUsers = allUserIdsInProject(p.leadEmail);
      for (const title of ISSUES[p.key]) {
        counter++;
        const issueId = cuid();
        const typeRoll = Math.random();
        const type = typeRoll < 0.5 ? "STORY" : typeRoll < 0.8 ? "TASK" : "BUG";
        // Status distribution: 40% Done, 15% Review, 15% Progress, 15% To Do, 15% Backlog.
        const statusRoll = Math.random();
        const statusName =
          statusRoll < 0.4 ? "Done" :
          statusRoll < 0.55 ? "In Review" :
          statusRoll < 0.70 ? "In Progress" :
          statusRoll < 0.85 ? "To Do" : "Backlog";
        const status = statusIds[statusName];
        const assignee = rand(projectUsers);
        const reporter = rand(projectUsers);
        const epic = rand(epicIds);
        const sprintPool = statusName === "Done" ? sprintIds.filter((s) => s.status === "COMPLETED")
                          : statusName === "Backlog" ? sprintIds.filter((s) => s.status === "PLANNED")
                          : sprintIds.filter((s) => s.status === "ACTIVE");
        const sprint = sprintPool.length > 0 ? rand(sprintPool) : null;
        const created = daysAgo(randInt(0, 50));
        const due = daysFromNow(randInt(-5, 25));
        await c.query(
          `INSERT INTO "app_quiktrack"."QtIssue"
            (id, "orgId", "projectId", key, title, description, type, "statusId", priority, "assigneeId", "reporterId", "sprintId", "epicId", "startDate", "dueDate", "storyPoints", "createdBy", "createdAt", "updatedAt", "isDeleted", "orderInColumn", "groupId", "orderInGroup")
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, now(), false, $19, $20, $21)`,
          [
            issueId, orgId, projectId, `${p.key}-${counter}`, title,
            `Description for: ${title}.\n\nAcceptance criteria pending review.`,
            type, status, rand(PRIORITIES), assignee, reporter,
            sprint?.id ?? null, epic, created, due,
            rand([1, 2, 3, 5, 8]), reporter, created, counter, groupId, counter,
          ],
        );
        totalIssues++;

        // Comments (1-4 random).
        const commentCount = randInt(1, 4);
        for (let i = 0; i < commentCount; i++) {
          await c.query(
            `INSERT INTO "app_quiktrack"."QtIssueComment" (id, "orgId", "projectId", "issueId", "userId", body, "createdAt", "updatedAt", "isDeleted")
             VALUES ($1, $2, $3, $4, $5, $6, $7, now(), false)`,
            [cuid(), orgId, projectId, issueId, rand(projectUsers), rand(COMMENTS), new Date(created.getTime() + i * 6 * 3600 * 1000)],
          );
          totalComments++;
        }

        // History — status change record.
        await c.query(
          `INSERT INTO "app_quiktrack"."QtIssueHistory" (id, "orgId", "projectId", "issueId", "userId", field, "oldValue", "newValue", "createdAt")
           VALUES ($1, $2, $3, $4, $5, 'status', 'Backlog', $6, $7)`,
          [cuid(), orgId, projectId, issueId, assignee, statusName, new Date(created.getTime() + 24 * 3600 * 1000)],
        );
        totalHistory++;
      }

      console.log(`  ✓ ${p.key} ${p.name}: ${counter} issues`);
    }
    console.log(`  ${totalIssues} issues, ${totalComments} comments, ${totalHistory} history entries`);

    // 5) Timesheet entries — last 4 weeks weekday-only, ~1-2 entries per user per day.
    console.log(`\nSeeding timesheet entries …`);
    const projectsList = await c.query(
      `SELECT id, "projectKey" FROM "app_quiktrack"."QtProject" WHERE "orgId"=$1`, [orgId],
    );
    for (const persona of PERSONAS) {
      const uid = userIds[persona.email];
      // Pick 2-3 projects this user works on regularly.
      const assignedProjects = projectsList.rows.slice(0, randInt(2, 4));
      for (let dayOffset = 0; dayOffset < 20; dayOffset++) {
        const date = daysAgo(dayOffset);
        if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends
        const entriesToday = randInt(1, 2);
        for (let e = 0; e < entriesToday; e++) {
          const proj = rand(assignedProjects);
          const issue = await c.query(
            `SELECT id FROM "app_quiktrack"."QtIssue" WHERE "projectId"=$1 AND "assigneeId"=$2 LIMIT 5`,
            [proj.id, uid],
          );
          const issueId = issue.rows[randInt(0, issue.rows.length - 1)]?.id;
          if (!issueId) continue;
          const hours = randInt(1, 4) + (Math.random() < 0.5 ? 0.5 : 0);
          const taskDate = new Date(date);
          taskDate.setHours(0, 0, 0, 0);
          await c.query(
            `INSERT INTO "app_quiktrack"."QtTimesheetEntry" (id, "orgId", "userId", "projectId", "issueId", "entryDate", hours, description, "createdBy", "createdAt", "updatedAt", "isDeleted")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now(), false)`,
            [cuid(), orgId, uid, proj.id, issueId, taskDate, hours, `Worked on this task`, uid],
          );
          totalTimesheet++;
        }
      }
    }
    console.log(`  ✓ ${totalTimesheet} timesheet entries`);

    // 6) Recreate FKs.
    console.log(`\nRecreating ${fkDefs.length} FK constraints …`);
    for (const fk of fkDefs) {
      try {
        await c.query(
          `ALTER TABLE "app_quiktrack".${ident(fk.table)} ADD CONSTRAINT ${ident(fk.constraint)} ${fk.def}`,
        );
      } catch (err) {
        console.log(`  ⚠ ${fk.table}.${fk.constraint}: ${err.message}`);
      }
    }
    console.log(`  ✓ FKs restored`);

    await c.query("COMMIT");
    console.log(`\n✅ Seed complete.\n`);
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }

  // Print credentials.
  console.log(`==========================================`);
  console.log(`LOGIN URL: https://quikit-auth-ten.vercel.app/login`);
  console.log(`PASSWORD (all demo users): ${PASSWORD}`);
  console.log(`==========================================`);
  console.log(`Org: Moreyeahs`);
  console.log(`\nUsers:`);
  for (const p of PERSONAS) {
    console.log(`  ${p.email.padEnd(42)} ${p.firstName} ${p.lastName}  (${p.title})`);
  }
  console.log(`\nAdmin (existing): ashwin@moreyeahs.com`);
  console.log(`==========================================`);
}

main().catch((e) => { console.error("\n❌ Seed failed:", e.message); if (e.detail) console.error(" detail:", e.detail); process.exit(1); });
