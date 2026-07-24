import { prisma } from "@/lib/prisma";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildTaskAssignedActionEmail } from "@/lib/email-templates/task-assigned-action";
import { EMAIL_EVENT_MAP } from "@/lib/email/registry";
import { emailShell, hero, para, esc } from "@/lib/email-templates/_base";
import { getResignationLetterAttachment } from "@/lib/services/resignation-letter";
import { getExitLetterAttachment } from "@/lib/services/exit-letters";
import { generateDocUploadToken } from "@/lib/services/doc-upload-token";
import { buildPolicyAckRequestEmail } from "@/lib/email-templates/policy-ack-request";

// ── "Start offboarding" completion-chained automation (mirrors onboarding) ────
// Offboarding tasks carry stepType/config in raw columns (not the generated
// client), so this service reads/writes them via raw SQL.

const ACTION_STEP_TYPES = new Set(["CustomTask", "AssetReturn", "AccessRevoke", "KnowledgeTransfer", "Clearance"]);
const RESIGNATION_LETTER_KEY = "offboarding.resignation-acceptance";
const RELIEVING_LETTER_KEY = "offboarding.relieving-letter";
const EXPERIENCE_LETTER_KEY = "offboarding.experience-letter";
const appBase = () => process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";

type TaskRow = { id: string; instanceId: string; title: string; status: string; stepType: string | null; config: Record<string, unknown> | null };

function cfgOf(t: TaskRow): Record<string, unknown> {
  return (t.config ?? {}) as Record<string, unknown>;
}
function resolveAssignees(cfg: Record<string, unknown>): string[] {
  if (cfg.assignDepartmentId === "__candidate__") return [];
  const list = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : [];
  if (list.length) return list;
  return cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : [];
}
function actionDetail(stepType: string | null, cfg: Record<string, unknown>): string | undefined {
  const st = stepType ?? "CustomTask";
  if (st === "AssetReturn") {
    const list = Array.isArray(cfg.assets) ? (cfg.assets as { type: string; qty?: number; custom?: string }[]) : [];
    if (list.length) return list.map((a) => `${a.type === "Custom" ? (a.custom?.trim() || "Custom") : a.type} ×${a.qty || 1}`).join(", ");
  }
  if (st === "AccessRevoke") {
    const list = Array.isArray(cfg.systems) ? (cfg.systems as string[]) : [];
    const other = typeof cfg.otherSystems === "string" ? cfg.otherSystems.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const all = [...list, ...other];
    if (all.length) return all.join(", ");
  }
  return undefined;
}

export function isSendableStep(t: TaskRow): boolean {
  const st = t.stepType ?? "CustomTask";
  const cfg = cfgOf(t);
  if (st === "SendEmail") return Array.isArray(cfg.templates) && (cfg.templates as unknown[]).filter(Boolean).length > 0;
  if (st === "ReadPolicy") return Array.isArray(cfg.files) && (cfg.files as unknown[]).length > 0;
  if (ACTION_STEP_TYPES.has(st)) return resolveAssignees(cfg).length > 0;
  return false;
}

async function loadTasks(instanceId: string, orgId: string): Promise<TaskRow[]> {
  return prisma.$queryRaw<TaskRow[]>`
    SELECT id, "instanceId", title, status, "stepType", config
    FROM "app_quikhrms"."OffboardingTask"
    WHERE "instanceId" = ${instanceId} AND "orgId" = ${orgId}
    ORDER BY "sortOrder" ASC, "createdAt" ASC`;
}

