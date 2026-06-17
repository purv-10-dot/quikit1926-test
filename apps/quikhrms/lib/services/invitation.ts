import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/services/mailer";
import { buildInvitationEmail } from "@/lib/email-templates/invitation";
import { generateInviteToken, inviteExpiry } from "@/lib/auth/invite-token";
import { absoluteUrl } from "@/lib/config/app";

/** Resolve the tenant's display name for emails. */
export async function companyName(orgId: string): Promise<string> {
  const c = await prisma.companySettings.findUnique({
    where: { orgId },
    select: { companyName: true },
  });
  return c?.companyName?.trim() || "QuikIT HRMS";
}

interface BuildInviteArgs {
  orgId: string;
  to: string;
  inviteeName: string;
  loginUrl: string; // e.g. https://host/core/login — SSO sign-in landing
  /** Central QuikIT accept flow (set-password) URL for brand-new native users; null otherwise. */
  setupUrl?: string | null;
  expiresAt: Date;
  inviterName?: string | null;
  /** Pre-resolved company name — pass it in bulk to avoid N DB lookups. */
  company?: string;
  /** QuikIT temporary password for brand-new central users (null when they already have a QuikIT account). */
  tempPassword?: string | null;
}

/** Build the invitation email payload (subject + html). */
async function buildInvite(args: BuildInviteArgs): Promise<{ subject: string; html: string }> {
  return buildInvitationEmail({
    inviteeName: args.inviteeName,
    companyName: args.company ?? (await companyName(args.orgId)),
    loginUrl: args.loginUrl,
    setupUrl: args.setupUrl ?? null,
    inviterName: args.inviterName,
    expiresAt: args.expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
    tempPassword: args.tempPassword ?? null,
  });
}

export interface InviteDispatchResult {
  queued: boolean;       // pushed onto the EMAIL queue (worker will send)
  sent: boolean;         // sent inline (fallback when queue unavailable)
  error?: string;
}

/**
 * Send a SINGLE invitation email directly via SMTP (no BullMQ / Redis).
 * Single-user invites are sent inline on the request — the queue is reserved
 * for bulk import only. Never throws.
 */
export async function dispatchInvitationEmail(args: BuildInviteArgs): Promise<InviteDispatchResult> {
  let subject: string, html: string;
  try {
    ({ subject, html } = await buildInvite(args));
  } catch (err) {
    return { queued: false, sent: false, error: err instanceof Error ? err.message : "build failed" };
  }
  const r = await sendMail({ to: args.to, subject, html });
  return { queued: false, sent: r.sent, error: r.error };
}

/**
 * A single new employee created via the Add Employee form with "send invite":
 * create the Pending Invitation linked to the employee (so it shows in Users &
 * Invitations) and send the activation email DIRECTLY via SMTP — no BullMQ job,
 * no Redis queue entry. (Bulk import uses inviteImportedEmployees, which queues.)
 * Never throws.
 */
export async function inviteSingleEmployee(
  orgId: string,
  invitedBy: string,
  emp: ImportedEmployee,
): Promise<InviteDispatchResult> {
  const email = emp.workEmail.toLowerCase();
  const company = await companyName(orgId);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const loginUrl = absoluteUrl(`${basePath}/login`);
  const expiresAt = inviteExpiry();

  // Create the Pending invitation row only if one isn't already open for this email.
  const existing = await prisma.invitation.findFirst({
    where: { orgId, deletedAt: null, status: "Pending", email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (!existing) {
    const { hash } = generateInviteToken();
    await prisma.invitation.create({
      data: {
        orgId, email, firstName: emp.firstName, lastName: emp.lastName,
        roleIds: emp.roleId ? [emp.roleId] : [],
        token: hash, expiresAt, status: "Pending", invitedBy, employeeId: emp.id,
      },
    });
  }

  // Inline SMTP send — single invite never touches the queue.
  return dispatchInvitationEmail({
    orgId,
    to: email,
    inviteeName: `${emp.firstName} ${emp.lastName}`.trim(),
    loginUrl,
    expiresAt,
    company,
  });
}

/**
 * Bulk variant — sends the invitation email INLINE via SMTP (no queue). Used by
 * the bulk employee-import flow, which runs in an in-process background task, so
 * sending inline here never blocks a request. Returns whether the email sent.
 */
export async function queueInvitationEmail(args: BuildInviteArgs): Promise<boolean> {
  const r = await dispatchInvitationEmail(args);
  return r.sent;
}

export interface ImportedEmployee {
  id: string;
  workEmail: string;
  firstName: string;
  lastName: string;
  roleId: string | null;
}

/**
 * For employees freshly created by a People bulk import: create a Pending
 * invitation linked to each employee (so it shows in Users & Invitations) and
 * queue an activation email so they set their own password. Skips anyone who
 * already has a pending invite. Runs in the worker — never blocks a request.
 */
export async function inviteImportedEmployees(
  orgId: string,
  invitedBy: string,
  employees: ImportedEmployee[],
): Promise<{ invited: number; queued: number }> {
  if (employees.length === 0) return { invited: 0, queued: 0 };

  const emails = [...new Set(employees.map((e) => e.workEmail.toLowerCase()))];
  const existing = await prisma.invitation.findMany({
    where: { orgId, deletedAt: null, status: "Pending", email: { in: emails, mode: "insensitive" } },
    select: { email: true },
  });
  const pending = new Set(existing.map((i) => i.email.toLowerCase()));

  const company = await companyName(orgId);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const loginUrl = absoluteUrl(`${basePath}/login`);

  let invited = 0;
  let queued = 0;
  for (const emp of employees) {
    const email = emp.workEmail.toLowerCase();
    if (pending.has(email)) continue;
    pending.add(email);

    // token hash satisfies the Invitation.token @unique column; it's no longer
    // emailed (login is SSO) but keeps each invite row uniquely keyed.
    const { hash } = generateInviteToken();
    const expiresAt = inviteExpiry();
    await prisma.invitation.create({
      data: {
        orgId,
        email,
        firstName: emp.firstName,
        lastName: emp.lastName,
        roleIds: emp.roleId ? [emp.roleId] : [],
        token: hash,
        expiresAt,
        status: "Pending",
        invitedBy,
        employeeId: emp.id, // links the invite to the already-created employee
      },
    });
    invited++;

    try {
      await queueInvitationEmail({
        orgId,
        to: email,
        inviteeName: `${emp.firstName} ${emp.lastName}`.trim(),
        loginUrl,
        expiresAt,
        company,
      });
      queued++;
    } catch (err) {
      console.error("[invite-import] enqueue failed:", email, err);
    }
  }
  return { invited, queued };
}
