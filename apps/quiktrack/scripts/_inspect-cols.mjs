import pg from "pg"; const { Client } = pg;
const c = new Client({ connectionString: process.env.NEON_URL });
await c.connect();
const targets = [
  ["quikit", "UserAppAccess"],
  ["quikit", "OrgMember"],
  ["quikit", "OrgAppAccess"],
  ["app_quiktrack", "QtTaskGroup"],
  ["app_quiktrack", "QtProjectMember"],
  ["app_quiktrack", "QtTimesheetEntry"],
  ["app_quiktrack", "QtIssue"],
];
for (const [s, t] of targets) {
  const r = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`, [s, t]);
  console.log(`${s}.${t}: ${r.rows.map(x => x.column_name).join(", ")}`);
}
await c.end();
