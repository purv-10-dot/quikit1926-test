import { prisma } from "@/lib/prisma";
import { generateDocUploadToken } from "@/lib/services/doc-upload-token";
import { generateTaskActionToken } from "@/lib/services/task-action-token";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildDocUploadRequestEmail } from "@/lib/email-templates/doc-upload-request";
import { buildPolicyAckRequestEmail } from "@/lib/email-templates/policy-ack-request";
import { buildTaskAssignedActionEmail } from "@/lib/email-templates/task-assigned-action";
import { buildWelcomeEmail } from "@/lib/email-templates/welcome";
import { EMAIL_EVENT_MAP } from "@/lib/email/registry";
import { emailShell, hero, para, esc } from "@/lib/email-templates/_base";
import { getJoiningLetterAttachment } from "@/lib/services/joining-letter";
import { appBaseUrl } from "@/lib/utils/app-url";

// Synthetic template key for the joining-letter PDF (not a registry email event —
// it's a generated PDF sent as an attachment with a short cover email).
const JOINING_LETTER_KEY = "onboarding.joining-letter";

// ── "Start onboarding" completion-chained automation ──────────────────────────
// When an instance is `automated`, sending advances step-by-step: the next
// SENDABLE step's request goes out, and when a step completes the chain fires
// the next one. Manual steps (Complete Profile, no-assignee tasks) don't block
// the chain — HR does those independently.

const ACTION_STEP_TYPES = new Set(["CustomTask", "AssetAssignment", "ITProvisioning"]);
const appBase = () => appBaseUrl();

type TaskRow = { id: string; instanceId: string; title: string; status: string; stepType: string | null; config: unknown };

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
  if (st === "AssetAssignment") {
    const list = Array.isArray(cfg.assets) ? (cfg.assets as { type: string; qty?: number; custom?: string }[]) : [];
    if (list.length) return list.map((a) => `${a.type === "Custom" ? (a.custom?.trim() || "Custom") : a.type} ×${a.qty || 1}`).join(", ");
    return [cfg.asset, cfg.quantity ? `×${cfg.quantity}` : ""].filter(Boolean).join(" ").trim() || undefined;
  }
  if (st === "ITProvisioning") {
    const list = Array.isArray(cfg.systems) ? (cfg.systems as string[]) : [];
    const other = typeof cfg.otherSystems === "string" ? cfg.otherSystems.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const all = [...list, ...other];
    return all.length ? all.join(", ") : undefined;
  }
  return undefined;
}

/** Can automation email this step out on its own? */
function isSendableStep(t: TaskRow): boolean {
  const st = t.stepType ?? "CustomTask";
  const cfg = cfgOf(t);
  if (st === "DocumentUpload") return Array.isArray(cfg.documents) && (cfg.documents as unknown[]).filter(Boolean).length > 0;
  if (st === "ReadPolicy") return Array.isArray(cfg.files) && (cfg.files as unknown[]).length > 0;
  if (st === "SendEmail") return (Array.isArray(cfg.templates) && (cfg.templates as unknown[]).filter(Boolean).length > 0) || !!cfg.template;
  if (ACTION_STEP_TYPES.has(st)) return resolveAssignees(cfg).length > 0;
  return false;
}

async function markSent(taskId: string, cfg: Record<string, unknown>) {
  await prisma.onboardingTask.update({
    where: { id: taskId },
    data: { status: "TaskInProgress", config: JSON.parse(JSON.stringify({ ...cfg, requestSentAt: new Date().toISOString() })) },
  });
}

// Selected email template keys for a Send Email step (falls back to legacy single `template`).
function templateKeys(cfg: Record<string, unknown>): string[] {
  if (Array.isArray(cfg.templates)) return (cfg.templates as string[]).filter(Boolean);
  return cfg.template ? [cfg.template as string] : [];
}
function genericTemplateEmail(label: string, employeeName: string, companyName: string) {
  const body = hero({ emoji: "✉️", title: label, subtitle: companyName, accent: "green" }) +
    para(`Hi <strong>${esc(employeeName)}</strong>,`) +
    para(`Please find the information regarding <strong>${esc(label)}</strong> below. Your HR team will follow up with any details.`);
  return { subject: `${label} — ${companyName}`, html: emailShell({ accent: "green", companyName, preheader: label, body }) };
}

/**
 * Send EVERY template selected on a Send Email step to the new hire. Uses the
 * org's customized version when saved (via resolveAndSend); otherwise the branded
 * default (welcome builder for the welcome key, a generic branded email otherwise).
 * Returns how many were sent.
 */
