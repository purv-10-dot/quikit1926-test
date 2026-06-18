import { config } from "dotenv";
config();

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const TENANT = "tenant_dev_001";
const ADMIN = "user_dev_001";

async function main() {
  const admin = await prisma.employee.findFirst({
    where: { orgId: TENANT, OR: [{ id: ADMIN }, { employeeCode: "QK-EMP-0001" }] },
    select: { id: true, firstName: true },
  });
  if (!admin) throw new Error("Admin employee not found");

  // Pick 3 active non-admin employees as reports
  const reports = await prisma.employee.findMany({
    where: {
      orgId: TENANT,
      status: "Active",
      deletedAt: null,
      id: { not: admin.id },
    },
    take: 3,
    orderBy: { employeeCode: "asc" },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
  });
  if (reports.length === 0) throw new Error("No employees to use as reports");

  // Assign reportingManagerId = admin
  await prisma.employee.updateMany({
    where: { id: { in: reports.map((r) => r.id) } },
    data: { reportingManagerId: admin.id, updatedBy: ADMIN },
  });
  console.log(`Assigned ${reports.length} reports to ${admin.firstName}`);

  // Get leave types
  const types = await prisma.leaveType.findMany({
    where: { orgId: TENANT, deletedAt: null },
  });
  const cl = types.find((t) => t.code === "CL");
  const sl = types.find((t) => t.code === "SL");
  const el = types.find((t) => t.code === "EL");
  if (!cl || !sl || !el) throw new Error("Leave types CL/SL/EL missing");

  // Clear prior demo requests from these employees (idempotent reseed)
  await prisma.leaveApproval.deleteMany({
    where: { orgId: TENANT, leaveRequest: { employeeId: { in: reports.map((r) => r.id) } } },
  });
  await prisma.leaveRequest.deleteMany({
    where: { orgId: TENANT, employeeId: { in: reports.map((r) => r.id) } },
  });

  const today = new Date();
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const plan = [
    // Pending
    { emp: reports[0], type: cl, start: addDays(today, 3), end: addDays(today, 4), reason: "Cousin's wedding", status: "Pending" },
    { emp: reports[1], type: sl, start: addDays(today, 1), end: addDays(today, 1), reason: "Fever + flu", status: "Pending" },
    { emp: reports[2] ?? reports[0], type: el, start: addDays(today, 10), end: addDays(today, 14), reason: "Family vacation to Goa", status: "Pending" },
    // Approved history
    { emp: reports[0], type: el, start: addDays(today, -20), end: addDays(today, -18), reason: "Personal trip", status: "Approved" },
    { emp: reports[1], type: cl, start: addDays(today, -10), end: addDays(today, -10), reason: "Bank work", status: "Approved" },
    // Rejected history
    { emp: reports[2] ?? reports[0], type: cl, start: addDays(today, -5), end: addDays(today, -5), reason: "Shopping", status: "Rejected" },
  ];

  for (const p of plan) {
    const duration = Math.round((p.end.getTime() - p.start.getTime()) / 86400000) + 1;
    await prisma.leaveRequest.create({
      data: {
        orgId: TENANT,
        employeeId: p.emp.id,
        leaveTypeId: p.type.id,
        startDate: p.start,
        endDate: p.end,
        duration,
        reason: p.reason,
        status: p.status as never,
        isPlanned: true,
        createdBy: p.emp.id,
        updatedBy: p.emp.id,
        approvals: {
          create: {
            orgId: TENANT,
            approverId: admin.id,
            level: 1,
            status: p.status === "Pending" ? "Pending" : p.status === "Approved" ? "Approved" : "Rejected",
            comment: p.status === "Rejected" ? "Not a valid reason" : p.status === "Approved" ? "Approved" : null,
            actionAt: p.status === "Pending" ? null : new Date(),
          },
        },
      },
    });
    console.log(`  ${p.emp.firstName} → ${p.type.code} ${p.status}`);
  }

  console.log("Team leaves seed complete.");
}

main().finally(() => prisma.$disconnect());
