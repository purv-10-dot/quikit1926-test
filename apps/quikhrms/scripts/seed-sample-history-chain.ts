import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";
const APP_ID = "quikhrms";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

type HistoryData = Parameters<typeof prisma.employmentHistory.create>[0]["data"];

async function seed() {
  console.log("🌱 Seeding sample employment history + reporting chain...");

  const rawEmployees = await prisma.employee.findMany({
    where: { orgId: TENANT, deletedAt: null },
    select: {
      id: true, employeeCode: true, firstName: true, lastName: true,
      reportingManagerId: true, jobTitle: true,
      appRoles: {
        where: { orgId: TENANT, role: { appId: APP_ID } },
        select: { role: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });
  if (rawEmployees.length === 0) {
    console.log("❌ No employees found. Run `npm run seed` first.");
    process.exit(1);
  }

  // RBAC v2: flatten primary role for downstream filters.
  const employees = rawEmployees.map((e) => ({
    id: e.id,
    employeeCode: e.employeeCode,
    firstName: e.firstName,
    lastName: e.lastName,
    reportingManagerId: e.reportingManagerId,
    jobTitle: e.jobTitle,
    role: e.appRoles[0]?.role ? { code: e.appRoles[0].role.name } : null,
  }));
  console.log(`  Found ${employees.length} employees`);

  const byId = new Map(employees.map((e) => [e.id, e]));
  const byRole = (code: string) => employees.filter((e) => e.role?.code === code);

  // ─── Reporting Chain (deeper) ────────────────────────
  // Layers:
  //   L0: super_admin              (CEO)
  //   L1: hr_admin                 (VP People)
  //   L2: managers / hr_manager / finance_admin   (Directors / Dept Heads)
  //   L3: it_admin / recruiter      (Team Leads)
  //   L4: employees                 (ICs)

  const l0 = byRole("super_admin")[0];
  const l1 = byRole("hr_admin").find((e) => e.id !== l0?.id);
  const l2Candidates = [
    ...byRole("manager"),
    ...byRole("hr_manager"),
    ...byRole("finance_admin"),
  ].filter((e) => e.id !== l0?.id && e.id !== l1?.id);
  const l3Candidates = [
    ...byRole("it_admin"),
    ...byRole("recruiter"),
  ].filter((e) => e.id !== l0?.id && e.id !== l1?.id);
  const l4Candidates = byRole("employee").filter(
    (e) => e.id !== l0?.id && e.id !== l1?.id &&
           !l2Candidates.some((x) => x.id === e.id) &&
           !l3Candidates.some((x) => x.id === e.id)
  );

  console.log(`  Chain layers — L0: 1, L1: ${l1 ? 1 : 0}, L2: ${l2Candidates.length}, L3: ${l3Candidates.length}, L4: ${l4Candidates.length}`);

  let updated = 0;

  if (l0) {
    await prisma.employee.update({ where: { id: l0.id }, data: { reportingManagerId: null } });
  }
  if (l1 && l0) {
    await prisma.employee.update({ where: { id: l1.id }, data: { reportingManagerId: l0.id } });
    updated++;
  }
  const l1Anchor = l1 ?? l0!;
  for (const mgr of l2Candidates) {
    await prisma.employee.update({ where: { id: mgr.id }, data: { reportingManagerId: l1Anchor.id } });
    updated++;
  }
  // L3 under a manager (round-robin from l2)
  const l2ForL3 = l2Candidates.length > 0 ? l2Candidates : [l1Anchor];
  for (let i = 0; i < l3Candidates.length; i++) {
    const mgr = l2ForL3[i % l2ForL3.length];
    await prisma.employee.update({ where: { id: l3Candidates[i].id }, data: { reportingManagerId: mgr.id } });
    updated++;
  }
  // L4 spread under L2 + L3
  const l4ManagerPool = [...l2Candidates, ...l3Candidates];
  const finalPool = l4ManagerPool.length > 0 ? l4ManagerPool : [l1Anchor];
  for (let i = 0; i < l4Candidates.length; i++) {
    const mgr = finalPool[i % finalPool.length];
    if (mgr.id === l4Candidates[i].id) continue;
    await prisma.employee.update({ where: { id: l4Candidates[i].id }, data: { reportingManagerId: mgr.id } });
    updated++;
  }
  console.log(`  Reporting chain: updated ${updated} employees (5 layers)`);

  // ─── Employment History (all employees) ───────────────
  await prisma.employmentHistory.deleteMany({
    where: { orgId: TENANT, notes: { startsWith: "[sample]" } },
  });

  const rows: HistoryData[] = [];

  for (const emp of employees) {
    const titleNow = emp.jobTitle ?? "Software Engineer";
    const isJunior = emp.role?.code === "employee";
    const isMgr = ["manager", "hr_manager", "hr_admin", "finance_admin", "it_admin"].includes(emp.role?.code ?? "");

    // 1. Joining → Probation → Confirmation
    rows.push({
      orgId: TENANT,
      employeeId: emp.id,
      changeType: "ConfirmationChange",
      fromValue: { status: "Probation", probationMonths: 6 },
      toValue: { status: "Confirmed", confirmationDate: daysAgo(720).toISOString().slice(0, 10) },
      effectiveDate: daysAgo(720),
      reason: "6-month probation completed — confirmed as full-time employee",
      notes: "[sample] Letter of confirmation issued",
      createdBy: "user_dev_001",
    });

    // 2. Initial role clarification
    rows.push({
      orgId: TENANT,
      employeeId: emp.id,
      changeType: "RoleChange",
      fromValue: { designation: isJunior ? "Trainee" : "Associate" },
      toValue: { designation: titleNow, grade: isJunior ? "L1" : "L2" },
      effectiveDate: daysAgo(660),
      reason: "Role aligned to responsibilities post-confirmation",
      notes: "[sample] Post-confirmation designation update",
      createdBy: "user_dev_001",
    });

    // 3. First annual hike
    rows.push({
      orgId: TENANT,
      employeeId: emp.id,
      changeType: "SalaryChange",
      fromValue: { ctc: 700000, currency: "INR" },
      toValue: { ctc: 820000, currency: "INR", hikePercent: 17.14 },
      effectiveDate: daysAgo(540),
      reason: "Annual appraisal FY2023-24",
      notes: "[sample] Performance rating: Meets Expectations+",
      createdBy: "user_dev_001",
    });

    // 4. Department change (spun-off team)
    if (["manager", "employee", "it_admin"].includes(emp.role?.code ?? "")) {
      rows.push({
        orgId: TENANT,
        employeeId: emp.id,
        changeType: "DepartmentChange",
        fromValue: { department: "Engineering" },
        toValue: { department: "Platform Engineering", teamLead: "Rahul Verma" },
        effectiveDate: daysAgo(420),
        reason: "New vertical — Platform spin-off from core Engineering",
        notes: "[sample] Internal transfer without change in designation",
        createdBy: "user_dev_001",
      });
    }

    // 5. Promotion
    rows.push({
      orgId: TENANT,
      employeeId: emp.id,
      changeType: "Promotion",
      fromValue: { designation: titleNow, grade: isJunior ? "L1" : "L2" },
      toValue: { designation: isJunior ? `Senior ${titleNow}` : isMgr ? titleNow : `Senior ${titleNow}`, grade: isJunior ? "L2" : "L3" },
      effectiveDate: daysAgo(300),
      reason: "Promoted for consistent high impact and team mentorship",
      letterUrl: "https://example.com/letters/promotion.pdf",
      notes: "[sample] Promotion letter + ESOP vesting accelerated",
      createdBy: "user_dev_001",
    });

    // 6. Salary hike after promotion
    rows.push({
      orgId: TENANT,
      employeeId: emp.id,
      changeType: "SalaryChange",
      fromValue: { ctc: 820000 },
      toValue: { ctc: isMgr ? 1450000 : 1100000, hikePercent: isMgr ? 76.83 : 34.15 },
      effectiveDate: daysAgo(298),
      reason: "Salary revision post-promotion",
      notes: "[sample] Aligned to new grade band",
      createdBy: "user_dev_001",
    });

    // 7. Manager change (for those who now have a manager)
    if (emp.reportingManagerId) {
      const mgr = byId.get(emp.reportingManagerId);
      rows.push({
        orgId: TENANT,
        employeeId: emp.id,
        changeType: "ManagerChange",
        fromValue: { managerName: "Previous Manager" },
        toValue: { managerId: emp.reportingManagerId, managerName: mgr ? `${mgr.firstName} ${mgr.lastName}` : "New Manager" },
        effectiveDate: daysAgo(180),
        reason: "Team restructuring under new org design",
        notes: "[sample] 1:1 handover completed",
        createdBy: "user_dev_001",
      });
    }

    // 8. Role change for managers (additional responsibilities)
    if (isMgr) {
      rows.push({
        orgId: TENANT,
        employeeId: emp.id,
        changeType: "RoleChange",
        fromValue: { scope: "Single team lead" },
        toValue: { scope: "Multi-team leadership", reportsOwned: 6 },
        effectiveDate: daysAgo(90),
        reason: "Expanded span — added one more direct report team",
        notes: "[sample] Added responsibility — no title change",
        createdBy: "user_dev_001",
      });
    }

    // 9. Most-recent hike
    rows.push({
      orgId: TENANT,
      employeeId: emp.id,
      changeType: "SalaryChange",
      fromValue: { ctc: isMgr ? 1450000 : 1100000 },
      toValue: { ctc: isMgr ? 1850000 : 1380000, hikePercent: isMgr ? 27.59 : 25.45 },
      effectiveDate: daysAgo(45),
      reason: "Annual appraisal FY2025-26 — top performer",
      notes: "[sample] Performance rating: Exceeds Expectations",
      createdBy: "user_dev_001",
    });

    // 10. Status toggle sample (for some)
    if (emp.role?.code === "employee") {
      rows.push({
        orgId: TENANT,
        employeeId: emp.id,
        changeType: "EmpStatusChange",
        fromValue: { status: "Active" },
        toValue: { status: "Active", spotBonus: 25000, citation: "Hackathon winner" },
        effectiveDate: daysAgo(20),
        reason: "Internal hackathon winner — spot bonus awarded",
        notes: "[sample] Bonus credited with payroll",
        createdBy: "user_dev_001",
      });
    }
  }

  for (const row of rows) {
    await prisma.employmentHistory.create({ data: row });
  }
  console.log(`  Employment history: inserted ${rows.length} records across ${employees.length} employees`);

  console.log("✅ Sample data seeded.");
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
