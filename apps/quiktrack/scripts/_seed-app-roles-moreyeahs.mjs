/**
 * Seed admin + Member app roles for the Moreyeahs org so /api/me/permissions
 * has roles to return on first login. Pure SQL — does not import @/lib.
 */
import pg from "pg";
import crypto from "node:crypto";
const { Client } = pg;
const cuid = () => "cm" + crypto.randomBytes(12).toString("hex");

const c = new Client({ connectionString: process.env.NEON_URL });
await c.connect();

const org = await c.query(`SELECT id FROM "quikit"."Org" WHERE slug='moreyeahs'`);
const app = await c.query(`SELECT id FROM "quikit"."App" WHERE slug='quiktrack'`);
const orgId = org.rows[0].id;
const appId = app.rows[0].id;

// Idempotent — clear any existing app roles for this org+app first.
await c.query(`DELETE FROM "app_quiktrack"."AppRole" WHERE "orgId"=$1 AND "appId"=$2`, [orgId, appId]);

const adminId = cuid();
await c.query(
  `INSERT INTO "app_quiktrack"."AppRole" (id, "orgId", "appId", name, description, "isSystem", "isDefault", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, 'admin', 'Full access — auto-seeded.', true, false, now(), now())`,
  [adminId, orgId, appId],
);
const memberId = cuid();
await c.query(
  `INSERT INTO "app_quiktrack"."AppRole" (id, "orgId", "appId", name, description, "isSystem", "isDefault", "createdAt", "updatedAt")
   VALUES ($1, $2, $3, 'Member', 'Default team-member role.', false, true, now(), now())`,
  [memberId, orgId, appId],
);

// Grant all (resource, action) pairs to admin. We bulk-insert with a static list
// covering the resources defined in lib/api/permissionsRegistry.ts.
const RESOURCES = [
  "Project", "ProjectMember", "Board", "ProjectSummary", "ProjectTimeline",
  "ProjectBacklog", "ProjectList", "ProjectTaskTable", "Doc", "Report",
  "Sprint", "Issue", "IssueComment", "Timesheet", "Notification",
  "Filter", "Team", "Dashboard", "User", "Role", "Settings",
];
const ACTIONS = ["view", "create", "update", "delete"];

for (const r of RESOURCES) {
  for (const a of ACTIONS) {
    await c.query(
      `INSERT INTO "app_quiktrack"."RolePermission" (id, "roleId", resource, action)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [cuid(), adminId, r, a],
    );
  }
}

// Member: view everywhere + update on Issue/Comment/Timesheet/Sprint.
for (const r of RESOURCES) {
  await c.query(
    `INSERT INTO "app_quiktrack"."RolePermission" (id, "roleId", resource, action)
     VALUES ($1, $2, $3, 'view') ON CONFLICT DO NOTHING`,
    [cuid(), memberId, r],
  );
}
for (const r of ["Issue", "IssueComment", "Timesheet", "Sprint"]) {
  await c.query(
    `INSERT INTO "app_quiktrack"."RolePermission" (id, "roleId", resource, action)
     VALUES ($1, $2, $3, 'update') ON CONFLICT DO NOTHING`,
    [cuid(), memberId, r],
  );
}

// Nav.
const NAV_KEYS = ["home", "dashboards", "plans", "spaces", "timesheet", "reports", "settings"];
for (const roleId of [adminId, memberId]) {
  for (const nav of NAV_KEYS) {
    await c.query(
      `INSERT INTO "app_quiktrack"."RoleNavigation" (id, "roleId", "navKey")
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [cuid(), roleId, nav],
    );
  }
}

// Assign every user a role: managers + ashwin → admin, employees → Member.
const users = await c.query(
  `SELECT u.id, u.email, m.role AS org_role
   FROM "auth"."User" u
   JOIN "quikit"."OrgMember" m ON m."userId"=u.id
   WHERE m."orgId"=$1 AND m.status='active'`,
  [orgId],
);
for (const u of users.rows) {
  const isAdmin = u.org_role === "manager" || u.org_role === "super_admin" || u.email === "ashwin@moreyeahs.com";
  await c.query(
    `INSERT INTO "app_quiktrack"."UserAppRole" (id, "userId", "orgId", "roleId", "assignedAt")
     VALUES ($1, $2, $3, $4, now()) ON CONFLICT DO NOTHING`,
    [cuid(), u.id, orgId, isAdmin ? adminId : memberId],
  );
}

console.log(`✓ admin role: ${adminId}`);
console.log(`✓ Member role: ${memberId}`);
console.log(`✓ ${RESOURCES.length * ACTIONS.length} admin perms + ${RESOURCES.length + 4} member perms`);
console.log(`✓ ${users.rows.length} users assigned roles`);

await c.end();
