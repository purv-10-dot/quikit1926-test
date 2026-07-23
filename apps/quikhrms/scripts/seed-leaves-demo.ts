/**
 * Dummy data for the entire Leaves module:
 *   • Policies            → LeaveType rows (CL/SL/EL/ML/CO)
 *   • Policy Documents     → LeavePolicy rows (Active / PendingReview / Draft)
 *   • Leave & Holiday Cal. → CompanyHoliday rows for the current year
 *   • My Leaves            → LeaveRequest rows for the signed-in demo user
 *   • Team Leaves          → LeaveRequest rows for that user's reports
 *   • Leave balances for everyone above
 *
 * Idempotent: leave types/holidays are upserted, balances upserted, and demo
 * leave requests + demo policy docs are wiped for the target set before reinsert.
 *
 * Run:  npm run seed:leaves      (add the script to package.json)
 *   or  tsx --env-file=.env.local scripts/seed-leaves-demo.ts
 */

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

// The demo "current user" — matches the person who logs in during dev so their
// "My Leaves" page is populated. Falls back to the first active employee.
const ME_EMAIL = "gourav.chandel";

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;

async function main() {
  // ── Resolve org + demo people ──────────────────────────────────────────
  const me =
    (await prisma.employee.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { workEmail: { contains: ME_EMAIL, mode: "insensitive" } },
          { personalEmail: { contains: ME_EMAIL, mode: "insensitive" } },
        ],
      },
      select: { id: true, orgId: true, firstName: true },
    })) ??
    (await prisma.employee.findFirst({
      where: { deletedAt: null, status: "Active" },
      orderBy: { employeeCode: "asc" },
      select: { id: true, orgId: true, firstName: true },
    }));

  if (!me) throw new Error("No employees found — seed employees first.");
  const orgId = me.orgId;
  console.log(`Org ${orgId} · "me" = ${me.firstName} (${me.id})`);

  const reports = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, status: "Active", id: { not: me.id } },
    take: 4,
    orderBy: { employeeCode: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
  console.log(`Reports for team leaves: ${reports.length}`);

  // ── 1. Leave types (Policies page) ─────────────────────────────────────
  const LEAVE_TYPES = [
    { code: "CL", name: "Casual Leave", color: "#3b82f6", accrualCount: 12, maxBalance: 12, accrualType: "Yearly" as const },
    { code: "SL", name: "Sick Leave", color: "#ef4444", accrualCount: 8, maxBalance: 8, accrualType: "Yearly" as const },
    { code: "EL", name: "Earned Leave", color: "#22c55e", accrualCount: 18, maxBalance: 45, accrualType: "Monthly" as const, isCarryForward: true, maxCarryForward: 30, isEncashable: true },
    { code: "ML", name: "Maternity Leave", color: "#a855f7", accrualCount: 182, maxBalance: 182, accrualType: "Upfront" as const, applicableGender: "Female" },
    { code: "CO", name: "Comp Off", color: "#f59e0b", accrualCount: 0, maxBalance: 12, accrualType: "Monthly" as const, isCompOff: true },
  ];
  const typeByCode = new Map<string, string>();
  for (const t of LEAVE_TYPES) {
    const row = await prisma.leaveType.upsert({
      where: { orgId_code: { orgId, code: t.code } },
      update: {
        name: t.name, color: t.color, accrualCount: t.accrualCount, maxBalance: t.maxBalance,
        accrualType: t.accrualType, updatedBy: me.id,
        ...(t.isCarryForward ? { isCarryForward: true, maxCarryForward: t.maxCarryForward } : {}),
        ...(t.isEncashable ? { isEncashable: true } : {}),
        ...(t.applicableGender ? { applicableGender: t.applicableGender } : {}),
        ...(t.isCompOff ? { isCompOff: true } : {}),
      },
      create: {
        orgId, code: t.code, name: t.name, color: t.color,
        accrualCount: t.accrualCount, maxBalance: t.maxBalance, accrualType: t.accrualType,
        isCarryForward: !!t.isCarryForward, maxCarryForward: t.maxCarryForward ?? null,
        isEncashable: !!t.isEncashable, applicableGender: t.applicableGender ?? null,
        isCompOff: !!t.isCompOff, createdBy: me.id, updatedBy: me.id,
      },
      select: { id: true, code: true },
    });
    typeByCode.set(row.code, row.id);
  }
  console.log(`Leave types ready: ${[...typeByCode.keys()].join(", ")}`);

  // ── 2. Company holidays (Calendar page) ─────────────────────────────────
  const year = new Date().getFullYear();
  const HOLIDAYS: { name: string; md: [number, number]; type: "National" | "Regional" | "Company" | "Optional"; optional?: boolean }[] = [
    { name: "New Year's Day", md: [0, 1], type: "National" },
    { name: "Republic Day", md: [0, 26], type: "National" },
    { name: "Holi", md: [2, 14], type: "Regional" },
    { name: "Good Friday", md: [3, 18], type: "Optional", optional: true },
    { name: "Independence Day", md: [7, 15], type: "National" },
    { name: "Gandhi Jayanti", md: [9, 2], type: "National" },
    { name: "Dussehra", md: [9, 22], type: "Regional" },
    { name: "Diwali", md: [10, 1], type: "National" },
    { name: "Founders' Day", md: [10, 20], type: "Company" },
    { name: "Christmas", md: [11, 25], type: "National" },
  ];
  let holidaysCreated = 0;
  for (const h of HOLIDAYS) {
    const date = new Date(Date.UTC(year, h.md[0], h.md[1]));
    const exists = await prisma.companyHoliday.findFirst({ where: { orgId, date, name: h.name }, select: { id: true } });
    if (exists) continue;
    await prisma.companyHoliday.create({
      data: { orgId, name: h.name, date, year, type: h.type, isOptional: !!h.optional, createdBy: me.id, updatedBy: me.id },
    });
    holidaysCreated++;
  }
  console.log(`Holidays created: ${holidaysCreated} (year ${year})`);

  // ── 3. Leave requests (My Leaves + Team Leaves) ─────────────────────────
  const CL = typeByCode.get("CL")!;
  const SL = typeByCode.get("SL")!;
  const EL = typeByCode.get("EL")!;
  const today = new Date();

  const people = [{ id: me.id, firstName: me.firstName, lastName: "" }, ...reports];

  // Wipe prior demo requests for the target set (idempotent reseed).
  const targetIds = people.map((p) => p.id);
  await prisma.leaveApproval.deleteMany({ where: { orgId, leaveRequest: { employeeId: { in: targetIds } } } });
  await prisma.leaveRequest.deleteMany({ where: { orgId, employeeId: { in: targetIds } } });

  type Plan = { empId: string; typeId: string; start: Date; end: Date; reason: string; status: "Pending" | "Approved" | "Rejected" | "Cancelled" };
  const plans: Plan[] = [
    // "Me" — populates My Leaves across statuses
    { empId: me.id, typeId: CL, start: addDays(today, 5), end: addDays(today, 6), reason: "Family function", status: "Pending" },
    { empId: me.id, typeId: EL, start: addDays(today, -30), end: addDays(today, -26), reason: "Vacation", status: "Approved" },
    { empId: me.id, typeId: SL, start: addDays(today, -12), end: addDays(today, -12), reason: "Migraine", status: "Approved" },
    { empId: me.id, typeId: CL, start: addDays(today, -3), end: addDays(today, -3), reason: "Personal errand", status: "Rejected" },
  ];
  // Reports — populate Team Leaves
  const reasons = ["Cousin's wedding", "Fever + flu", "Family trip to Goa", "Bank work", "House shifting"];
  reports.forEach((r, i) => {
    plans.push({ empId: r.id, typeId: [CL, SL, EL][i % 3], start: addDays(today, 2 + i), end: addDays(today, 3 + i), reason: reasons[i % reasons.length], status: "Pending" });
    plans.push({ empId: r.id, typeId: [EL, CL, SL][i % 3], start: addDays(today, -20 - i), end: addDays(today, -18 - i), reason: "Personal", status: "Approved" });
  });

  for (const p of plans) {
    await prisma.leaveRequest.create({
      data: {
        orgId, employeeId: p.empId, leaveTypeId: p.typeId,
        startDate: p.start, endDate: p.end, duration: daysBetween(p.start, p.end),
        reason: p.reason, status: p.status, isPlanned: true,
        createdBy: p.empId, updatedBy: p.empId,
        approvals: {
          create: {
            orgId, approverId: me.id, level: 1,
            status: p.status === "Pending" ? "Pending" : p.status === "Approved" ? "Approved" : "Rejected",
            comment: p.status === "Rejected" ? "Please plan ahead" : p.status === "Approved" ? "Approved" : null,
            actionAt: p.status === "Pending" ? null : new Date(),
          },
        },
      },
    });
  }
  console.log(`Leave requests created: ${plans.length}`);

  // ── 4. Leave balances (for My Leaves / Team Leaves balance cards) ────────
  let balances = 0;
  for (const p of people) {
    for (const [code, id] of typeByCode) {
      if (code === "ML" || code === "CO") continue; // skip special types
      const accrued = code === "CL" ? 12 : code === "SL" ? 8 : 18;
      await prisma.leaveBalance.upsert({
        where: { orgId_employeeId_leaveTypeId_year: { orgId, employeeId: p.id, leaveTypeId: id, year } },
        update: { accrued, updatedBy: me.id },
        create: { orgId, employeeId: p.id, leaveTypeId: id, year, opening: 0, accrued, taken: 2, updatedBy: me.id, createdBy: me.id },
      });
      balances++;
    }
  }
  console.log(`Leave balances upserted: ${balances}`);

  // ── 5. Leave policy documents (Policy Documents page) ───────────────────
  await prisma.leavePolicy.deleteMany({ where: { orgId, name: { startsWith: "[Demo]" } } });
  const POLICIES = [
    { name: "[Demo] Leave Policy FY " + year, status: "Active" as const, file: "leave-policy.pdf", desc: "Company-wide leave policy — casual, sick and earned leave rules.", from: new Date(Date.UTC(year, 0, 1)) },
    { name: "[Demo] Work-From-Home Policy", status: "PendingReview" as const, file: "wfh-policy.pdf", desc: "Remote-work eligibility and approval workflow.", from: null },
    { name: "[Demo] Sabbatical Policy (Draft)", status: "Draft" as const, file: "sabbatical-policy.docx", desc: "Long-tenure sabbatical guidelines — under review.", from: null },
  ];
  for (const pol of POLICIES) {
    await prisma.leavePolicy.create({
      data: {
        orgId, name: pol.name, status: pol.status, description: pol.desc,
        sourceFileName: pol.file, sourceFileType: pol.file.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        effectiveFrom: pol.from,
        ...(pol.status === "Active" ? { approvedBy: me.id, approvedAt: new Date(), approvedRules: { casual: 12, sick: 8, earned: 18 } } : {}),
        createdBy: me.id, updatedBy: me.id,
      },
    });
  }
  console.log(`Leave policy documents created: ${POLICIES.length}`);

  console.log("\n✅ Leaves module demo data seeded.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
