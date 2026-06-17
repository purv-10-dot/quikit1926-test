import { prisma } from "@/lib/prisma";
import { queueEmail } from "@/lib/services/mailer";
import { publishNotification, publishTicketUpdate } from "@/lib/services/realtime";
import { absoluteUrl } from "@/lib/config/app";

interface TicketLite {
  id: string;
  ticketNo: string;
  title: string;
  raisedById: string;
  assignedToId: string | null;
}

// Resolve via the shared app-URL helper so email links use the real deployment
// origin (and never a stale localhost value when running on Vercel).
const link = (id: string) => absoluteUrl(`/tickets/${id}`);
const inAppLink = (id: string) => `/tickets/${id}`;

async function getName(orgId: string, employeeId: string): Promise<string> {
  const e = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: { firstName: true, lastName: true },
  });
  return e ? `${e.firstName} ${e.lastName}`.trim() : "Someone";
}

interface EmailContent {
  subject: string;
  heading: string;
  intro: string;
  body?: string;
  ctaLabel?: string;
}

function renderEmailHtml(c: EmailContent, ticketUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
  <div style="max-width:600px;margin:24px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <div style="background:#16243A;padding:16px 24px;">
      <h2 style="color:#ffffff;margin:0;font-size:18px;">🎫 QuikIT Help Desk</h2>
    </div>
    <div style="padding:24px;">
      <h3 style="margin:0 0 12px;font-size:16px;color:#111827;">${c.heading}</h3>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#374151;">${c.intro}</p>
      ${c.body ? `<div style="margin:12px 0;padding:12px;background:#f9fafb;border-left:3px solid #3b82f6;font-size:13px;color:#374151;">${c.body}</div>` : ""}
      <div style="margin:24px 0;">
        <a href="${ticketUrl}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:500;">
          ${c.ctaLabel ?? "View Ticket"}
        </a>
      </div>
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        This is an automated notification from QuikIT HRMS. If you did not expect this email, please ignore it.
      </p>
    </div>
  </div>
</body>
</html>`;
}

interface NotifyArgs {
  orgId: string;
  recipients: string[];
  ticketId: string;
  inApp: {
    title: string;
    message: string;
    type?: "Info" | "Success" | "Warning" | "Error";
  };
  email?: EmailContent;
}

async function notify(args: NotifyArgs) {
  const unique = [...new Set(args.recipients.filter(Boolean))];
  if (unique.length === 0) return;

  await prisma.hrmsNotification.createMany({
    data: unique.map((employeeId) => ({
      orgId: args.orgId,
      employeeId,
      type: args.inApp.type ?? "Info",
      channel: "InApp" as const,
      title: args.inApp.title,
      message: args.inApp.message,
      link: inAppLink(args.ticketId),
      entityType: "Ticket",
      entityId: args.ticketId,
    })),
  });

  // Push real-time notification + ticket update to connected clients
  publishNotification(args.orgId, unique, {
    title: args.inApp.title,
    message: args.inApp.message,
    type: args.inApp.type ?? "Info",
    link: inAppLink(args.ticketId),
  }).catch(() => {});
  publishTicketUpdate(args.orgId, unique, {
    ticketId: args.ticketId,
    status: "updated",
    action: args.inApp.title,
  }).catch(() => {});

  if (!args.email) return;

  const employees = await prisma.employee.findMany({
    where: { orgId: args.orgId, id: { in: unique }, deletedAt: null },
    select: { workEmail: true },
  });
  const recipients = employees.map((e) => e.workEmail).filter((e): e is string => !!e);
  if (recipients.length === 0) return;

  const html = renderEmailHtml(args.email, link(args.ticketId));

  await Promise.allSettled(
    recipients.map((to) =>
      queueEmail(args.orgId, { to, subject: args.email!.subject, html, kind: "ticket.notify" })
    )
  );
}

export async function notifyTicketCreated(
  orgId: string,
  ticket: TicketLite,
  actorId: string
) {
  try {
    const recipients: string[] = [];
    if (ticket.assignedToId && ticket.assignedToId !== actorId) {
      recipients.push(ticket.assignedToId);
    }
    if (recipients.length === 0) return;

    const raiserName = await getName(orgId, ticket.raisedById);

    await notify({
      orgId,
      recipients,
      ticketId: ticket.id,
      inApp: {
        title: `🎫 New ticket assigned: ${ticket.ticketNo}`,
        message: `${raiserName} raised "${ticket.title}". Tap to review.`,
      },
      email: {
        subject: `[${ticket.ticketNo}] New ticket assigned: ${ticket.title}`,
        heading: `New ticket assigned to you`,
        intro: `<strong>${raiserName}</strong> raised a new ticket and you've been assigned as the agent.`,
        body: `<strong>${ticket.ticketNo}</strong> — ${ticket.title}`,
        ctaLabel: "Open Ticket",
      },
    });
  } catch (error) {
    console.error("notifyTicketCreated error:", error);
  }
}

