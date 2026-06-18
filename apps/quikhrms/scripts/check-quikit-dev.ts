import { PrismaClient } from "@quikit/database";
import pg from "pg";

const url = "postgresql://postgres:sa@123@localhost:5433/quikit_dev";
const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient();

(async () => {
  const schemas = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
    `SELECT schema_name FROM information_schema.schemata ORDER BY schema_name`,
  );
  console.log("Schemas in quikit_dev:", schemas.map((s) => s.schema_name));

  const publicTables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`,
  );
  console.log(`\npublic schema (${publicTables.length} tables):`);
  console.log(publicTables.map((t) => t.table_name));

  // Check if app_quikhrms schema exists
  const hrmsSchemaExists = schemas.some((s) => s.schema_name === "app_quikhrms");
  console.log(`\napp_quikhrms schema exists: ${hrmsSchemaExists}`);

  await prisma.$disconnect();
  await pool.end();
})();
