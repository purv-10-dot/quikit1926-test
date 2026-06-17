import { PrismaClient } from "@quikit/database";
import pg from "pg";
import "dotenv/config";
import { PERMISSIONS, DEFAULT_ROLES } from "../lib/rbac/permissions";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient();
const TENANT = "tenant_dev_001";
const ADMIN = "user_dev_001";
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
    { empIdx: 2, title: "Launch mobile onboarding v2", type: "Team" as const, category: "Project" as const, target: 100, unit: "%", weight: 30 },
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
      name: "Asset Request Approval",
      module: "Asset" as const,
      levels: [
        { level: 1, approverType: "ReportingManager", escalateAfterHours: 24, allowSkip: false },
        { level: 2, approverType: "HR",               escalateAfterHours: 48, allowSkip: false },
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


  // ── TICKETS: Categories + Sample Tickets ────────
  console.log("  Ticket categories...");
  // Categories mirror real departments (one-to-one).
  const ticketCategorySeed = departments.map((d) => ({
    slug: d.code.toLowerCase(),
    name: d.name,
    description: `${d.name} department tickets`,
    slaResponseHours: 8,
    slaResolveHours: 48,
    departmentId: d.id,
  }));

  // Default assignee per category = first employee in that department.
  const firstEmpByDept = new Map<string, string>();
  for (const e of employees) {
    if (e.departmentId && !firstEmpByDept.has(e.departmentId)) {
      firstEmpByDept.set(e.departmentId, e.id);
    }
  }
  const ticketCategories: Array<Awaited<ReturnType<typeof prisma.ticketCategory.create>>> = [];

  for (const c of ticketCategorySeed) {
    const existing = await prisma.ticketCategory.findFirst({
      where: { orgId: TENANT, slug: c.slug, deletedAt: null },
    });
    const targetAssignee = firstEmpByDept.get(c.departmentId) ?? employees[0]?.id ?? null;
    if (existing) {
      const updated = await prisma.ticketCategory.update({
        where: { id: existing.id },
        data: {
          name: c.name,
          description: c.description,
          departmentId: c.departmentId,
          defaultAssigneeId: targetAssignee,
        },
      });
      ticketCategories.push(updated);
      continue;
    }
    const created = await prisma.ticketCategory.create({
      data: {
        orgId: TENANT,
        ...c,
        defaultAssigneeId: targetAssignee,
        isActive: true,
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });
    ticketCategories.push(created);
  }
  console.log(`    Ticket Categories: ${ticketCategories.length}`);

  // Sample tickets (slugs map to department codes lowercased)
  const sampleTickets = [
    {
      slug: "ops",
      title: "Laptop running slow",
      description: "My work laptop has been very slow since yesterday, especially when opening Chrome.",
      priority: "High" as const,
      status: "Open" as const,
      raiserIdx: 1,
    },
    {
      slug: "hr",
      title: "Question about leave policy",
      description: "How many casual leaves do I have remaining for this quarter?",
      priority: "Low" as const,
      status: "InProgress" as const,
      raiserIdx: 2,
    },
    {
      slug: "fin",
      title: "Payslip not received for April",
      description: "I have not received my April 2026 payslip on email yet.",
      priority: "Medium" as const,
      status: "Open" as const,
      raiserIdx: 3,
    },
    {
      slug: "ops",
      title: "Need new ID card",
      description: "Lost my office ID card. Need replacement.",
      priority: "Medium" as const,
      status: "Resolved" as const,
      raiserIdx: 4,
    },
    {
      slug: "ops",
      title: "VPN access not working",
      description: "Unable to connect to VPN from home since last night.",
      priority: "Urgent" as const,
      status: "InProgress" as const,
      raiserIdx: 5,
    },
  ];

  let ticketSeedCount = 0;
  let seqCounter = 1;
  const ticketYear = new Date().getFullYear();

  for (const t of sampleTickets) {
    const cat = ticketCategories.find((c) => c.slug === t.slug);
    const raiser = employees[t.raiserIdx];
    if (!cat || !raiser) continue;

    const ticketNo = `TKT-${ticketYear}-${String(seqCounter).padStart(4, "0")}`;
    seqCounter++;

    const existing = await prisma.ticket.findFirst({
      where: { orgId: TENANT, ticketNo },
    });
    if (existing) {
      await prisma.ticket.update({
        where: { id: existing.id },
        data: { assignedToId: cat.defaultAssigneeId },
      });
      continue;
    }

    const now = new Date();
    const slaResponseDueAt = new Date(now.getTime() + cat.slaResponseHours * 3600 * 1000);
    const slaResolveDueAt = new Date(now.getTime() + cat.slaResolveHours * 3600 * 1000);

    const ticket = await prisma.ticket.create({
      data: {
        orgId: TENANT,
        ticketNo,
        title: t.title,
        description: t.description,
        categoryId: cat.id,
        priority: t.priority,
        status: t.status,
        source: "Web",
        raisedById: raiser.id,
        assignedToId: cat.defaultAssigneeId,
        slaResponseDueAt,
        slaResolveDueAt,
        firstResponseAt: t.status !== "Open" ? now : null,
        resolvedAt: t.status === "Resolved" ? now : null,
        createdBy: ADMIN,
        updatedBy: ADMIN,
      },
    });

    await prisma.ticketActivity.create({
      data: {
        orgId: TENANT,
        ticketId: ticket.id,
        actorId: raiser.id,
        action: "Created",
        toVal: ticket.status,
      },
    });

    ticketSeedCount++;
  }
  console.log(`    Sample Tickets: ${ticketSeedCount}`);

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