async function setConfig(taskId: string, cfg: Record<string, unknown>) {
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."OffboardingTask" SET config = ${JSON.stringify(cfg)}::jsonb WHERE id = ${taskId}`;
}
async function markSent(taskId: string, cfg: Record<string, unknown>) {
  await prisma.offboardingTask.update({ where: { id: taskId }, data: { status: "TaskInProgress" } });
  await setConfig(taskId, { ...cfg, requestSentAt: new Date().toISOString() });
}

function genericExitEmail(label: string, employeeName: string, companyName: string) {
  const body = hero({ emoji: "✉️", title: label, subtitle: companyName, accent: "green" }) +
    para(`Hi <strong>${esc(employeeName)}</strong>,`) +
    para(`Please find the information regarding <strong>${esc(label)}</strong> below. Your HR team will follow up with any details.`);
  return { subject: `${label} — ${companyName}`, html: emailShell({ accent: "green", companyName, preheader: label, body }) };
}

/** Send every template selected on a Send Email step to the exiting employee. */
export async function sendStepEmails(t: TaskRow, orgId: string): Promise<number> {
  const cfg = cfgOf(t);
  const keys = Array.isArray(cfg.templates) ? (cfg.templates as string[]).filter(Boolean) : [];
  if (!keys.length) return 0;

  const inst = await prisma.offboardingInstance.findFirst({ where: { id: t.instanceId, orgId }, select: { employeeId: true } });
  if (!inst) return 0;
  const [emp, company] = await Promise.all([
    prisma.employee.findFirst({ where: { id: inst.employeeId, orgId, deletedAt: null }, select: { firstName: true, lastName: true, workEmail: true, personalEmail: true } }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
  ]);
  const to = emp?.personalEmail || emp?.workEmail;
  if (!emp || !to) return 0;
  const companyName = company?.companyName ?? "Our Company";
  const employeeName = `${emp.firstName} ${emp.lastName}`.trim();

  let sent = 0;
  for (const key of keys) {
    // Generated-PDF letters (resignation acceptance / relieving / experience).
    const pdfLetter =
      key === RESIGNATION_LETTER_KEY ? { title: "Resignation Acceptance Letter", get: () => getResignationLetterAttachment(orgId, inst.employeeId) }
      : key === RELIEVING_LETTER_KEY ? { title: "Relieving Letter", get: () => getExitLetterAttachment(orgId, inst.employeeId, "relieving") }
      : key === EXPERIENCE_LETTER_KEY ? { title: "Experience Letter", get: () => getExitLetterAttachment(orgId, inst.employeeId, "experience") }
      : null;
    if (pdfLetter) {
      const att = await pdfLetter.get().catch(() => null);
      const res = await resolveAndSend(orgId, {
        key, to, vars: { employeeName, companyName }, attachments: att ? [att] : undefined,
        fallback: () => {
          const body = hero({ emoji: "📄", title: pdfLetter.title, subtitle: companyName, accent: "green" }) +
            para(`Hi <strong>${esc(employeeName)}</strong>,`) +
            para(`Please find your ${esc(pdfLetter.title.toLowerCase())} attached${att ? "" : " shortly"}.`);
          return { subject: `${pdfLetter.title} — ${companyName}`, html: emailShell({ accent: "green", companyName, preheader: pdfLetter.title, body }) };
        },
      });
      if (res.sent) sent++;
      continue;
    }
    const label = EMAIL_EVENT_MAP[key]?.label ?? key;
    const res = await resolveAndSend(orgId, { key, to, vars: { employeeName, companyName }, fallback: () => genericExitEmail(label, employeeName, companyName) });
    if (res.sent) sent++;
  }
  return sent;
}

/** Returns true only when the step is now complete (Send Email fires instantly). */
export async function sendStepRequest(t: TaskRow, orgId: string): Promise<boolean> {
  const st = t.stepType ?? "CustomTask";
  const cfg = cfgOf(t);

  if (st === "SendEmail") {
    const n = await sendStepEmails(t, orgId);
    if (n <= 0) return false;
    await prisma.offboardingTask.update({ where: { id: t.id }, data: { status: "TaskCompleted", completedAt: new Date() } });
    await setConfig(t.id, { ...cfg, requestSentAt: new Date().toISOString() });
    return true;
  }

  if (st === "ReadPolicy") {
    const files = Array.isArray(cfg.files) ? (cfg.files as { url: string; fileName: string }[]).filter((f) => f && f.url) : [];
    if (!files.length) return false;
    const inst = await prisma.offboardingInstance.findFirst({ where: { id: t.instanceId, orgId }, select: { employeeId: true } });
    const [emp, company] = await Promise.all([
      inst ? prisma.employee.findFirst({ where: { id: inst.employeeId, orgId }, select: { firstName: true, lastName: true, workEmail: true, personalEmail: true } }) : Promise.resolve(null),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    ]);
    const to = emp?.workEmail || emp?.personalEmail;
    if (!to) return false;
    const { token } = generateDocUploadToken(t.id, orgId);
    const link = `${appBase()}/exit-ack/${token}`;
    const candidateName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "there";
    const companyName = company?.companyName ?? "Our Company";
    await resolveAndSend(orgId, {
      key: "onboarding.policy-ack-request", to, vars: { candidateName, companyName },
      fallback: () => buildPolicyAckRequestEmail({ candidateName, companyName, files: files.map((f) => f.fileName), link }),
    });
    await markSent(t.id, cfg);
    return false; // wait for the employee to acknowledge
  }

  if (ACTION_STEP_TYPES.has(st)) {
    const ids = resolveAssignees(cfg);
    if (!ids.length) return false;
    const inst = await prisma.offboardingInstance.findFirst({ where: { id: t.instanceId, orgId }, select: { employeeId: true } });
    const [emps, company, hire] = await Promise.all([
      prisma.employee.findMany({ where: { orgId, id: { in: ids }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, workEmail: true } }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
      inst ? prisma.employee.findFirst({ where: { id: inst.employeeId, orgId }, select: { firstName: true, lastName: true } }) : Promise.resolve(null),
    ]);
    const companyName = company?.companyName ?? "Our Company";
    const newHireName = hire ? `${hire.firstName} ${hire.lastName}`.trim() : "the departing employee";
    const appLink = `${appBase()}/offboarding/${inst?.employeeId ?? ""}`;
    const detail = actionDetail(t.stepType, cfg);
    let sent = false;
    for (const e of emps) {
      if (!e.workEmail) continue;
      const assigneeName = `${e.firstName} ${e.lastName}`.trim();
      await resolveAndSend(orgId, {
        key: "onboarding.task-assigned",
        to: e.workEmail,
        vars: { assigneeName, companyName, newHireName },
        // Internal assignees log in and mark done in the app — the "Mark as done"
        // button opens the offboarding page (no public one-click link needed).
        fallback: () => buildTaskAssignedActionEmail({ assigneeName, companyName, newHireName, taskTitle: t.title, detail, doneLink: appLink, appLink }),
      });
      sent = true;
    }
    if (sent) await markSent(t.id, cfg);
    return false;
  }

  return false;
}

export async function isAutomated(instanceId: string, orgId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ automated: boolean }[]>`
    SELECT "automated" FROM "app_quikhrms"."OffboardingInstance" WHERE id = ${instanceId} AND "orgId" = ${orgId} LIMIT 1`;
  return !!rows[0]?.automated;
}
export async function setAutomated(instanceId: string, orgId: string, value: boolean): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."OffboardingInstance" SET "automated" = ${value} WHERE id = ${instanceId} AND "orgId" = ${orgId}`;
}

export async function advanceAutomation(instanceId: string, orgId: string): Promise<void> {
  try {
    if (!(await isAutomated(instanceId, orgId))) return;
    for (let i = 0; i < 25; i++) {
      const tasks = await loadTasks(instanceId, orgId);
      const next = tasks.find((t) => isSendableStep(t) && t.status !== "TaskCompleted" && t.status !== "TaskSkipped");
      if (!next) return;
      if (cfgOf(next).requestSentAt) return; // already sent — waiting for completion
      const autoCompleted = await sendStepRequest(next, orgId);
      if (!autoCompleted) return;
    }
  } catch (e) {
    console.error("offboarding advanceAutomation failed:", e);
  }
}