export async function sendStepEmails(t: TaskRow, orgId: string): Promise<number> {
  const cfg = cfgOf(t);
  const keys = templateKeys(cfg);
  if (!keys.length) return 0;
  const cc = typeof cfg.cc === "string" && cfg.cc.trim() ? cfg.cc.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  const instance = await prisma.onboardingInstance.findFirst({ where: { id: t.instanceId, orgId }, select: { employeeId: true } });
  if (!instance) return 0;
  const emp = await prisma.employee.findFirst({
    where: { id: instance.employeeId, orgId, deletedAt: null },
    select: { firstName: true, lastName: true, workEmail: true, personalEmail: true, employeeCode: true, jobTitle: true, dateOfJoining: true, departmentId: true, reportingManagerId: true },
  });
  const to = emp?.personalEmail || emp?.workEmail;
  if (!emp || !to) return 0;
  const [company, dept, mgr] = await Promise.all([
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    emp.departmentId ? prisma.department.findFirst({ where: { id: emp.departmentId, orgId }, select: { name: true } }) : Promise.resolve(null),
    emp.reportingManagerId ? prisma.employee.findFirst({ where: { id: emp.reportingManagerId, orgId }, select: { firstName: true, lastName: true } }) : Promise.resolve(null),
  ]);
  const companyName = company?.companyName ?? "Our Company";
  const employeeName = `${emp.firstName} ${emp.lastName}`.trim();
  const doj = emp.dateOfJoining ? new Date(emp.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" }) : "";
  const managerName = mgr ? `${mgr.firstName} ${mgr.lastName}`.trim() : null;
  const vars = { employeeName, companyName, employeeCode: emp.employeeCode, jobTitle: emp.jobTitle ?? "", department: dept?.name ?? "", dateOfJoining: doj, managerName: managerName ?? "" };

  let sent = 0;
  for (const key of keys) {
    // Joining letter — generate the PDF and send it as an attachment with a cover note.
    if (key === JOINING_LETTER_KEY) {
      const att = await getJoiningLetterAttachment(orgId, instance.employeeId).catch(() => null);
      const res = await resolveAndSend(orgId, {
        key, to, cc, vars,
        attachments: att ? [att] : undefined,
        fallback: () => {
          const body = hero({ emoji: "📄", title: "Your Joining Letter", subtitle: companyName, accent: "green" }) +
            para(`Hi <strong>${esc(employeeName)}</strong>,`) +
            para(`Please find your joining (appointment) letter attached${att ? "" : " shortly"}. Welcome aboard!`);
          return { subject: `Your Joining Letter — ${companyName}`, html: emailShell({ accent: "green", companyName, preheader: "Your joining letter", body }) };
        },
      });
      if (res.sent) sent++;
      continue;
    }
    const label = EMAIL_EVENT_MAP[key]?.label ?? key;
    const res = await resolveAndSend(orgId, {
      key, to, cc, vars,
      fallback: () => key === "employee.welcome"
        ? buildWelcomeEmail({ employeeName, employeeCode: emp.employeeCode, jobTitle: emp.jobTitle, department: dept?.name ?? null, dateOfJoining: doj, managerName, companyName, portalUrl: undefined })
        : genericTemplateEmail(label, employeeName, companyName),
    });
    if (res.sent) sent++;
  }
  return sent;
}

/**
 * Send the step's request/email(s) for the automation chain.
 * Returns true only when the step is now COMPLETE (Send Email fires and finishes
 * instantly, so the chain continues); false when it sent but must wait for an
 * external completion (upload/ack/mark-done), or when nothing was sent.
 */
async function sendStepRequest(t: TaskRow, orgId: string): Promise<boolean> {
  const st = t.stepType ?? "CustomTask";
  const cfg = cfgOf(t);
  const instance = await prisma.onboardingInstance.findFirst({ where: { id: t.instanceId, orgId }, select: { employeeId: true } });
  if (!instance) return false;

  const [candidate, company] = await Promise.all([
    prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true, workEmail: true, personalEmail: true } }),
    prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
  ]);
  const companyName = company?.companyName ?? "Our Company";
  const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : "there";
  const candEmail = candidate?.workEmail || candidate?.personalEmail || null;

  if (st === "DocumentUpload") {
    const documents = Array.isArray(cfg.documents) ? (cfg.documents as string[]).filter(Boolean) : [];
    if (!documents.length || !candEmail) return false;
    const { token } = generateDocUploadToken(t.id, orgId);
    const link = `${appBase()}/doc-upload/${token}`;
    await resolveAndSend(orgId, { key: "onboarding.doc-upload-request", to: candEmail, vars: { candidateName, companyName }, fallback: () => buildDocUploadRequestEmail({ candidateName, companyName, documents, link }) });
    await markSent(t.id, cfg);
    return false; // wait for the candidate to upload
  }

  if (st === "ReadPolicy") {
    const files = Array.isArray(cfg.files) ? (cfg.files as { url: string; fileName: string }[]).filter((f) => f && f.url) : [];
    if (!files.length || !candEmail) return false;
    const { token } = generateDocUploadToken(t.id, orgId);
    const link = `${appBase()}/policy-ack/${token}`;
    await resolveAndSend(orgId, { key: "onboarding.policy-ack-request", to: candEmail, vars: { candidateName, companyName }, fallback: () => buildPolicyAckRequestEmail({ candidateName, companyName, files: files.map((f) => f.fileName), link }) });
    await markSent(t.id, cfg);
    return false; // wait for the candidate to acknowledge
  }

  if (st === "SendEmail") {
    // Fire all selected templates to the new hire — nothing to wait for, so the
    // step completes immediately and the chain moves on.
    const n = await sendStepEmails(t, orgId);
    if (n <= 0) return false;
    await prisma.onboardingTask.update({
      where: { id: t.id },
      data: { status: "TaskCompleted", completedAt: new Date(), config: JSON.parse(JSON.stringify({ ...cfg, requestSentAt: new Date().toISOString() })) },
    });
    return true; // auto-completed
  }

  if (ACTION_STEP_TYPES.has(st)) {
    const ids = resolveAssignees(cfg);
    if (!ids.length) return false;
    const emps = await prisma.employee.findMany({ where: { orgId, id: { in: ids }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, workEmail: true } });
    const appLink = `${appBase()}/onboarding/${instance.employeeId}`;
    const detail = actionDetail(t.stepType, cfg);
    let sent = false;
    for (const e of emps) {
      if (!e.workEmail) continue;
      const assigneeName = `${e.firstName} ${e.lastName}`.trim();
      const { token } = generateTaskActionToken(t.id, orgId, e.id);
      const doneLink = `${appBase()}/task-done/${token}`;
      await resolveAndSend(orgId, {
        key: "onboarding.task-assigned",
        to: e.workEmail,
        vars: { assigneeName, companyName, newHireName: candidateName },
        fallback: () => buildTaskAssignedActionEmail({ assigneeName, companyName, newHireName: candidateName, taskTitle: t.title, detail, doneLink, appLink }),
      });
      sent = true;
    }
    if (sent) await markSent(t.id, cfg);
    return false; // wait for an assignee to mark done
  }

  return false;
}

