import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const APP_ID = "quikhrms";

(async () => {
  const orgId = "tenant_dev_001";
  const emps = await prisma.employee.findMany({
    where: { orgId, deletedAt: null },
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true,
      reportingManagerId: true,
      appRoles: {
        where: { orgId: orgId, role: { appId: APP_ID } },
        select: { role: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log("Employees:", emps.length);
  emps.forEach((e, i) => {
    const roleName = e.appRoles[0]?.role.name ?? "-";
    console.log(i + 1, e.employeeCode, e.firstName, e.lastName, roleName, "| mgr:", e.reportingManagerId ?? "none");
  });

  const hist = await prisma.employmentHistory.groupBy({
    by: ["employeeId"],
    where: { orgId },
    _count: true,
  });
  console.log("\nHistory per employee:");
  for (const h of hist) {
    const emp = emps.find((e) => e.id === h.employeeId);
    console.log(" ", emp?.firstName, emp?.lastName, "=>", h._count, "rows");
  }
  await prisma.$disconnect();
  await pool.end();
})();