export async function notifyTicketAssigned(
  orgId: string,
  ticket: TicketLite,
  newAssigneeId: string,
  actorId: string
) {
  if (newAssigneeId === actorId) return;
  try {
    const actorName = await getName(orgId, actorId);

    await notify({
      orgId,
      recipients: [newAssigneeId],
      ticketId: ticket.id,
      inApp: {
        title: `🎫 Ticket assigned to you: ${ticket.ticketNo}`,
        message: `${actorName} assigned "${ticket.title}" to you.`,
      },
      email: {
        subject: `[${ticket.ticketNo}] Assigned to you: ${ticket.title}`,
        heading: `Ticket assigned to you`,
        intro: `<strong>${actorName}</strong> has assigned this ticket to you.`,
        body: `<strong>${ticket.ticketNo}</strong> — ${ticket.title}`,
        ctaLabel: "Open Ticket",
      },
    });
  } catch (error) {
    console.error("notifyTicketAssigned error:", error);
  }
}

export async function notifyTicketStatusChange(
  orgId: string,
  ticket: TicketLite,
  fromStatus: string,
  toStatus: string,
  actorId: string
) {
  try {
    const recipients: string[] = [];
    if (ticket.raisedById !== actorId) recipients.push(ticket.raisedById);
    if (ticket.assignedToId && ticket.assignedToId !== actorId) {
      recipients.push(ticket.assignedToId);
    }
    if (recipients.length === 0) return;

    const actorName = await getName(orgId, actorId);
    const isResolution = toStatus === "Resolved" || toStatus === "Closed";

    await notify({
      orgId,
      recipients,
      ticketId: ticket.id,
      inApp: {
        type: isResolution ? "Success" : "Info",
        title: `🎫 ${ticket.ticketNo}: ${fromStatus} → ${toStatus}`,
        message: `${actorName} updated status of "${ticket.title}".`,
      },
      email: {
        subject: `[${ticket.ticketNo}] Status: ${toStatus} — ${ticket.title}`,
        heading: `Ticket status changed to ${toStatus}`,
        intro: `<strong>${actorName}</strong> changed the status of this ticket from <strong>${fromStatus}</strong> to <strong>${toStatus}</strong>.`,
        body: `<strong>${ticket.ticketNo}</strong> — ${ticket.title}`,
        ctaLabel: "Open Ticket",
      },
    });
  } catch (error) {
    console.error("notifyTicketStatusChange error:", error);
  }
}

