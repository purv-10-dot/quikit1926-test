import { prisma } from "@/lib/prisma";
import type { ReportDefinition } from "../types";
import { fmtDate, fullName, num } from "../format";
import { employeeBasics } from "../payroll-data";

// instanceId → employeeId for onboarding/offboarding task joins.
async function onboardingInstanceEmp(orgId: string, instanceIds: string[]) {
  const insts = await prisma.onboardingInstance.findMany({ where: { orgId, id: { in: [...new Set(instanceIds)] } }, select: { id: true, employeeId: true } });
  return new Map(insts.map((i) => [i.id, i.employeeId]));
}
async function offboardingInstanceEmp(orgId: string, instanceIds: string[]) {
  const insts = await prisma.offboardingInstance.findMany({ where: { orgId, id: { in: [...new Set(instanceIds)] } }, select: { id: true, employeeId: true } });
  return new Map(insts.map((i) => [i.id, i.employeeId]));
}

export const lifecycleReports: ReportDefinition[] = [
  {
    key: "onboarding-status",
    label: "Onboarding Status",
    description: "Onboarding progress per employee with task completion counts.",
    category: "Lifecycle",
    async run({ orgId }) {
      const instances = await prisma.onboardingInstance.findMany({ where: { orgId, deletedAt: null }, orderBy: { startDate: "desc" } });
      const empMap = await employeeBasics(orgId, instances.map((i) => i.employeeId));
      const tasks = instances.length ? await prisma.onboardingTask.findMany({ where: { orgId, instanceId: { in: instances.map((i) => i.id) } }, select: { instanceId: true, status: true } }) : [];
      const counts = new Map<string, { total: number; done: number }>();
      for (const t of tasks) {
        const c = counts.get(t.instanceId) ?? { total: 0, done: 0 };
        c.total++; if (t.status === "TaskCompleted") c.done++;
        counts.set(t.instanceId, c);
      }
      return {
        title: "Onboarding Status",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "startDate", label: "Start Date", width: 12 },
          { key: "status", label: "Status", width: 14 },
          { key: "tasks", label: "Tasks Done", width: 12 },
          { key: "completedAt", label: "Completed On", width: 14 },
        ],
        rows: instances.map((i) => {
          const e = empMap.get(i.employeeId);
          const c = counts.get(i.id) ?? { total: 0, done: 0 };
          return { code: e?.employeeCode ?? "", name: fullName(e), department: e?.department?.name ?? "", startDate: fmtDate(i.startDate), status: i.status, tasks: `${c.done}/${c.total}`, completedAt: fmtDate(i.completedAt) };
        }),
      };
    },
  },
  {
    key: "provisioning",
    label: "Provisioning (IT / Access Setup)",
    description: "IT-setup onboarding tasks and their completion status for new hires.",
    category: "Lifecycle",
    async run({ orgId }) {
      const tasks = await prisma.onboardingTask.findMany({ where: { orgId, category: "ItSetup" }, orderBy: { dueDate: "asc" }, take: 10000 });
      const instEmp = await onboardingInstanceEmp(orgId, tasks.map((t) => t.instanceId));
      const empMap = await employeeBasics(orgId, [...instEmp.values()]);
      return {
        title: "Provisioning (IT / Access Setup)",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "task", label: "Provisioning Task", width: 30 },
          { key: "dueDate", label: "Due Date", width: 12 },
          { key: "status", label: "Status", width: 14 },
        ],
        rows: tasks.map((t) => {
          const e = empMap.get(instEmp.get(t.instanceId) ?? "");
          return { code: e?.employeeCode ?? "", name: fullName(e), task: t.title, dueDate: fmtDate(t.dueDate), status: t.status };
        }),
      };
    },
  },
  {
    key: "exit-offboarding",
    label: "Exit / Offboarding",
    description: "Employees in exit process: resignation, last working date, reason and exit-interview status.",
    category: "Lifecycle",
    async run({ orgId }) {
      const insts = await prisma.offboardingInstance.findMany({ where: { orgId, deletedAt: null }, orderBy: { lastWorkingDate: "desc" } });
      const empMap = await employeeBasics(orgId, insts.map((i) => i.employeeId));
      return {
        title: "Exit / Offboarding",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "department", label: "Department", width: 18 },
          { key: "resignationDate", label: "Resignation", width: 14 },
          { key: "lastWorkingDate", label: "Last Working Day", width: 16 },
          { key: "reason", label: "Reason", width: 16 },
          { key: "status", label: "Status", width: 16 },
          { key: "exitInterview", label: "Exit Interview", width: 14 },
        ],
        rows: insts.map((i) => {
          const e = empMap.get(i.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), department: e?.department?.name ?? "",
            resignationDate: fmtDate(i.resignationDate), lastWorkingDate: fmtDate(i.lastWorkingDate), reason: i.reason, status: i.status,
            exitInterview: i.exitInterviewDone ? `Done ${fmtDate(i.exitInterviewAt)}` : "Pending",
          };
        }),
      };
    },
  },
  {
    key: "fnf-settlement",
    label: "Full & Final Settlement",
    description: "FNF settlement components and net payable per exiting employee.",
    category: "Lifecycle",
    async run({ orgId }) {
      const fnfs = await prisma.fullAndFinalSettlement.findMany({ where: { orgId, deletedAt: null }, orderBy: { lastWorkingDate: "desc" } });
      const empMap = await employeeBasics(orgId, fnfs.map((f) => f.employeeId));
      return {
        title: "Full & Final Settlement",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 20 },
          { key: "lwd", label: "Last Working Day", width: 16 },
          { key: "pendingSalary", label: "Pending Salary", width: 14, money: true },
          { key: "leaveEncash", label: "Leave Encash", width: 14, money: true },
          { key: "gratuity", label: "Gratuity", width: 12, money: true },
          { key: "loanRecovery", label: "Loan Recovery", width: 14, money: true },
          { key: "tds", label: "TDS", width: 12, money: true },
          { key: "net", label: "Net Settlement", width: 16, money: true },
          { key: "status", label: "Status", width: 12 },
        ],
        rows: fnfs.map((f) => {
          const e = empMap.get(f.employeeId);
          return {
            code: e?.employeeCode ?? "", name: fullName(e), lwd: fmtDate(f.lastWorkingDate),
            pendingSalary: num(f.pendingSalary), leaveEncash: num(f.leaveEncashment), gratuity: num(f.gratuityAmount),
            loanRecovery: num(f.loanRecovery), tds: num(f.tdsDeducted), net: num(f.netSettlement), status: f.status,
          };
        }),
      };
    },
  },
  {
    key: "exit-clearance",
    label: "Exit Clearance Status",
    description: "Offboarding clearance tasks (assets, access, KT) and their status.",
    category: "Lifecycle",
    async run({ orgId }) {
      const tasks = await prisma.offboardingTask.findMany({ where: { orgId }, orderBy: { createdAt: "desc" }, take: 10000 });
      const instEmp = await offboardingInstanceEmp(orgId, tasks.map((t) => t.instanceId));
      const empMap = await employeeBasics(orgId, [...instEmp.values()]);
      return {
        title: "Exit Clearance Status",
        columns: [
          { key: "code", label: "Emp Code", width: 12 },
          { key: "name", label: "Name", width: 22 },
          { key: "task", label: "Clearance Task", width: 28 },
          { key: "category", label: "Category", width: 16 },
          { key: "status", label: "Status", width: 14 },
          { key: "completedAt", label: "Completed On", width: 14 },
        ],
        rows: tasks.map((t) => {
          const e = empMap.get(instEmp.get(t.instanceId) ?? "");
          return { code: e?.employeeCode ?? "", name: fullName(e), task: t.title, category: t.category, status: t.status, completedAt: fmtDate(t.completedAt) };
        }),
      };
    },
  },
];