/** Read/write the `automated` flag via raw SQL (new column, not in the client). */
export async function isAutomated(instanceId: string, orgId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ automated: boolean }[]>`
    SELECT "automated" FROM "app_quikhrms"."OnboardingInstance" WHERE id = ${instanceId} AND "orgId" = ${orgId} LIMIT 1`;
  return !!rows[0]?.automated;
}
export async function setAutomated(instanceId: string, orgId: string, value: boolean): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "app_quikhrms"."OnboardingInstance" SET "automated" = ${value} WHERE id = ${instanceId} AND "orgId" = ${orgId}`;
}

/**
 * Advance the automation chain: if the instance is automated, send the next
 * sendable step whose earlier sendable steps are all done. No-op if the next
 * sendable step's request was already sent (waiting for it to complete) or if
 * there's nothing left to send. Safe to call after any completion.
 */
export async function advanceAutomation(instanceId: string, orgId: string): Promise<void> {
  try {
    if (!(await isAutomated(instanceId, orgId))) return;
    // Loop so an instant step (Send Email) that auto-completes immediately hands
    // off to the next one. Bounded to avoid any accidental runaway.
    for (let i = 0; i < 25; i++) {
      const tasks = (await prisma.onboardingTask.findMany({
        where: { instanceId, orgId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, instanceId: true, title: true, status: true, stepType: true, config: true },
      })) as TaskRow[];

      const next = tasks.find((t) => isSendableStep(t) && t.status !== "TaskCompleted" && t.status !== "TaskSkipped");
      if (!next) return;
      if (cfgOf(next).requestSentAt) return; // already sent — waiting for completion
      const autoCompleted = await sendStepRequest(next, orgId);
      if (!autoCompleted) return; // sent, now waiting for an external completion
      // else: it completed instantly (Send Email) — loop to send the following step
    }
  } catch (e) {
    console.error("advanceAutomation failed:", e);
  }
}