export async function notifyTicketSlaBreach(
  orgId: string,
  ticket: TicketLite & { priority: string },
  breachType: "Response" | "Resolve",
  hoursOverdue: number,
  escalationLevel: number,
  escalationRecipients: string[]
) {
  try {
    // Recipients: assignee + escalation chain (HR/IT admins)
    const recipients: string[] = [];
    if (ticket.assignedToId) recipients.push(ticket.assignedToId);
    recipients.push(...escalationRecipients);

    const breachLabel = breachType === "Response" ? "Response" : "Resolution";
    const escalationTag = escalationLevel > 1 ? ` (Escalation L${escalationLevel})` : "";

    await notify({
      orgId,
      recipients,
      ticketId: ticket.id,
      inApp: {
        type: "Warning",
        title: `⚠️ SLA Breach: ${ticket.ticketNo}${escalationTag}`,
        message: `${breachLabel} SLA breached by ${hoursOverdue}h on "${ticket.title}" [${ticket.priority}].`,
      },
      email: {
        subject: `[SLA BREACH] ${ticket.ticketNo} — ${breachLabel} overdue ${hoursOverdue}h`,
        heading: `⚠️ SLA Breach: ${breachLabel}${escalationTag}`,
        intro: `The <strong>${breachLabel.toLowerCase()} SLA</strong> for this ticket has been breached. It is overdue by <strong>${hoursOverdue} hours</strong>.`,
        body: `<strong>${ticket.ticketNo}</strong> — ${ticket.title}<br/>Priority: <strong>${ticket.priority}</strong><br/><br/>Please take action immediately or escalate appropriately.`,
        ctaLabel: "Take Action",
      },
    });
  } catch (error) {
    console.error("notifyTicketSlaBreach error:", error);
  }
}

export async function notifyTicketAutoClosed(
  orgId: string,
  ticket: TicketLite,
  daysInResolved: number
) {
  try {
    const recipients: string[] = [ticket.raisedById];
    if (ticket.assignedToId) recipients.push(ticket.assignedToId);

    await notify({
      orgId,
      recipients,
      ticketId: ticket.id,
      inApp: {
        type: "Success",
        title: `🎫 ${ticket.ticketNo}: Auto-closed`,
        message: `"${ticket.title}" was auto-closed after ${daysInResolved} days in Resolved.`,
      },
      email: {
        subject: `[${ticket.ticketNo}] Auto-closed: ${ticket.title}`,
        heading: `Ticket auto-closed`,
        intro: `This ticket has been automatically closed after spending ${daysInResolved} days in <strong>Resolved</strong> status without being reopened.`,
        body: `<strong>${ticket.ticketNo}</strong> — ${ticket.title}<br/><br/>If the issue is not actually resolved, you can reopen it from the ticket page.`,
        ctaLabel: "View Ticket",
      },
    });
  } catch (error) {
    console.error("notifyTicketAutoClosed error:", error);
  }
}

export async function notifyTicketComment(
  orgId: string,
  ticket: TicketLite,
  actorId: string,
  isInternal: boolean
) {
  try {
    const recipients: string[] = [];
    // Internal notes: only notify other agents (assignee), not raiser
    if (!isInternal && ticket.raisedById !== actorId) {
      recipients.push(ticket.raisedById);
    }
    if (ticket.assignedToId && ticket.assignedToId !== actorId) {
      recipients.push(ticket.assignedToId);
    }
    if (recipients.length === 0) return;

    const actorName = await getName(orgId, actorId);
    const noteLabel = isInternal ? "internal note" : "comment";

    await notify({
      orgId,
      recipients,
      ticketId: ticket.id,
      inApp: {
        title: `💬 ${ticket.ticketNo}: New ${noteLabel}`,
        message: `${actorName} commented on "${ticket.title}".`,
      },
      email: {
        subject: `[${ticket.ticketNo}] New ${noteLabel} from ${actorName}`,
        heading: `New ${noteLabel} on your ticket`,
        intro: `<strong>${actorName}</strong> added a ${noteLabel} on this ticket.`,
        body: `<strong>${ticket.ticketNo}</strong> — ${ticket.title}`,
        ctaLabel: "View Conversation",
      },
    });
  } catch (error) {
    console.error("notifyTicketComment error:", error);
  }
}
