import { prisma } from "@/lib/prisma";
import { queueEmail } from "@/lib/services/mailer";
import { publishNotification } from "@/lib/services/realtime";
import type { PayrollEventPayload } from "@/lib/events/payroll";
import { PAYROLL_EVENTS } from "@/lib/events/payroll";
import { whereEmployeeHasAnyRole } from "@/lib/rbac/queries";

interface NotifyParams {
  orgId: string;
  employeeIds: string[];
  type: "Info" | "Success" | "Warning" | "Error" | "Action";
  title: string;
  message: string;
  link?: string;
  entityType?: string;
  entityId?: string;
  email?: { subject: string; html: string };
}

async function notifyEmployees(p: NotifyParams) {
  if (p.employeeIds.length === 0) return;

  await prisma.hrmsNotification.createMany({
    data: p.employeeIds.map((employeeId) => ({
      orgId: p.orgId,
      employeeId,
      type: p.type,
      channel: "InApp" as const,
      title: p.title,
      message: p.message,
      link: p.link,
      entityType: p.entityType,
      entityId: p.entityId,
    })),
  });

  // Push real-time notification to connected clients
  publishNotification(p.orgId, p.employeeIds, {
    title: p.title,
    message: p.message,
    type: p.type,
    link: p.link,
  }).catch(() => {});

  if (!p.email) return;
  const employees = await prisma.employee.findMany({
    where: { orgId: p.orgId, id: { in: p.employeeIds }, deletedAt: null },
    select: { workEmail: true },
  });
  const recipients = employees.map((e) => e.workEmail).filter((e): e is string => !!e);
  if (recipients.length === 0) return;

  await Promise.allSettled(
    recipients.map((to) => queueEmail(p.orgId, { to, subject: p.email!.subject, html: p.email!.html, kind: "payroll.notify" })),
  );
}

async function notifyAdmins(orgId: string, params: Omit<NotifyParams, "orgId" | "employeeIds">) {
  const admins = await prisma.employee.findMany({
    where: {
      orgId, deletedAt: null,
      ...whereEmployeeHasAnyRole(["admin"]),
    },
    select: { id: true },
  });
  await notifyEmployees({ orgId, employeeIds: admins.map((a) => a.id), ...params });
}

export async function handlePayrollEvent(payload: PayrollEventPayload): Promise<void> {
  const { event, orgId, entityId, data } = payload;
  try {
    switch (event) {
      case PAYROLL_EVENTS.RUN_CREATED: {
        await notifyAdmins(orgId, {
          type: "Info",
          title: "New pay run created",
          message: "A new pay run is ready to compute.",
          link: entityId ? `/payroll/runs/${entityId}` : undefined,
          entityType: "PayRun", entityId,
        });
        break;
      }
      case PAYROLL_EVENTS.RUN_PROCESSED: {
        await notifyAdmins(orgId, {
          type: "Info",
          title: "Pay run computed",
          message: "Payslips generated. Awaiting approval.",
          link: entityId ? `/payroll/runs/${entityId}` : undefined,
          entityType: "PayRun", entityId,
        });
        break;
      }
      case PAYROLL_EVENTS.RUN_APPROVED: {
        const total = data?.totalNet ? `Net: ₹${Number(data.totalNet).toLocaleString("en-IN")}` : "";
        await notifyAdmins(orgId, {
          type: "Success",
          title: "Pay run approved",
          message: `Pay run approved. ${total} Ready to release.`,
          link: entityId ? `/payroll/runs/${entityId}` : undefined,
          entityType: "PayRun", entityId,
        });
        break;
      }
      case PAYROLL_EVENTS.RUN_RELEASED: {
        // Notify each employee about released payslip
        if (entityId) {
          const payslips = await prisma.payslip.findMany({
            where: { orgId, payRunId: entityId, deletedAt: null, status: "Released" },
            select: { employeeId: true, periodStart: true },
          });
          if (payslips.length > 0) {
            const period = payslips[0].periodStart.toLocaleString("en-IN", { month: "long", year: "numeric" });
            await notifyEmployees({
              orgId,
              employeeIds: payslips.map((p) => p.employeeId),
              type: "Success",
              title: `Payslip released — ${period}`,
              message: `Your payslip for ${period} is now available. Net pay credited on the pay date.`,
              link: "/payroll/my-payslips",
              entityType: "PayRun", entityId,
            });
          }
        }
        await notifyAdmins(orgId, {
          type: "Success",
          title: "Pay run released",
          message: "Payslips have been released and emailed to employees.",
          link: entityId ? `/payroll/runs/${entityId}` : undefined,
          entityType: "PayRun", entityId,
        });
        break;
      }
      case PAYROLL_EVENTS.PAYSLIP_EMAIL_FAILED: {
        await notifyAdmins(orgId, {
          type: "Error",
          title: "Payslip email failed",
          message: `Failed to deliver payslip to ${data?.to ?? "an employee"}. ${data?.error ?? ""}`,
          entityType: "Payslip", entityId,
        });
        break;
      }
      case PAYROLL_EVENTS.SALARY_REVISED:
      case PAYROLL_EVENTS.REVISION_APPROVED: {
        const empId = data?.employeeId as string | undefined;
        if (empId) {
          await notifyEmployees({
            orgId, employeeIds: [empId],
            type: "Success",
            title: "Salary revision applied",
            message: "Your salary structure has been revised. Review under My Payslips for next pay run impact.",
            link: "/payroll/my-payslips",
            entityType: "EmployeeSalary", entityId,
          });
        }
        break;
      }
    }
  } catch (e) {
    console.error(`[payroll-notify] ${event} failed`, e);
  }
}
