import pg from "pg"; const { Client } = pg;
const c = new Client({ connectionString: process.env.NEON_URL });
await c.connect();
for (const t of ["AppRole", "RolePermission", "RoleNavigation", "UserAppRole"]) {
  const r = await c.query(`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_schema='app_quiktrack' AND table_name=$1 ORDER BY ordinal_position`, [t]);
  console.log(`${t}: ${r.rows.map(x => `${x.column_name}${x.is_nullable==='NO'?'!':''}`).join(", ")}`);
}
await c.end();
