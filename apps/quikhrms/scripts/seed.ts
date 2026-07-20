import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
// Target org/admin are overridable so the same seed can populate a real SSO org
// (pass SEED_ORG_ID / SEED_ADMIN_ID) instead of the throwaway dev tenant.
const TENANT = process.env.SEED_ORG_ID || "tenant_dev_001";
const ADMIN = process.env.SEED_ADMIN_ID || "user_dev_001";
const APP_ID = "quikhrms";

function splitCode(code: string): { resource: string; action: string } {
  const lastDot = code.lastIndexOf(".");
  if (lastDot < 0) return { resource: code, action: "*" };
  return { resource: code.slice(0, lastDot), action: code.slice(lastDot + 1) };
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysAhead(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function seed() {
  console.log("🌱 Seeding...");

  // ── RBAC v2: AppRole + RolePermission (resource+action) ──
  console.log("  RBAC v2 roles...");
  for (const r of DEFAULT_ROLES) {
    const isSystem = r.code === "super_admin";
    const isDefault = r.code === "employee";
    const role = await prisma.hrmsAppRole.upsert({
      where: { orgId_appId_name: { orgId: TENANT, appId: APP_ID, name: r.code } },
      create: {
        orgId: TENANT,
        appId: APP_ID,
        name: r.code,
        description: r.description,
        isSystem,
        isDefault,
        createdBy: ADMIN,
      },
      update: {
        description: r.description,
        isSystem,
        isDefault,
      },
    });

    const targetCodes = r.permissions === "*" ? PERMISSIONS.map((p) => p.code) : r.permissions;
    const existingCount = await prisma.hrmsRolePermission.count({ where: { roleId: role.id } });
    if (existingCount === 0 && targetCodes.length > 0) {
      const pairs = targetCodes.map(splitCode);
      await prisma.hrmsRolePermission.createMany({
        data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
    }
  }
  const roleRows = await prisma.hrmsAppRole.findMany({
    where: { orgId: TENANT, appId: APP_ID },
    select: { id: true, name: true },
  });
  const roleIdByCode = Object.fromEntries(roleRows.map((r) => [r.name, r.id] as const));
  console.log(`    Roles: ${roleRows.length}`);

  // ── DEDUPE: drop duplicate designations/locations/grades/teams/templates ──
  console.log("  Cleaning duplicates...");
  await dedupe("designation", ["orgId", "title"]);
  await dedupe("officeLocation", ["orgId", "name"]);
  await dedupe("grade", ["orgId", "name"]);
  await dedupe("team", ["orgId", "name", "departmentId"]);
  await dedupe("onboardingTemplate", ["orgId", "name"]);
  await dedupe("timeProject", ["orgId", "code"]);

  // ── ORG: Departments ────────────────────────────
  const deptData = [
    { code: "ENG", name: "Engineering", description: "Product engineering" },
    { code: "HR", name: "Human Resources", description: "People operations" },
    { code: "SALES", name: "Sales", description: "Revenue team" },
    { code: "MKT", name: "Marketing", description: "Growth + brand" },
    { code: "FIN", name: "Finance", description: "Accounting team" },
    { code: "OPS", name: "Operations", description: "IT + admin" },
  ];
  const departments = await Promise.all(
    deptData.map((d) =>
      prisma.department.upsert({
        where: { orgId_code: { orgId: TENANT, code: d.code } },
        create: { orgId: TENANT, ...d, createdBy: ADMIN, updatedBy: ADMIN },
        update: {},
      }),
    ),
  );
  const deptMap = Object.fromEntries(departments.map((d) => [d.code, d]));
  console.log(`  Departments: ${departments.length}`);

  // ── ORG: Designations ───────────────────────────
  const desigSeed = [
    { title: "Senior Software Engineer", level: 4, dept: "ENG" },
    { title: "Software Engineer", level: 3, dept: "ENG" },
    { title: "Engineering Manager", level: 5, dept: "ENG" },
    { title: "HR Business Partner", level: 4, dept: "HR" },
    { title: "HR Executive", level: 2, dept: "HR" },
    { title: "Sales Executive", level: 3, dept: "SALES" },
    { title: "Account Manager", level: 4, dept: "SALES" },
    { title: "Marketing Specialist", level: 3, dept: "MKT" },
    { title: "Finance Analyst", level: 3, dept: "FIN" },
    { title: "IT Admin", level: 3, dept: "OPS" },
  ];
  for (const d of desigSeed) {
    const existing = await prisma.designation.findFirst({
      where: { orgId: TENANT, title: d.title, deletedAt: null },
    });
    if (existing) continue;
    await prisma.designation.create({
      data: {
        orgId: TENANT, title: d.title, level: d.level,
        departmentId: deptMap[d.dept].id,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  const desigList = await prisma.designation.findMany({ where: { orgId: TENANT, deletedAt: null } });
  console.log(`  Designations: ${desigList.length}`);

  // ── ORG: Locations ──────────────────────────────
  const locSeed = [
    { name: "Mumbai HQ", city: "Mumbai", state: "Maharashtra", country: "India", isHeadquarter: true, timezone: "Asia/Kolkata" },
    { name: "Bangalore Office", city: "Bangalore", state: "Karnataka", country: "India", timezone: "Asia/Kolkata" },
    { name: "Delhi Branch", city: "Delhi", state: "Delhi", country: "India", timezone: "Asia/Kolkata" },
  ];
  for (const l of locSeed) {
    const existing = await prisma.officeLocation.findFirst({
      where: { orgId: TENANT, name: l.name, deletedAt: null },
    });
    if (existing) continue;
    await prisma.officeLocation.create({
      data: { orgId: TENANT, ...l, createdBy: ADMIN, updatedBy: ADMIN },
    });
  }
  const locList = await prisma.officeLocation.findMany({ where: { orgId: TENANT, deletedAt: null } });
  console.log(`  Locations: ${locList.length}`);

  // ── ORG: Grades ─────────────────────────────────
  const gradeSeed = [
    { name: "Junior", level: 1, minSalary: 400000, maxSalary: 800000 },
    { name: "Mid", level: 3, minSalary: 800000, maxSalary: 1600000 },
    { name: "Senior", level: 5, minSalary: 1600000, maxSalary: 3000000 },
    { name: "Lead", level: 7, minSalary: 3000000, maxSalary: 5000000 },
  ];
  for (const g of gradeSeed) {
    const existing = await prisma.grade.findFirst({ where: { orgId: TENANT, name: g.name, deletedAt: null } });
    if (existing) continue;
    await prisma.grade.create({ data: { orgId: TENANT, ...g, createdBy: ADMIN, updatedBy: ADMIN } });
  }

  // ── ORG: Teams ──────────────────────────────────
  const teamSeed = [
    { name: "Backend Team", departmentId: deptMap.ENG.id },
    { name: "Frontend Team", departmentId: deptMap.ENG.id },
    { name: "Growth Team", departmentId: deptMap.MKT.id },
    { name: "Enterprise Sales", departmentId: deptMap.SALES.id },
  ];
  for (const t of teamSeed) {
    const existing = await prisma.hrmsTeam.findFirst({
      where: { orgId: TENANT, name: t.name, departmentId: t.departmentId, deletedAt: null },
    });
    if (existing) continue;
    await prisma.hrmsTeam.create({ data: { orgId: TENANT, ...t, createdBy: ADMIN, updatedBy: ADMIN } });
  }

  // ── EMPLOYEES ───────────────────────────────────
  const employeeSeed = [
    { code: "QK-EMP-0001", firstName: "Gourav", lastName: "Chandel", email: "gourav@quikit.dev", personalEmail: "gourav1231997@gmail.com", dept: "ENG", desigTitle: "Engineering Manager", status: "Active", phone: "9999999001", roleCode: "super_admin" },
    { code: "QK-EMP-0002", firstName: "Priya", lastName: "Sharma", email: "priya.sharma@quikit.dev", dept: "HR", desigTitle: "HR Business Partner", status: "Active", phone: "9999999002", roleCode: "hr_admin" },
    { code: "QK-EMP-0003", firstName: "Rahul", lastName: "Verma", email: "rahul.verma@quikit.dev", dept: "ENG", desigTitle: "Senior Software Engineer", status: "Active", phone: "9999999003", roleCode: "manager" },
    { code: "QK-EMP-0004", firstName: "Anjali", lastName: "Mehta", email: "anjali.mehta@quikit.dev", dept: "ENG", desigTitle: "Software Engineer", status: "Active", phone: "9999999004", roleCode: "employee" },
    { code: "QK-EMP-0005", firstName: "Vikram", lastName: "Singh", email: "vikram.singh@quikit.dev", dept: "SALES", desigTitle: "Account Manager", status: "Active", phone: "9999999005", roleCode: "manager" },
    { code: "QK-EMP-0006", firstName: "Neha", lastName: "Kapoor", email: "neha.kapoor@quikit.dev", dept: "MKT", desigTitle: "Marketing Specialist", status: "Active", phone: "9999999006", roleCode: "employee" },
    { code: "QK-EMP-0007", firstName: "Arjun", lastName: "Reddy", email: "arjun.reddy@quikit.dev", dept: "FIN", desigTitle: "Finance Analyst", status: "Active", phone: "9999999007", roleCode: "finance_admin" },
    { code: "QK-EMP-0008", firstName: "Sneha", lastName: "Patel", email: "sneha.patel@quikit.dev", dept: "OPS", desigTitle: "IT Admin", status: "Active", phone: "9999999008", roleCode: "it_admin" },
    { code: "QK-EMP-0009", firstName: "Sarah", lastName: "Sanders", email: "sarah.sanders@quikit.dev", dept: "ENG", desigTitle: "Software Engineer", status: "PreBoarding", phone: "9999999009", roleCode: "employee" },
    { code: "QK-EMP-0010", firstName: "Rose", lastName: "Stacy", email: "rose.stacy@quikit.dev", dept: "MKT", desigTitle: "Marketing Specialist", status: "PreBoarding", phone: "9999999010", roleCode: "employee" },
    { code: "QK-EMP-0011", firstName: "Mathew", lastName: "Morales", email: "mathew.morales@quikit.dev", dept: "SALES", desigTitle: "Sales Executive", status: "PreBoarding", phone: "9999999011", roleCode: "recruiter" },
    { code: "QK-EMP-0012", firstName: "Kevin", lastName: "Parker", email: "kevin.parker@quikit.dev", dept: "HR", desigTitle: "HR Executive", status: "OnNotice", phone: "9999999012", roleCode: "hr_manager" },
  ];

  const employees: Array<Awaited<ReturnType<typeof prisma.employee.create>>> = [];
  for (const e of employeeSeed) {
    const desig = desigList.find((d) => d.title === e.desigTitle);
    const idx = employeeSeed.indexOf(e);
    const explicitId = idx === 0 ? ADMIN : undefined;
    const emp = await prisma.employee.upsert({
      where: { orgId_employeeCode: { orgId: TENANT, employeeCode: e.code } },
      create: {
        ...(explicitId && { id: explicitId }),
        orgId: TENANT,
        employeeCode: e.code,
        firstName: e.firstName, lastName: e.lastName,
        workEmail: e.email, personalEmail: e.personalEmail ?? `${e.firstName.toLowerCase()}@personal.com`,
        personalPhone: `+91${e.phone}`,
        departmentId: deptMap[e.dept].id,
        designationId: desig?.id ?? null,
        officeLocationId: locList[0]?.id ?? null,
        jobTitle: e.desigTitle,
        dateOfJoining: daysAgo(e.status === "PreBoarding" ? -14 : 365 + Math.floor(Math.random() * 1000)),
        status: e.status as "Active",
        inviteStatus: e.status === "Active" ? "Active" : "NotInvited",
        panNumber: `ABCDE${String(1000 + idx).padStart(4, "0")}F`,
        aadhaarNumber: `${String(1000 + idx).padStart(4, "0")}12345678`,
        sourceOfHire: "JobPortal",
        employmentType: "FullTime",
        workLocation: "Office",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });

    // RBAC v2: link via UserAppRole (replaces dropped Employee.roleId).
    const roleId = roleIdByCode[e.roleCode];
    if (roleId) {
      await prisma.hrmsUserAppRole.upsert({
        where: {
          userId_orgId_roleId: { userId: emp.id, orgId: TENANT, roleId },
        },
        create: { userId: emp.id, orgId: TENANT, roleId, assignedBy: ADMIN },
        update: {},
      });
    }
    employees.push(emp);
  }
  console.log(`  Employees: ${employees.length}`);

  // Resolve admin employee actual id (supports pre-existing DB w/o explicit id)
  const adminEmployee = employees.find((e) => e.employeeCode === "QK-EMP-0001");
  const adminEmpId = adminEmployee?.id ?? ADMIN;

  const active = employees.filter((e) => e.status === "Active");
  const preBoarding = employees.filter((e) => e.status === "PreBoarding");

  // ── LEAVE TYPES ─────────────────────────────────
  const leaveTypeSeed = [
    { code: "CL", name: "Casual Leave", color: "#3b82f6", maxBalance: 12 },
    { code: "EL", name: "Earned Leave", color: "#10b981", maxBalance: 12 },
    { code: "SL", name: "Sick Leave", color: "#8b5cf6", maxBalance: 12 },
    { code: "LWP", name: "Leave Without Pay", color: "#ef4444", isPaid: false, maxBalance: 0 },
    { code: "PL", name: "Paternity Leave", color: "#ec4899", maxBalance: 15 },
    { code: "SBT", name: "Sabbatical Leave", color: "#f59e0b", maxBalance: 0 },
  ];
  const leaveTypes: Array<Awaited<ReturnType<typeof prisma.leaveType.create>>> = [];
  for (const lt of leaveTypeSeed) {
    const type = await prisma.leaveType.upsert({
      where: { orgId_code: { orgId: TENANT, code: lt.code } },
      create: {
        orgId: TENANT, code: lt.code, name: lt.name, color: lt.color,
        isPaid: lt.isPaid !== false, maxBalance: lt.maxBalance,
        accrualCount: lt.maxBalance, accrualType: "Yearly",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });
    leaveTypes.push(type);
  }
  console.log(`  Leave types: ${leaveTypes.length}`);

  // ── LEAVE BALANCES ──────────────────────────────
  const year = new Date().getFullYear();
  for (const emp of active) {
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: {
          orgId_employeeId_leaveTypeId_year: {
            orgId: TENANT, employeeId: emp.id, leaveTypeId: lt.id, year,
          },
        },
        create: {
          orgId: TENANT, employeeId: emp.id, leaveTypeId: lt.id, year,
          opening: lt.maxBalance, accrued: 0, taken: 0,
          createdBy: ADMIN, updatedBy: ADMIN,
        },
        update: {},
      });
    }
  }

  // ── LEAVE REQUESTS ──────────────────────────────
  const clType = leaveTypes.find((t) => t.code === "CL")!;
  await prisma.leaveRequest.create({
    data: {
      orgId: TENANT, employeeId: active[1].id, leaveTypeId: clType.id,
      startDate: daysAhead(5), endDate: daysAhead(6),
      duration: 2, reason: "Personal work",
      status: "Pending",
      createdBy: ADMIN, updatedBy: ADMIN,
    },
  }).catch(() => null);
  await prisma.leaveRequest.create({
    data: {
      orgId: TENANT, employeeId: active[2].id, leaveTypeId: clType.id,
      startDate: daysAgo(10), endDate: daysAgo(10),
      duration: 1, reason: "Medical appointment",
      status: "Approved",
      createdBy: ADMIN, updatedBy: ADMIN,
    },
  }).catch(() => null);

  // ── HOLIDAYS ────────────────────────────────────
  const holidays = [
    { name: "New Year's Day", date: new Date(year, 0, 1), type: "National" },
    { name: "Republic Day", date: new Date(year, 0, 26), type: "National" },
    { name: "Holi", date: new Date(year, 2, 14), type: "National" },
    { name: "Independence Day", date: new Date(year, 7, 15), type: "National" },
    { name: "Gandhi Jayanti", date: new Date(year, 9, 2), type: "National" },
    { name: "Diwali", date: new Date(year, 10, 12), type: "National" },
    { name: "Christmas", date: new Date(year, 11, 25), type: "National" },
    { name: "Company Foundation Day", date: new Date(year, 5, 15), type: "Company" },
  ];
  for (const h of holidays) {
    const exists = await prisma.companyHoliday.findFirst({
      where: { orgId: TENANT, name: h.name, date: h.date, deletedAt: null },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.companyHoliday.create({
      data: {
        orgId: TENANT, name: h.name, date: h.date, year,
        type: h.type as "National", createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
  }
  console.log(`  Holidays: ${holidays.length}`);

  // ── SHIFT POLICY + ASSIGNMENTS ──────────────────
  const shift = await prisma.shiftPolicy.upsert({
    where: { orgId_code: { orgId: TENANT, code: "GEN" } },
    create: {
      orgId: TENANT, code: "GEN", name: "General",
      startTime: "09:00", endTime: "18:00",
      breakDuration: 60, graceMinutes: 15,
      isDefault: true,
      weekOffs: [0, 6],
      effectiveFrom: daysAgo(365),
      createdBy: ADMIN, updatedBy: ADMIN,
    },
    update: {},
  });

  for (const emp of active) {
    await prisma.shiftAssignment.create({
      data: {
        orgId: TENANT, employeeId: emp.id, shiftId: shift.id,
        effectiveFrom: daysAgo(365),
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
  }

  // ── ATTENDANCE RECORDS (last 7 days) ────────────
  for (const emp of active) {
    for (let i = 0; i < 7; i++) {
      const date = daysAgo(i);
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;
      const checkIn = new Date(date); checkIn.setHours(9, Math.floor(Math.random() * 30));
      const checkOut = new Date(date); checkOut.setHours(18, Math.floor(Math.random() * 30));
      const hours = (checkOut.getTime() - checkIn.getTime()) / 3600000;
      await prisma.attendanceRecord.upsert({
        where: {
          orgId_employeeId_date: { orgId: TENANT, employeeId: emp.id, date },
        },
        create: {
          orgId: TENANT, employeeId: emp.id, date,
          checkIn, checkOut,
          grossHours: Math.round(hours * 100) / 100,
          effectiveHours: Math.round((hours - 1) * 100) / 100,
          status: "Present", source: "Web",
          createdBy: ADMIN, updatedBy: ADMIN,
        },
        update: {},
      });
    }
  }
  console.log(`  Attendance: last 7 days`);

  // ── ONBOARDING ──────────────────────────────────
  const tplTasks = [
    { title: "Upload ID proof (PAN/Aadhaar)", assigneeRole: "EmployeeRole", dueInDays: 2, category: "Documentation", isMandatory: true, sortOrder: 1 },
    { title: "Sign offer letter", assigneeRole: "EmployeeRole", dueInDays: 3, category: "Documentation", isMandatory: true, sortOrder: 2 },
    { title: "Provision email + SSO", assigneeRole: "ITRole", dueInDays: 1, category: "ItSetup", isMandatory: true, sortOrder: 3 },
    { title: "Issue laptop", assigneeRole: "ITRole", dueInDays: 1, category: "ItSetup", isMandatory: true, sortOrder: 4 },
    { title: "Orientation session", assigneeRole: "HRRole", dueInDays: 1, category: "Introduction", isMandatory: true, sortOrder: 5 },
  ];
  const existingTpl = await prisma.onboardingTemplate.findFirst({
    where: { orgId: TENANT, name: "Standard Onboarding", deletedAt: null },
  });
  const onboardingTpl = existingTpl ?? await prisma.onboardingTemplate.create({
    data: {
      orgId: TENANT, name: "Standard Onboarding",
      description: "Default 5-step onboarding",
      tasks: tplTasks,
      isActive: true,
      createdBy: ADMIN, updatedBy: ADMIN,
    },
  }).catch(() => null);

  for (const emp of preBoarding) {
    const inst = await prisma.onboardingInstance.upsert({
      where: { orgId_employeeId: { orgId: TENANT, employeeId: emp.id } },
      create: {
        orgId: TENANT, employeeId: emp.id,
        templateId: onboardingTpl?.id ?? null,
        startDate: daysAhead(7),
        status: "InProgress",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });
    for (const t of tplTasks) {
      await prisma.onboardingTask.create({
        data: {
          orgId: TENANT, instanceId: inst.id,
          title: t.title, assigneeRole: t.assigneeRole as "HRRole",
          category: t.category as "Documentation",
          dueDate: daysAhead(7 + t.dueInDays),
          isMandatory: t.isMandatory, sortOrder: t.sortOrder,
          status: Math.random() > 0.6 ? "TaskCompleted" : "TaskPending",
        },
      }).catch(() => null);
    }
  }
  console.log(`  Onboarding: ${preBoarding.length} instances`);

  // ── OFFBOARDING ─────────────────────────────────
  const onNotice = employees.find((e) => e.status === "OnNotice");
  if (onNotice) {
    const offInst = await prisma.offboardingInstance.upsert({
      where: { orgId_employeeId: { orgId: TENANT, employeeId: onNotice.id } },
      create: {
        orgId: TENANT, employeeId: onNotice.id,
        resignationDate: daysAgo(15), lastWorkingDate: daysAhead(45),
        reason: "Resignation", status: "OffboardInProgress",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });

    const offTasks = [
      { title: "Return laptop", department: "IT", category: "AssetReturn", sortOrder: 1 },
      { title: "Revoke email access", department: "IT", category: "AccessRevoke", sortOrder: 2 },
      { title: "Knowledge transfer", department: "Team", category: "KnowledgeTransfer", sortOrder: 3 },
      { title: "HR clearance", department: "HR", category: "Clearance", sortOrder: 4 },
      { title: "Finance clearance", department: "Finance", category: "Clearance", sortOrder: 5 },
    ];
    for (const t of offTasks) {
      await prisma.offboardingTask.create({
        data: {
          orgId: TENANT, instanceId: offInst.id,
          title: t.title, department: t.department,
          category: t.category as "Clearance",
          sortOrder: t.sortOrder,
          status: t.sortOrder <= 2 ? "TaskCompleted" : "TaskPending",
        },
      }).catch(() => null);
    }
    console.log("  Offboarding: 1 instance");
  }

  // ── RECRUIT: Requisitions ───────────────────────
  const reqs = [
    { num: "REQ-2026-001", title: "Senior Backend Engineer", positions: 2, type: "NewPosition" },
    { num: "REQ-2026-002", title: "Product Designer", positions: 1, type: "NewPosition" },
    { num: "REQ-2026-003", title: "Sales Manager - North", positions: 1, type: "Replacement" },
  ];
  const reqList: Array<Awaited<ReturnType<typeof prisma.jobRequisition.create>>> = [];
  for (const r of reqs) {
    const req = await prisma.jobRequisition.upsert({
      where: { orgId_requisitionNumber: { orgId: TENANT, requisitionNumber: r.num } },
      create: {
        orgId: TENANT, requisitionNumber: r.num, title: r.title,
        positions: r.positions, type: r.type as "NewPosition",
        status: "ReqOpen", priority: "High",
        departmentId: deptMap.ENG.id,
        experienceMin: 3, experienceMax: 8,
        salaryMin: 1500000, salaryMax: 3500000,
        jobDescription: `${r.title} opportunity at QuikIT`,
        skills: ["TypeScript", "React", "PostgreSQL"],
        careerPageVisible: true,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });
    reqList.push(req);
  }
  console.log(`  Requisitions: ${reqList.length}`);

  // ── RECRUIT: Candidates + Applications ──────────
  const candidates = [
    { firstName: "Rohit", lastName: "Kumar", email: "gourav.chandel+rohit@moreyeahs.com", exp: 5 },
    { firstName: "Aisha", lastName: "Khan", email: "gourav.chandel+aisha@moreyeahs.com", exp: 4 },
    { firstName: "Deepak", lastName: "Yadav", email: "gourav.chandel+deepak@moreyeahs.com", exp: 6 },
    { firstName: "Meera", lastName: "Nair", email: "gourav.chandel+meera@moreyeahs.com", exp: 7 },
    { firstName: "Sandeep", lastName: "Joshi", email: "gourav.chandel+sandeep@moreyeahs.com", exp: 3 },
  ];
  for (const c of candidates) {
    const cand = await prisma.candidate.upsert({
      where: { orgId_email: { orgId: TENANT, email: c.email } },
      create: {
        orgId: TENANT, firstName: c.firstName, lastName: c.lastName, email: c.email,
        phone: `+91${String(8000000000 + candidates.indexOf(c)).padStart(10, "0")}`,
        totalExperience: c.exp * 12, status: "InPipeline",
        source: "CandLinkedIn",
        currentCTC: 1200000 + Math.floor(Math.random() * 1000000),
        expectedCTC: 2000000 + Math.floor(Math.random() * 1500000),
        skills: ["TypeScript", "Node.js", "React"],
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });
    const req = reqList[candidates.indexOf(c) % reqList.length];
    await prisma.jobApplication.upsert({
      where: { orgId_candidateId_requisitionId: { orgId: TENANT, candidateId: cand.id, requisitionId: req.id } },
      create: {
        orgId: TENANT, candidateId: cand.id, requisitionId: req.id,
        status: "AppActive", currentStage: "Screening",
        aiMatchScore: 70 + Math.random() * 25,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });
  }
  console.log(`  Candidates: ${candidates.length}`);

  // ── TIME TRACKER: Projects + Jobs + Logs ────────
  const project = await prisma.timeProject.upsert({
    where: { orgId_code: { orgId: TENANT, code: "PRJ-001" } },
    create: {
      orgId: TENANT, code: "PRJ-001", name: "QuikIT HRMS Platform",
      clientName: "Internal", departmentId: deptMap.ENG.id,
      ownerId: active[0]?.id, isBillable: false,
      status: "ProjectActive", budgetHours: 2000,
      startDate: daysAgo(180),
      createdBy: ADMIN, updatedBy: ADMIN,
    },
    update: {},
  });
  const project2 = await prisma.timeProject.upsert({
    where: { orgId_code: { orgId: TENANT, code: "PRJ-002" } },
    create: {
      orgId: TENANT, code: "PRJ-002", name: "Client XYZ — Mobile App",
      clientName: "XYZ Corp", departmentId: deptMap.ENG.id,
      isBillable: true, status: "ProjectActive", budgetHours: 1200,
      createdBy: ADMIN, updatedBy: ADMIN,
    },
    update: {},
  });

  const jobs = [
    { projectId: project.id, name: "Backend API Development", assigneeId: active[2]?.id, estimatedHours: 120, isBillable: false },
    { projectId: project.id, name: "Frontend Dashboard UI", assigneeId: active[3]?.id, estimatedHours: 100, isBillable: false },
    { projectId: project.id, name: "Database Schema Design", assigneeId: active[2]?.id, estimatedHours: 40 },
    { projectId: project2.id, name: "iOS Native App", assigneeId: active[3]?.id, estimatedHours: 200, isBillable: true },
    { projectId: project2.id, name: "Android Native App", estimatedHours: 200, isBillable: true },
  ];
  const createdJobs: Array<Awaited<ReturnType<typeof prisma.timeJob.create>>> = [];
  for (const j of jobs) {
    const job = await prisma.timeJob.create({
      data: {
        orgId: TENANT, projectId: j.projectId,
        name: j.name, assigneeId: j.assigneeId ?? null,
        estimatedHours: j.estimatedHours, isBillable: j.isBillable ?? false,
        status: "JobActive",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
    if (job) createdJobs.push(job);
  }
  console.log(`  Time projects + jobs: ${createdJobs.length}`);

  // Time logs for admin user (last 5 weekdays)
  for (let i = 0; i < 5; i++) {
    const date = daysAgo(i);
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const start = new Date(date); start.setHours(10, 0);
    const end = new Date(date); end.setHours(14, 0);
    await prisma.timeLog.create({
      data: {
        orgId: TENANT, employeeId: adminEmpId,
        date, startTime: start, endTime: end,
        duration: 4, projectId: project.id,
        taskId: createdJobs[0]?.id ?? null,
        description: "Feature development + code review",
        isBillable: false, status: "LogDraft",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
  }

  // ── COMPANY SETTINGS ────────────────────────────
  await prisma.companySettings.upsert({
    where: { orgId: TENANT },
    create: {
      orgId: TENANT, companyName: "QuikIT Technologies",
      timezone: "Asia/Kolkata", dateFormat: "dd/MM/yyyy",
      currency: "INR", fiscalYearStart: 4,
      probationPeriodDays: 90, noticePeriodDays: 60,
      workWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      workHoursPerDay: 9,
      createdBy: ADMIN, updatedBy: ADMIN,
    },
    update: {},
  });

  // ── EXTRA LEAVE REQUESTS (admin + others) ───────
  const slType = leaveTypes.find((t) => t.code === "SL")!;
  const elType = leaveTypes.find((t) => t.code === "EL")!;
  const adminLeaves = [
    { typeId: elType.id, start: daysAgo(30), end: daysAgo(28), days: 3, reason: "Family trip", status: "Approved" },
    { typeId: slType.id, start: daysAgo(14), end: daysAgo(14), days: 1, reason: "Fever", status: "Approved" },
    { typeId: clType.id, start: daysAhead(20), end: daysAhead(20), days: 1, reason: "Bank work", status: "Pending" },
  ];
  for (const l of adminLeaves) {
    await prisma.leaveRequest.create({
      data: {
        orgId: TENANT, employeeId: adminEmpId, leaveTypeId: l.typeId,
        startDate: l.start, endDate: l.end, duration: l.days, reason: l.reason,
        status: l.status as "Pending",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
  }

  // ── EXPENSE CLAIMS ──────────────────────────────
  const claimSeed = [
    { employeeId: adminEmpId, category: "Travel", title: "Client visit - Mumbai to Delhi", amount: 12500, status: "Paid" },
    { employeeId: adminEmpId, category: "Food", title: "Team dinner", amount: 4800, status: "Approved" },
    { employeeId: adminEmpId, category: "Internet", title: "WFH internet — Oct", amount: 1500, status: "Submitted" },
    { employeeId: active[2]?.id ?? adminEmpId, category: "Training", title: "AWS certification course", amount: 18000, status: "Approved" },
    { employeeId: active[3]?.id ?? adminEmpId, category: "Phone", title: "Mobile bill reimbursement", amount: 1200, status: "Submitted" },
  ];
  for (const c of claimSeed) {
    await prisma.expenseClaim.create({
      data: {
        orgId: TENANT, employeeId: c.employeeId,
        category: c.category as "Travel", title: c.title,
        totalAmount: c.amount, currency: "INR",
        status: c.status as "Draft",
        description: c.title,
        expenseDate: daysAgo(Math.floor(Math.random() * 30)),
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
  }
  console.log(`  Expense claims seeded`);

  // ── INTERVIEWS + OFFERS ─────────────────────────
  const applications = await prisma.jobApplication.findMany({ where: { orgId: TENANT, deletedAt: null } });
  for (let i = 0; i < Math.min(3, applications.length); i++) {
    const app = applications[i];
    await prisma.interview.create({
      data: {
        orgId: TENANT, applicationId: app.id,
        round: 1, type: "Video",
        interviewerId: active[0]?.id ?? adminEmpId,
        scheduledAt: daysAhead(i + 2),
        duration: 60,
        meetingLink: "https://meet.example.com/interview-demo",
        status: "IntScheduled",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
  }

  if (applications[0]) {
    const topApp = applications[0];
    await prisma.interview.create({
      data: {
        orgId: TENANT, applicationId: topApp.id,
        round: 2, type: "Panel",
        interviewerId: active[0]?.id ?? adminEmpId,
        scheduledAt: daysAhead(7),
        duration: 90,
        status: "IntScheduled",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);

    // Offer for top application (offer now lives on the application row)
    await prisma.jobApplication.update({
      where: { id: topApp.id },
      data: {
        offerStatus: "OfferSent",
        offerDesignation: "Senior Backend Engineer",
        offerDepartmentId: deptMap.ENG.id,
        offeredCTC: 2800000,
        offerJoiningDate: daysAhead(30),
        offerJoiningBonus: 100000,
        offerSentAt: daysAgo(3),
        offerExpiresAt: daysAhead(14),
        offeredComponents: { Basic: 1120000, HRA: 560000, Special: 1120000 },
        offerCreatedAt: daysAgo(5),
        offerCreatedBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }

  if (applications[1]) {
    await prisma.jobApplication.update({
      where: { id: applications[1].id },
      data: {
        offerStatus: "OfferDraft",
        offerDesignation: "Product Designer",
        offerDepartmentId: deptMap.ENG.id,
        offeredCTC: 2200000,
        offerJoiningDate: daysAhead(45),
        offeredComponents: { Basic: 880000, HRA: 440000, Special: 880000 },
        offerCreatedAt: daysAgo(1),
        offerCreatedBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Interviews + Offers seeded`);

  // ── ADMIN LEAVE BALANCES ────────────────────────
  for (const lt of leaveTypes) {
    await prisma.leaveBalance.upsert({
      where: {
        orgId_employeeId_leaveTypeId_year: {
          orgId: TENANT, employeeId: adminEmpId, leaveTypeId: lt.id, year,
        },
      },
      create: {
        orgId: TENANT, employeeId: adminEmpId, leaveTypeId: lt.id, year,
        opening: lt.maxBalance, accrued: 0, taken: 0,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
      update: {},
    });
  }

  // ── ENGAGE: Announcements ───────────────────────
  const announcementSeed = [
    {
      title: "Welcome to QuikIT HRMS",
      content: "Our new HRMS portal is live. Explore leaves, expenses, and performance modules.",
      visibility: "Organization" as const, isPinned: true,
    },
    {
      title: "Holiday Calendar 2026 Published",
      content: "FY2026 holiday list is now available under Holidays. Plan your leaves accordingly.",
      visibility: "Organization" as const, isPinned: false,
    },
    {
      title: "Engineering All-Hands — Friday 4 PM",
      content: "Quarterly engineering town hall. Roadmap review and Q&A. Conference Room A.",
      visibility: "Department" as const, isPinned: false,
    },
  ];
  for (const a of announcementSeed) {
    const existing = await prisma.announcement.findFirst({
      where: { orgId: TENANT, title: a.title, deletedAt: null },
    });
    if (existing) continue;
    await prisma.announcement.create({
      data: {
        orgId: TENANT, authorId: employees[0].id,
        title: a.title, content: a.content,
        visibility: a.visibility, isPinned: a.isPinned,
        publishedAt: daysAgo(2),
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Announcements: ${announcementSeed.length}`);

  // ── ENGAGE: Social Posts ────────────────────────
  const socialSeed = [
    { empIdx: 1, type: "RecognitionPost" as const, content: "Huge shoutout to @Priya for closing the Acme deal. Crushing it! 🎯" },
    { empIdx: 2, type: "Update" as const, content: "Shipped v2.3 of the onboarding flow today. Thanks to the whole team!" },
    { empIdx: 3, type: "Birthday" as const, content: "Happy Birthday Rahul! 🎂 Wishing you an amazing year ahead." },
    { empIdx: 4, type: "WorkAnniversary" as const, content: "Celebrating 3 years at QuikIT today. Grateful for this journey." },
  ];
  for (const p of socialSeed) {
    const emp = employees[p.empIdx];
    if (!emp) continue;
    const existing = await prisma.socialPost.findFirst({
      where: { orgId: TENANT, employeeId: emp.id, content: p.content, deletedAt: null },
    });
    if (existing) continue;
    await prisma.socialPost.create({
      data: {
        orgId: TENANT, employeeId: emp.id, type: p.type, content: p.content,
        visibility: "Organization", createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Social Posts: ${socialSeed.length}`);

  // ── DELEGATION ──────────────────────────────────
  const delegationSeed = [
    {
      delegatorIdx: 0, delegateeIdx: 2,
      type: "DelegationTemporary" as const,
      modules: ["LeaveApproval", "ExpenseApproval"],
      fromDate: daysAhead(1), toDate: daysAhead(7),
      description: "CEO on leave — delegating approvals to Engineering Manager",
    },
    {
      delegatorIdx: 1, delegateeIdx: 3,
      type: "DelegationTemporary" as const,
      modules: ["LeaveApproval"],
      fromDate: daysAhead(3), toDate: daysAhead(10),
      description: "HRBP offsite — leave approvals delegated to team lead",
    },
  ];
  for (const d of delegationSeed) {
    const dor = employees[d.delegatorIdx];
    const dee = employees[d.delegateeIdx];
    if (!dor || !dee) continue;
    const existing = await prisma.delegation.findFirst({
      where: { orgId: TENANT, delegatorId: dor.id, delegateeId: dee.id, fromDate: d.fromDate, deletedAt: null },
    });
    if (existing) continue;
    await prisma.delegation.create({
      data: {
        orgId: TENANT, delegatorId: dor.id, delegateeId: dee.id,
        type: d.type, modules: d.modules, fromDate: d.fromDate, toDate: d.toDate,
        notifyMode: "NotifyBoth", description: d.description, isActive: true,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Delegations: ${delegationSeed.length}`);

  // ── PERFORMANCE: Appraisal Cycle + Goals + Feedback ─
  let cycle = await prisma.appraisalCycle.findFirst({
    where: { orgId: TENANT, name: "FY2026 Annual Review", deletedAt: null },
  });
  if (!cycle) {
    cycle = await prisma.appraisalCycle.create({
      data: {
        orgId: TENANT, name: "FY2026 Annual Review",
        type: "Annual", status: "SelfReview",
        startDate: daysAgo(30), endDate: daysAhead(30),
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }

  for (const emp of employees.slice(0, 4)) {
    const existing = await prisma.employeeAppraisal.findFirst({
      where: { orgId: TENANT, employeeId: emp.id, cycleId: cycle.id },
    });
    if (existing) continue;
    await prisma.employeeAppraisal.create({
      data: {
        orgId: TENANT, employeeId: emp.id, cycleId: cycle.id,
        status: "InProgress",
        selfRating: 4.2, selfComments: "Delivered all planned OKRs for the year.",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Appraisals: ${Math.min(4, employees.length)}`);

  const goalSeed = [
    { empIdx: 1, title: "Close $500K ARR in Q2", type: "Individual" as const, category: "Business" as const, target: 500000, unit: "USD", weight: 40 },
    { empIdx: 2, title: "Launch mobile onboarding v2", type: "HrmsTeam" as const, category: "Project" as const, target: 100, unit: "%", weight: 30 },
    { empIdx: 3, title: "Reduce p95 API latency below 200ms", type: "Individual" as const, category: "Business" as const, target: 200, unit: "ms", weight: 25 },
    { empIdx: 4, title: "Complete AWS Solutions Architect cert", type: "Individual" as const, category: "Development" as const, target: 1, unit: "cert", weight: 15 },
  ];
  for (const g of goalSeed) {
    const emp = employees[g.empIdx];
    if (!emp) continue;
    const existing = await prisma.hrmsGoal.findFirst({
      where: { orgId: TENANT, employeeId: emp.id, title: g.title, deletedAt: null },
    });
    if (existing) continue;
    await prisma.hrmsGoal.create({
      data: {
        orgId: TENANT, employeeId: emp.id,
        title: g.title, type: g.type, category: g.category,
        targetValue: g.target, currentValue: g.target * 0.4, unit: g.unit, weight: g.weight,
        startDate: daysAgo(60), dueDate: daysAhead(30),
        status: "InProgress", progress: 40, visibility: "TeamVisible",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Goals: ${goalSeed.length}`);

  const feedbackSeed = [
    { fromIdx: 0, toIdx: 1, type: "Praise" as const, category: "CustomerFocus" as const, message: "Exceptional client handling on the Acme renewal. Well done." },
    { fromIdx: 2, toIdx: 3, type: "Recognition" as const, category: "Technical" as const, message: "Your code review caught a critical bug before prod. Thanks!" },
    { fromIdx: 1, toIdx: 4, type: "Constructive" as const, category: "Communication" as const, message: "Try to share weekly updates in the team channel — helps visibility." },
  ];
  for (const f of feedbackSeed) {
    const from = employees[f.fromIdx];
    const to = employees[f.toIdx];
    if (!from || !to) continue;
    const existing = await prisma.continuousFeedback.findFirst({
      where: { orgId: TENANT, fromEmployeeId: from.id, toEmployeeId: to.id, message: f.message },
    });
    if (existing) continue;
    await prisma.continuousFeedback.create({
      data: {
        orgId: TENANT, fromEmployeeId: from.id, toEmployeeId: to.id,
        type: f.type, category: f.category, message: f.message, isPublic: true,
      },
    });
  }
  console.log(`  Feedback: ${feedbackSeed.length}`);

  // ── PERFORMANCE: Review Forms + KRA Templates + KRA Assignments + PIP ─
  const perfDept = await prisma.department.findFirst({
    where: { orgId: TENANT, deletedAt: null },
    select: { id: true },
  });

  // Review forms (Performance → Reviews)
  const reviewFormSeed = [
    {
      name: "Annual Review Form FY2026",
      sections: [
        { name: "Goals & Achievements", weight: 40, type: "Goals", questions: [
          { text: "How well did the employee meet their goals this year?", type: "Rating", ratingScale: { min: 1, max: 5, labels: ["Poor", "Below", "Meets", "Exceeds", "Outstanding"] }, isRequired: true },
          { text: "Summarise the key achievements this cycle.", type: "Text", isRequired: true },
        ] },
        { name: "Core Competencies", weight: 40, type: "Competencies", questions: [
          { text: "Communication", type: "Rating", ratingScale: { min: 1, max: 5, labels: [] }, isRequired: true },
          { text: "Ownership & Accountability", type: "Rating", ratingScale: { min: 1, max: 5, labels: [] }, isRequired: true },
        ] },
        { name: "Company Values", weight: 20, type: "Values", questions: [
          { text: "Consistently demonstrates our core values.", type: "Scale", isRequired: true },
        ] },
      ],
    },
    {
      name: "Quarterly Check-in Form",
      sections: [
        { name: "Quarterly Goals", weight: 60, type: "Goals", questions: [
          { text: "Progress against quarterly objectives.", type: "Rating", ratingScale: { min: 1, max: 5, labels: [] }, isRequired: true },
        ] },
        { name: "Support & Blockers", weight: 40, type: "CustomQuestions", questions: [
          { text: "What support do you need next quarter?", type: "Text", isRequired: false },
        ] },
      ],
    },
  ];
  for (const rf of reviewFormSeed) {
    const existing = await prisma.reviewForm.findFirst({
      where: { orgId: TENANT, name: rf.name, deletedAt: null },
    });
    if (existing) continue;
    await prisma.reviewForm.create({
      data: { orgId: TENANT, name: rf.name, sections: rf.sections, createdBy: ADMIN, updatedBy: ADMIN },
    });
  }
  console.log(`  Review forms: ${reviewFormSeed.length}`);

  // KRA/KPI scorecard templates (Performance → KRA/KPI Templates)
  const kraScorecardSeed = [
    {
      name: "Software Engineer Scorecard",
      description: "Standard KRA/KPI scorecard for engineering roles.",
      kras: [
        { title: "Delivery & Quality", weight: 40, kpis: [
          { title: "Sprint commitments met", target: "90", unit: "%", weight: 50, measurementMethod: "Jira sprint reports" },
          { title: "Production defects", target: "< 3 / quarter", unit: "count", weight: 50, measurementMethod: "Incident tracker" },
        ] },
        { title: "Technical Excellence", weight: 35, kpis: [
          { title: "Code review turnaround", target: "24", unit: "hours", weight: 60, measurementMethod: "PR metrics" },
          { title: "Automated test coverage", target: "80", unit: "%", weight: 40, measurementMethod: "Coverage report" },
        ] },
        { title: "Collaboration", weight: 25, kpis: [
          { title: "Peer feedback score", target: "4", unit: "/5", weight: 100, measurementMethod: "360° feedback" },
        ] },
      ],
    },
    {
      name: "Sales Executive Scorecard",
      description: "KRA/KPI scorecard for sales roles.",
      kras: [
        { title: "Revenue", weight: 50, kpis: [
          { title: "Quarterly quota attainment", target: "100", unit: "%", weight: 70, measurementMethod: "CRM" },
          { title: "New logos closed", target: "5", unit: "count", weight: 30, measurementMethod: "CRM" },
        ] },
        { title: "Pipeline Health", weight: 30, kpis: [
          { title: "Qualified pipeline coverage", target: "3", unit: "x quota", weight: 100, measurementMethod: "CRM" },
        ] },
        { title: "Customer Success", weight: 20, kpis: [
          { title: "Renewal rate", target: "90", unit: "%", weight: 100, measurementMethod: "CRM" },
        ] },
      ],
    },
  ];
  type SeededCard = {
    id: string; name: string;
    kras: { id: string; title: string; description: string | null; weight: number;
      kpis: { id: string; title: string; description: string | null; measurementMethod: string; target: string; unit: string; weight: number; sortOrder: number }[] }[];
  };
  const seededScorecards: SeededCard[] = [];
  for (const [scIdx, sc] of kraScorecardSeed.entries()) {
    const krasWithIds = sc.kras.map((k, ki) => ({
      id: `kra-${scIdx}-${ki}`,
      title: k.title,
      description: null as string | null,
      weight: k.weight,
      kpis: k.kpis.map((kp, kpi) => ({
        id: `kpi-${scIdx}-${ki}-${kpi}`,
        title: kp.title,
        description: null as string | null,
        measurementMethod: kp.measurementMethod,
        target: kp.target,
        unit: kp.unit,
        weight: kp.weight,
        sortOrder: kpi,
      })),
    }));
    let scorecard = await prisma.kraScorecard.findFirst({
      where: { orgId: TENANT, name: sc.name, deletedAt: null },
    });
    if (!scorecard) {
      scorecard = await prisma.kraScorecard.create({
        data: {
          orgId: TENANT, name: sc.name, description: sc.description,
          departmentId: perfDept?.id ?? null, effectiveFrom: daysAgo(30),
          isActive: true, tags: [], createdBy: ADMIN, updatedBy: ADMIN,
        },
      });
      for (const [ki, k] of krasWithIds.entries()) {
        await prisma.kraTemplateEntry.create({
          data: { scorecardId: scorecard.id, title: k.title, weight: k.weight, sortOrder: ki, kpis: k.kpis },
        });
      }
    }
    seededScorecards.push({ id: scorecard.id, name: sc.name, kras: krasWithIds });
  }
  console.log(`  KRA templates: ${kraScorecardSeed.length}`);

  // KRA assignments — assign the first scorecard to a few employees (Performance → KRA Assignments)
  const primaryCard = seededScorecards[0];
  if (primaryCard) {
    const snapshot = {
      scorecardName: primaryCard.name,
      effectiveFromAtAssignment: daysAgo(30).toISOString().slice(0, 10),
      kras: primaryCard.kras.map((k) => ({
        id: k.id, title: k.title, description: k.description, weight: k.weight,
        kpis: k.kpis.map((kp) => ({
          id: kp.id, title: kp.title, description: kp.description,
          measurementMethod: kp.measurementMethod, target: kp.target, unit: kp.unit, weight: kp.weight,
        })),
      })),
    };
    let kraAssigned = 0;
    for (const emp of employees.slice(1, 5)) {
      const existing = await prisma.employeeKraAssignment.findFirst({
        where: { orgId: TENANT, employeeId: emp.id, scorecardId: primaryCard.id, deletedAt: null },
      });
      if (existing) continue;
      await prisma.employeeKraAssignment.create({
        data: {
          orgId: TENANT, employeeId: emp.id, scorecardId: primaryCard.id,
          effectiveFrom: daysAgo(30), snapshot, progress: {}, status: "Active", createdBy: ADMIN,
        },
      });
      kraAssigned++;
    }
    console.log(`  KRA assignments: ${kraAssigned}`);
  }

  // PIP — one active plan (Performance → PIP)
  const pipEmp = employees[5];
  if (pipEmp) {
    const existingPip = await prisma.pIP.findFirst({
      where: { orgId: TENANT, employeeId: pipEmp.id, deletedAt: null },
    });
    if (!existingPip) {
      await prisma.pIP.create({
        data: {
          orgId: TENANT, employeeId: pipEmp.id, initiatedById: adminEmpId,
          reason: "Consistently missed sprint commitments across the last two quarters; quality metrics below the team baseline.",
          startDate: daysAgo(15), endDate: daysAhead(45), status: "PIPActive",
          objectives: [
            { title: "Meet at least 90% of sprint commitments", description: "Tracked weekly via Jira", targetDate: daysAhead(30).toISOString().slice(0, 10), status: "Pending" },
            { title: "Reduce production defects to < 3 / month", description: "Reviewed in weekly 1:1s", targetDate: daysAhead(45).toISOString().slice(0, 10), status: "Pending" },
          ],
          supportProvided: ["Assigned a senior mentor", "Weekly coaching sessions", "Access to advanced training"],
          createdBy: ADMIN, updatedBy: ADMIN,
        },
      });
    }
    console.log(`  PIP: 1`);
  }

  // ── DOCUMENTS ───────────────────────────────────
  const documentSeed = [
    { title: "Employee Handbook 2026", category: "Policy" as const, fileUrl: "https://cdn.quikit.dev/docs/handbook-2026.pdf", fileType: "application/pdf", fileSize: 1_200_000 },
    { title: "Leave Policy", category: "Policy" as const, fileUrl: "https://cdn.quikit.dev/docs/leave-policy.pdf", fileType: "application/pdf", fileSize: 320_000 },
    { title: "Code of Conduct", category: "Policy" as const, fileUrl: "https://cdn.quikit.dev/docs/code-of-conduct.pdf", fileType: "application/pdf", fileSize: 480_000 },
    { title: "IT Security Guidelines", category: "Policy" as const, fileUrl: "https://cdn.quikit.dev/docs/it-security.pdf", fileType: "application/pdf", fileSize: 560_000 },
  ];
  const documents: Array<{ id: string; title: string }> = [];
  for (const d of documentSeed) {
    const existing = await prisma.document.findFirst({
      where: { orgId: TENANT, title: d.title, deletedAt: null },
    });
    if (existing) { documents.push({ id: existing.id, title: existing.title }); continue; }
    const doc = await prisma.document.create({
      data: {
        orgId: TENANT, title: d.title, category: d.category,
        fileUrl: d.fileUrl, fileType: d.fileType, fileSize: d.fileSize,
        status: "Active", uploadedBy: ADMIN,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
    documents.push({ id: doc.id, title: doc.title });
  }
  console.log(`  Documents: ${documents.length}`);


  const handbook = documents.find((d) => d.title === "Employee Handbook 2026");
  if (handbook) {
    for (const emp of employees.slice(0, 5)) {
      const existing = await prisma.documentAcknowledgment.findUnique({
        where: { orgId_documentId_employeeId: { orgId: TENANT, documentId: handbook.id, employeeId: emp.id } },
      });
      if (existing) continue;
      await prisma.documentAcknowledgment.create({
        data: {
          orgId: TENANT, documentId: handbook.id, employeeId: emp.id,
          status: "Pending",
        },
      });
    }
    console.log(`  Document Acknowledgments: ${Math.min(5, employees.length)}`);
  }

  // ── APPROVAL CHAINS ─────────────────────────────
  const approvalChainSeed = [
    {
      name: "Leave Approval — Standard",
      module: "Leave" as const,
      levels: [
        { level: 1, approverType: "ReportingManager", escalateAfterHours: 48, allowSkip: false },
        { level: 2, approverType: "HR",              escalateAfterHours: 72, allowSkip: true  },
      ],
      autoApproveAfterDays: 7,
    },
    {
      name: "Expense Approval — Up to ₹25k",
      module: "Expense" as const,
      levels: [
        { level: 1, approverType: "ReportingManager", escalateAfterHours: 48, allowSkip: false },
      ],
      autoApproveAfterDays: null,
    },
    {
      name: "Expense Approval — Above ₹25k",
      module: "Expense" as const,
      levels: [
        { level: 1, approverType: "ReportingManager", escalateAfterHours: 48, allowSkip: false },
        { level: 2, approverType: "DepartmentHead",   escalateAfterHours: 72, allowSkip: false },
        { level: 3, approverType: "HR",               escalateAfterHours: 96, allowSkip: false },
      ],
      autoApproveAfterDays: null,
    },
    {
      name: "Offboarding Clearance",
      module: "Offboarding" as const,
      levels: [
        { level: 1, approverType: "ReportingManager", escalateAfterHours: 48, allowSkip: false },
        { level: 2, approverType: "HR",               escalateAfterHours: 72, allowSkip: false },
        { level: 3, approverType: "Custom",           escalateAfterHours: 96, allowSkip: false },
      ],
      autoApproveAfterDays: null,
    },
  ];
  for (const c of approvalChainSeed) {
    const existing = await prisma.approvalChain.findFirst({
      where: { orgId: TENANT, name: c.name, deletedAt: null },
    });
    if (existing) continue;
    await prisma.approvalChain.create({
      data: {
        orgId: TENANT, name: c.name, module: c.module,
        levels: c.levels, autoApproveAfterDays: c.autoApproveAfterDays ?? undefined,
        isActive: true, createdBy: ADMIN, updatedBy: ADMIN,
      },
    });
  }
  console.log(`  Approval Chains: ${approvalChainSeed.length}`);

  // ── WFH REQUESTS ────────────────────────────────
  if ((await prisma.wfhRequest.count({ where: { orgId: TENANT } })) === 0) {
    const wfhSeed = [
      { emp: active[1], start: daysAhead(3), end: daysAhead(3), days: 1, half: false, session: "FullDay", reason: "Home internet installation", status: "Pending" },
      { emp: active[2], start: daysAgo(4), end: daysAgo(4), days: 0.5, half: true, session: "FirstHalf", reason: "Doctor visit in the morning", status: "Approved" },
      { emp: active[3], start: daysAgo(10), end: daysAgo(8), days: 3, half: false, session: "FullDay", reason: "Relocation week", status: "Approved" },
      { emp: active[4], start: daysAhead(7), end: daysAhead(8), days: 2, half: false, session: "FullDay", reason: "Family commitment", status: "Rejected" },
    ];
    for (const w of wfhSeed) {
      if (!w.emp) continue;
      const req = await prisma.wfhRequest.create({
        data: {
          orgId: TENANT, employeeId: w.emp.id,
          startDate: w.start, endDate: w.end, days: w.days,
          isHalfDay: w.half, session: w.session as "FullDay",
          reason: w.reason, status: w.status as "Pending",
          createdBy: ADMIN, updatedBy: ADMIN,
        },
      }).catch(() => null);
      if (req) {
        await prisma.wfhApproval.create({
          data: {
            orgId: TENANT, wfhRequestId: req.id, approverId: adminEmpId,
            level: 1, role: "Manager",
            status: (w.status === "Approved" ? "Approved" : w.status === "Rejected" ? "Rejected" : "Pending") as "Pending",
          },
        }).catch(() => null);
      }
    }
    console.log(`  WFH requests: ${wfhSeed.length}`);
  }

  // ── TASKS / TODO ────────────────────────────────
  if ((await prisma.task.count({ where: { orgId: TENANT } })) === 0) {
    const taskSeed = [
      { emp: active[0], title: "Approve pending leave requests", priority: "High", due: daysAhead(1), status: "Open" },
      { emp: active[1], title: "Finalize Q2 hiring plan", priority: "Normal", due: daysAhead(5), status: "InProgress" },
      { emp: active[2], title: "Complete security awareness training", priority: "Normal", due: daysAgo(2), status: "Completed" },
      { emp: active[3], title: "Submit timesheet for last week", priority: "Urgent", due: daysAgo(1), status: "Open" },
      { emp: active[4], title: "Update CRM opportunities", priority: "Low", due: daysAhead(3), status: "Open" },
    ];
    for (const t of taskSeed) {
      if (!t.emp) continue;
      await prisma.task.create({
        data: {
          orgId: TENANT, title: t.title, assigneeId: t.emp.id,
          requesterId: adminEmpId, dueDate: t.due,
          priority: t.priority as "Normal", status: t.status as "Open",
          ...(t.status === "Completed" ? { completedAt: daysAgo(2), completedBy: t.emp.id } : {}),
          createdBy: ADMIN, updatedBy: ADMIN,
        },
      }).catch(() => null);
    }
    console.log(`  Tasks: ${taskSeed.length}`);
  }

  // ── ATTENDANCE REGULARIZATIONS ──────────────────
  if ((await prisma.attendanceRecord.count({ where: { orgId: TENANT, regularizationStatus: { not: "None" } } })) === 0) {
    const recs = await prisma.attendanceRecord.findMany({
      where: { orgId: TENANT, regularizationStatus: "None" },
      orderBy: { date: "desc" }, take: 3,
    });
    for (const r of recs) {
      await prisma.attendanceRecord.update({
        where: { id: r.id },
        data: { regularizationStatus: "Pending", regularizationReason: "Forgot to check out", updatedBy: ADMIN },
      }).catch(() => null);
    }
    console.log(`  Attendance regularizations: ${recs.length}`);
  }

  // ── TIMESHEETS ──────────────────────────────────
  if ((await prisma.timesheet.count({ where: { orgId: TENANT } })) === 0) {
    const tsEmps = active.slice(0, 5);
    for (const emp of tsEmps) {
      await prisma.timesheet.create({
        data: {
          orgId: TENANT, employeeId: emp.id,
          periodType: "Weekly", periodStart: daysAgo(7), periodEnd: daysAgo(1),
          totalHours: 40, billableHours: 32,
          status: "TsSubmitted", createdBy: ADMIN, updatedBy: ADMIN,
        },
      }).catch(() => null);
    }
    console.log(`  Timesheets: ${tsEmps.length}`);
  }

  // ── NOTIFICATIONS ───────────────────────────────
  if ((await prisma.hrmsNotification.count({ where: { orgId: TENANT } })) === 0) {
    const notifSeed = [
      { emp: active[0], type: "Action", title: "Leave request pending", message: "A team member applied for 2 days casual leave.", link: "/leaves" },
      { emp: active[0], type: "Action", title: "Expense claim to review", message: "A new expense claim needs your approval.", link: "/expenses" },
      { emp: active[1], type: "Success", title: "Leave approved", message: "Your medical leave was approved.", link: "/leaves" },
      { emp: active[2], type: "Info", title: "New announcement", message: "Q2 all-hands is scheduled for Friday.", link: "/engage/announcements" },
      { emp: active[3], type: "Warning", title: "Timesheet due", message: "Please submit your weekly timesheet by end of day.", link: "/timesheets" },
    ];
    await prisma.hrmsNotification.createMany({
      data: notifSeed.filter((n) => n.emp).map((n) => ({
        orgId: TENANT, employeeId: n.emp!.id, type: n.type as "Info", channel: "InApp" as const,
        title: n.title, message: n.message, link: n.link,
      })),
    });
    console.log(`  Notifications: ${notifSeed.length}`);
  }

  // ── ENGAGE: Surveys ─────────────────────────────
  if ((await prisma.hrmsSurvey.count({ where: { orgId: TENANT } })) === 0) {
    const questions = [
      { id: "q1", type: "NPS", text: "How likely are you to recommend us as a place to work?" },
      { id: "q2", type: "SurveyRating", text: "How satisfied are you with your work-life balance?" },
      { id: "q3", type: "FreeText", text: "What is one thing we could improve?" },
    ];
    const survey = await prisma.hrmsSurvey.create({
      data: {
        orgId: TENANT, title: "Q2 Employee Engagement Pulse", type: "Engagement",
        questions, isAnonymous: true,
        startDate: daysAgo(3), endDate: daysAhead(11),
        status: "SurveyActive", createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
    if (survey) {
      await prisma.hrmsSurveyResponse.createMany({
        data: [
          { orgId: TENANT, surveyId: survey.id, answers: { q1: 9, q2: 4, q3: "More flexible hours" } },
          { orgId: TENANT, surveyId: survey.id, answers: { q1: 7, q2: 5, q3: "Great team culture" } },
        ],
      }).catch(() => null);
    }
    console.log("  Surveys: 1 (+2 responses)");
  }

  // ── ENGAGE: Recognition / Kudos ─────────────────
  if ((await prisma.recognition.count({ where: { orgId: TENANT } })) === 0) {
    const recogSeed = [
      { from: active[0], to: active[3], type: "Kudos", message: "Great job shipping the onboarding flow!", points: 50, badge: undefined as string | undefined },
      { from: active[1], to: active[2], type: "Shoutout", message: "Thanks for mentoring the new joiners.", points: 30, badge: undefined },
      { from: active[4], to: active[1], type: "Award", message: "Employee of the month!", points: 100, badge: "Star Performer" },
    ];
    for (const r of recogSeed) {
      if (!r.from || !r.to) continue;
      await prisma.recognition.create({
        data: {
          orgId: TENANT, fromEmployeeId: r.from.id, toEmployeeId: r.to.id,
          type: r.type as "Kudos", message: r.message, points: r.points,
          ...(r.badge ? { badge: r.badge } : {}),
          isPublic: true, approvalStatus: "Approved", approvedById: adminEmpId, approvedAt: new Date(),
        },
      }).catch(() => null);
    }
    console.log(`  Recognition: ${recogSeed.length}`);
  }

  // ── PAYROLL: Employee Salaries (linked to a full salary structure) ──
  {
    // Reuse the org's real active salary structure (prefer the default) so each
    // employee gets a complete Basic/HRA/Allowance breakdown on My Salary.
    const structure = await prisma.salaryStructure.findFirst({
      where: { orgId: TENANT, deletedAt: null, isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    let salaryCount = 0;
    for (const emp of active) {
      const already = await prisma.employeeSalary.findFirst({
        where: { orgId: TENANT, employeeId: emp.id, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (already) continue; // keep any salary the admin already assigned
      const ctc = 600000 + Math.floor(Math.random() * 20) * 100000; // ₹6L–₹25L
      const created = await prisma.employeeSalary.create({
        data: {
          orgId: TENANT, employeeId: emp.id,
          structureId: structure?.id ?? null,
          ctc, currency: "INR", effectiveFrom: daysAgo(365), isActive: true,
          revisionReason: "Initial salary on joining",
          createdBy: ADMIN, updatedBy: ADMIN,
        },
      }).catch(() => null);
      if (created) salaryCount++;
    }
    console.log(`  Employee salaries: +${salaryCount} (structure ${structure ? "linked" : "none"})`);
  }

  // ── PAYROLL: Pay Run + Payslips (last month) ─────
  if ((await prisma.payRun.count({ where: { orgId: TENANT } })) === 0) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const payDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const run = await prisma.payRun.create({
      data: {
        orgId: TENANT, periodStart, periodEnd, payDate,
        payFrequency: "Monthly", status: "Paid",
        employeeCount: active.length, currency: "INR",
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
    if (run) {
      for (const emp of active) {
        const gross = 50000 + Math.floor(Math.random() * 10) * 5000;
        const ded = Math.round(gross * 0.12);
        await prisma.payslip.create({
          data: {
            orgId: TENANT, payRunId: run.id, employeeId: emp.id,
            periodStart, periodEnd,
            workingDays: 22, paidDays: 22, lopDays: 0,
            grossEarnings: gross, totalDeductions: ded, netPay: gross - ded,
            currency: "INR", status: "Released",
          },
        }).catch(() => null);
      }
      console.log(`  Payroll: 1 pay run + ${active.length} payslips`);
    }
  }

  // ── EMPLOYMENT HISTORY ──────────────────────────
  if ((await prisma.employmentHistory.count({ where: { orgId: TENANT } })) === 0) {
    const historySeed = [
      { emp: active[2], changeType: "Promotion", fromValue: { jobTitle: "Software Engineer" }, toValue: { jobTitle: "Senior Software Engineer" }, effectiveDate: daysAgo(120), reason: "Annual promotion cycle" },
      { emp: active[1], changeType: "SalaryChange", fromValue: { ctc: 1200000 }, toValue: { ctc: 1500000 }, effectiveDate: daysAgo(200), reason: "Merit increment" },
      { emp: active[3], changeType: "ConfirmationChange", fromValue: { status: "Probation" }, toValue: { status: "Confirmed" }, effectiveDate: daysAgo(90), reason: "Probation completed" },
      { emp: active[4], changeType: "DepartmentChange", fromValue: { department: "Marketing" }, toValue: { department: "Sales" }, effectiveDate: daysAgo(60), reason: "Internal transfer" },
      { emp: active[5], changeType: "ManagerChange", fromValue: { manager: "Rahul Verma" }, toValue: { manager: "Vikram Singh" }, effectiveDate: daysAgo(45), reason: "Team reorganisation" },
    ];
    for (const h of historySeed) {
      if (!h.emp) continue;
      await prisma.employmentHistory.create({
        data: {
          orgId: TENANT, employeeId: h.emp.id,
          changeType: h.changeType as "Promotion",
          fromValue: h.fromValue, toValue: h.toValue,
          effectiveDate: h.effectiveDate, reason: h.reason,
          approvedBy: adminEmpId, createdBy: ADMIN,
        },
      }).catch(() => null);
    }
    console.log(`  Employment history: ${historySeed.length}`);
  }

  // ── RECRUIT: Requisition Approvals (pending queue) ──
  {
    const pendingReqs = [
      { num: "REQ-2026-004", title: "Senior Data Engineer", positions: 1, raiser: active[2] },
      { num: "REQ-2026-005", title: "Customer Success Lead", positions: 1, raiser: active[4] },
    ];
    for (const pr of pendingReqs) {
      const req = await prisma.jobRequisition.upsert({
        where: { orgId_requisitionNumber: { orgId: TENANT, requisitionNumber: pr.num } },
        create: {
          orgId: TENANT, requisitionNumber: pr.num, title: pr.title,
          positions: pr.positions, type: "NewPosition",
          status: "PendingApproval", priority: "High",
          departmentId: deptMap.ENG.id,
          raisedById: pr.raiser?.id ?? adminEmpId, raisedAt: daysAgo(3),
          experienceMin: 4, experienceMax: 9,
          salaryMin: 1800000, salaryMax: 3800000,
          jobDescription: `${pr.title} — pending leadership approval`,
          skills: ["Leadership", "Communication"],
          careerPageVisible: false,
          createdBy: ADMIN, updatedBy: ADMIN,
        },
        update: {},
      }).catch(() => null);
      if (req && (await prisma.requisitionApproval.count({ where: { orgId: TENANT, requisitionId: req.id } })) === 0) {
        // Level 1 (DeptHead) assigned to the signed-in admin (ADMIN) so it's
        // actionable in "My approvals"; level 2 (HR) waits behind it.
        await prisma.requisitionApproval.createMany({
          data: [
            { orgId: TENANT, requisitionId: req.id, approverId: ADMIN, level: 1, role: "DeptHead", status: "Pending" },
            { orgId: TENANT, requisitionId: req.id, approverId: ADMIN, level: 2, role: "HR", status: "Pending" },
          ],
        }).catch(() => null);
      }
    }
    console.log(`  Requisition approvals: ${pendingReqs.length} pending`);
  }

  // ── DUTY ROSTER ─────────────────────────────────
  if ((await prisma.roster.count({ where: { orgId: TENANT } })) === 0) {
    // Current week, Monday → Sunday.
    const t0 = daysAgo(0);
    const monday = new Date(t0); monday.setDate(t0.getDate() - ((t0.getDay() + 6) % 7));
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const roster = await prisma.roster.create({
      data: {
        orgId: TENANT,
        name: `Weekly Roster — ${monday.toLocaleDateString("en-IN")}`,
        periodStart: monday, periodEnd: sunday,
        status: "Published", publishedAt: new Date(), publishedBy: ADMIN,
        createdBy: ADMIN, updatedBy: ADMIN,
      },
    }).catch(() => null);
    if (roster) {
      const rosterEmpIds = [...new Set([...active.map((e) => e.id), ADMIN])];
      const entries = rosterEmpIds.flatMap((employeeId) =>
        Array.from({ length: 7 }, (_, i) => {
          const date = new Date(monday); date.setDate(monday.getDate() + i);
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return {
            orgId: TENANT, rosterId: roster.id, employeeId, date,
            shiftId: weekend ? null : shift.id,
            type: (weekend ? "WeekOff" : "Duty") as "Duty",
            createdBy: ADMIN, updatedBy: ADMIN,
          };
        }),
      );
      await prisma.rosterEntry.createMany({ data: entries, skipDuplicates: true }).catch(() => null);
      console.log(`  Duty roster: 1 published (${rosterEmpIds.length} employees × 7 days)`);
    }
  }

  // ── LOGGED-IN ADMIN (e.g. Ashwin) PERSONAL DATA ──
  // The signed-in admin (SEED_ADMIN_ID) usually isn't part of the demo employee
  // set, so their own "My …" self-service views would be empty. Seed personal
  // data for them so every self-service page has content. Per-subject guards
  // keep it idempotent.
  const meId = ADMIN;
  const meExists = await prisma.employee.findFirst({ where: { id: meId, orgId: TENANT, deletedAt: null }, select: { id: true } });
  if (meExists && meId !== adminEmpId) {
    // Delegations — one I own (My Delegations) + one delegated to me.
    if ((await prisma.delegation.count({ where: { orgId: TENANT, OR: [{ delegatorId: meId }, { delegateeId: meId }] } })) === 0) {
      await prisma.delegation.create({ data: { orgId: TENANT, delegatorId: meId, delegateeId: active[2].id, type: "DelegationTemporary", modules: [{ module: "Leave", permissions: ["hrms.leave.approve"] }, { module: "Expense", permissions: ["hrms.expense.approve"] }], fromDate: daysAhead(1), toDate: daysAhead(7), notifyMode: "NotifyBoth", description: "On leave next week — delegating approvals", isActive: true, createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
      await prisma.delegation.create({ data: { orgId: TENANT, delegatorId: active[1].id, delegateeId: meId, type: "DelegationTemporary", modules: [{ module: "Leave", permissions: ["hrms.leave.approve"] }], fromDate: daysAgo(2), toDate: daysAhead(5), notifyMode: "NotifyBoth", description: "HRBP offsite — approvals delegated to you", isActive: true, createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    }
    // Leave balances + a couple of requests.
    for (const lt of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: { orgId_employeeId_leaveTypeId_year: { orgId: TENANT, employeeId: meId, leaveTypeId: lt.id, year } },
        create: { orgId: TENANT, employeeId: meId, leaveTypeId: lt.id, year, opening: lt.maxBalance, accrued: 0, taken: 0, createdBy: ADMIN, updatedBy: ADMIN },
        update: {},
      });
    }
    if ((await prisma.leaveRequest.count({ where: { orgId: TENANT, employeeId: meId } })) === 0) {
      await prisma.leaveRequest.create({ data: { orgId: TENANT, employeeId: meId, leaveTypeId: clType.id, startDate: daysAhead(4), endDate: daysAhead(5), duration: 2, reason: "Short vacation", status: "Pending", createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
      await prisma.leaveRequest.create({ data: { orgId: TENANT, employeeId: meId, leaveTypeId: slType.id, startDate: daysAgo(12), endDate: daysAgo(12), duration: 1, reason: "Fever", status: "Approved", createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    }
    // Shift + attendance (last 7 days).
    await prisma.shiftAssignment.create({ data: { orgId: TENANT, employeeId: meId, shiftId: shift.id, effectiveFrom: daysAgo(365), createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    for (let i = 0; i < 7; i++) {
      const date = daysAgo(i); const dow = date.getDay(); if (dow === 0 || dow === 6) continue;
      const ci = new Date(date); ci.setHours(9, 12); const co = new Date(date); co.setHours(18, 20);
      const hrs = (co.getTime() - ci.getTime()) / 3600000;
      await prisma.attendanceRecord.upsert({
        where: { orgId_employeeId_date: { orgId: TENANT, employeeId: meId, date } },
        create: { orgId: TENANT, employeeId: meId, date, checkIn: ci, checkOut: co, grossHours: Math.round(hrs * 100) / 100, effectiveHours: Math.round((hrs - 1) * 100) / 100, status: "Present", source: "Web", createdBy: ADMIN, updatedBy: ADMIN },
        update: {},
      });
    }
    // WFH.
    if ((await prisma.wfhRequest.count({ where: { orgId: TENANT, employeeId: meId } })) === 0) {
      await prisma.wfhRequest.create({ data: { orgId: TENANT, employeeId: meId, startDate: daysAhead(2), endDate: daysAhead(2), days: 1, isHalfDay: false, session: "FullDay", reason: "Focused work day", status: "Pending", createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    }
    // Expense claim.
    if ((await prisma.expenseClaim.count({ where: { orgId: TENANT, employeeId: meId } })) === 0) {
      await prisma.expenseClaim.create({ data: { orgId: TENANT, employeeId: meId, category: "Travel", title: "Conference travel — Bangalore", totalAmount: 9800, currency: "INR", status: "Submitted", description: "Flights + cab for the HR tech conference", expenseDate: daysAgo(6), createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    }
    // Tasks.
    if ((await prisma.task.count({ where: { orgId: TENANT, assigneeId: meId } })) === 0) {
      await prisma.task.create({ data: { orgId: TENANT, title: "Approve pending requisitions", assigneeId: meId, requesterId: meId, dueDate: daysAhead(1), priority: "Urgent", status: "Open", createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
      await prisma.task.create({ data: { orgId: TENANT, title: "Review Q2 headcount plan", assigneeId: meId, requesterId: meId, dueDate: daysAhead(4), priority: "High", status: "InProgress", createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    }
    // Timesheet.
    if ((await prisma.timesheet.count({ where: { orgId: TENANT, employeeId: meId } })) === 0) {
      await prisma.timesheet.create({ data: { orgId: TENANT, employeeId: meId, periodType: "Weekly", periodStart: daysAgo(7), periodEnd: daysAgo(1), totalHours: 40, billableHours: 30, status: "TsSubmitted", createdBy: ADMIN, updatedBy: ADMIN } }).catch(() => null);
    }
    // Notifications.
    if ((await prisma.hrmsNotification.count({ where: { orgId: TENANT, employeeId: meId } })) === 0) {
      await prisma.hrmsNotification.createMany({ data: [
        { orgId: TENANT, employeeId: meId, type: "Action" as const, channel: "InApp" as const, title: "2 requisitions need your approval", message: "Senior Data Engineer and Customer Success Lead are awaiting your approval.", link: "/recruit/approvals" },
        { orgId: TENANT, employeeId: meId, type: "Info" as const, channel: "InApp" as const, title: "Welcome to QuikHRMS", message: "Your workspace is set up and ready to go.", link: "/dashboard" },
      ] }).catch(() => null);
    }
    // Payslip in the most recent pay run.
    const lastRun = await prisma.payRun.findFirst({ where: { orgId: TENANT }, orderBy: { createdAt: "desc" }, select: { id: true, periodStart: true, periodEnd: true } });
    if (lastRun && (await prisma.payslip.count({ where: { orgId: TENANT, employeeId: meId } })) === 0) {
      await prisma.payslip.create({ data: { orgId: TENANT, payRunId: lastRun.id, employeeId: meId, periodStart: lastRun.periodStart, periodEnd: lastRun.periodEnd, workingDays: 22, paidDays: 22, lopDays: 0, grossEarnings: 100000, totalDeductions: 12000, netPay: 88000, currency: "INR", status: "Released" } }).catch(() => null);
    }
    console.log("  Admin personal data (delegations, leave, attendance, wfh, expense, tasks, timesheet, notifications, payslip)");
  }

  console.log("✅ Seed complete.\n");
  console.log("Test Users (x-user-id header):");
  console.log(`  user_dev_001  →  Gourav Chandel (Admin / CEO)`);
  employees.slice(1, 6).forEach((e) => {
    console.log(`  ${e.id}  →  ${e.firstName} ${e.lastName} (${e.jobTitle})`);
  });
}

async function dedupe(table: string, keyCols: string[]) {
  const tableName = table.charAt(0).toUpperCase() + table.slice(1);
  const partition = keyCols.map((c) => `"${c}"`).join(", ");
  const sql = `
    DELETE FROM "${tableName}" a
    USING (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY ${partition} ORDER BY "createdAt" ASC) AS rn
      FROM "${tableName}" WHERE "deletedAt" IS NULL
    ) dups
    WHERE a.id = dups.id AND dups.rn > 1
  `;
  try {
    const result = await prisma.$executeRawUnsafe(sql);
    if (result > 0) console.log(`    ${tableName}: removed ${result} duplicates`);
  } catch (e) {
    console.warn(`    ${tableName} dedupe skipped:`, e instanceof Error ? e.message : e);
  }
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); });
