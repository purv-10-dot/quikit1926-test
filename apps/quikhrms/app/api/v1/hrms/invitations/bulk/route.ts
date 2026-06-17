import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkInvitationSchema } from "@/lib/validations/invitation";
import { generateInviteToken, inviteExpiry } from "@/lib/auth/invite-token";
import { dispatchInvitationEmail, companyName } from "@/lib/services/invitation";
import { createAuditLog } from "@/lib/utils/audit";
import { provisionMemberRemote } from "@/lib/auth/provision-member-remote";
import { deprovisionMemberRemote } from "@/lib/auth/deprovision-member-remote";

/** App slug HRMS is registered under in the central QuikIT app registry. */
const QUIKHRMS_APP_SLUG = "quikhrms";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Central QuikIT base — hosts the /invitations/accept set-password flow. */
const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? "";

/**
 * Cap concurrent central provisioning calls. Each row hits the central
 * /api/internal/members endpoint (DB writes), so we fan out a few at a time
 * rather than all-at-once — keeps the request latency sane and avoids
 * stampeding central on a large file.
 */
const PROVISION_CONCURRENCY = 5;

interface SkippedRow { email: string; reason: string }

interface Candidate {
  email: string;
  firstName: string;
  lastName: string;
  roleIds: string[];
  /** True when a Pending invite already exists — re-send the email, no new row. */
  isResend: boolean;
}

type RowOutcome =
  | { email: string; ok: true; emailSent: boolean }
  | { email: string; ok: false; reason: string };

/** Run `fn` over `items` with at most `limit` calls in flight at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * POST /api/v1/hrms/invitations/bulk
 * Bulk-create invitations from parsed CSV rows. Each valid row follows the same
 * flow as a single invite: provision the person centrally (QuikIT member +
 * temp password / accept token), persist the central token, then enqueue the
 * invitation email carrying the accept link. A row that fails provisioning is
 * skipped with the central error — it never fails the rest of the batch.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkInvitationSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { rows, defaultRoleIds, fileName, invitationMethod } = parsed.data;

    // ── Resolve roles for the tenant (name → id, case-insensitive) ──
    const tenantRoles = await prisma.hrmsAppRole.findMany({
      where: { orgId: orgId },
      select: { id: true, name: true },
    });
    const roleIdByName = new Map(tenantRoles.map((r) => [r.name.trim().toLowerCase(), r.id]));
    const validRoleIds = new Set(tenantRoles.map((r) => r.id));
    const validDefaults = defaultRoleIds.filter((id) => validRoleIds.has(id));

    // ── Pre-fetch existing employees + pending invites to dedupe in bulk ──
    const emails = [...new Set(rows.map((r) => r.email.trim().toLowerCase()))];
    const [existingEmployees, existingInvites] = await Promise.all([
      prisma.employee.findMany({
        where: { orgId, deletedAt: null, workEmail: { in: emails, mode: "insensitive" } },
        select: { workEmail: true },
      }),
      prisma.invitation.findMany({
        where: { orgId, deletedAt: null, status: "Pending", email: { in: emails, mode: "insensitive" } },
        select: { email: true },
      }),
    ]);
    const takenEmployee = new Set(existingEmployees.map((e) => e.workEmail?.toLowerCase()));
    const pendingInvite = new Set(existingInvites.map((i) => i.email.toLowerCase()));

    const inviter = await prisma.employee.findFirst({
      where: { id: userId, orgId },
      select: { firstName: true, lastName: true },
    });
    const inviterName = inviter ? `${inviter.firstName} ${inviter.lastName}`.trim() : null;
    const company = await companyName(orgId);
    const loginUrl = `${req.nextUrl.origin}${BASE_PATH}/login`;

    const skipped: SkippedRow[] = [];
    const seen = new Set<string>();

    // ── Phase 1: cheap synchronous filtering → list of valid candidates ──
    const candidates: Candidate[] = [];
    for (const row of rows) {
      const email = row.email.trim().toLowerCase();

      if (seen.has(email)) { skipped.push({ email, reason: "Duplicate row in file" }); continue; }
      seen.add(email);
      if (takenEmployee.has(email)) { skipped.push({ email, reason: "Employee already exists" }); continue; }

      // Already has a Pending invite → re-send the invite email instead of
      // skipping (no new row is created). Roles are irrelevant for a re-send.
      if (pendingInvite.has(email)) {
        candidates.push({ email, firstName: row.firstName, lastName: row.lastName, roleIds: [], isResend: true });
        continue;
      }

      // Resolve roles: CSV names → ids, else fall back to the default roles.
      const namedIds = row.roles
        .split(",")
        .map((n) => roleIdByName.get(n.trim().toLowerCase()))
        .filter((id): id is string => !!id);
      const roleIds = namedIds.length > 0 ? namedIds : validDefaults;
      if (roleIds.length === 0) { skipped.push({ email, reason: "No valid roles" }); continue; }

      candidates.push({ email, firstName: row.firstName, lastName: row.lastName, roleIds, isResend: false });
    }

    // ── Phase 2: per-row central provisioning → invitation row → queued email ──
    // (bounded concurrency; mirrors the single-invite flow per row)
    const outcomes = await mapWithConcurrency<Candidate, RowOutcome>(
      candidates,
      PROVISION_CONCURRENCY,
      async (c) => {
        const expiresAt = inviteExpiry();
        let setupUrl: string | null = null;
        let tempPassword: string | null = null;

        // NEW invite → provision centrally (best-effort) + create the local row.
        // RE-SEND (pending invite already exists) → skip both; just re-send the
        // email below. Provisioning is optional: if the central endpoint isn't
        // available the invite + email still go out (SSO login), mirroring the
        // bulk employee-import flow.
        if (!c.isResend) {
          const provision = await provisionMemberRemote({
            orgId: orgId,
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            appSlug: QUIKHRMS_APP_SLUG,
            invitationMethod,
          });
          if (!provision.ok) {
            console.warn("[bulk-invite] central provisioning unavailable — sending SSO invite:", c.email, provision.error);
          } else {
            tempPassword = provision.tempPassword ?? null;
            if (provision.invitationToken && QUIKIT_URL) {
              setupUrl = `${QUIKIT_URL.replace(/\/$/, "")}/invitations/accept?token=${encodeURIComponent(provision.invitationToken)}`;
            }
          }

          try {
            const { hash } = generateInviteToken();
            await prisma.invitation.create({
              data: {
                orgId,
                email: c.email,
                firstName: c.firstName,
                lastName: c.lastName,
                roleIds: c.roleIds,
                token: hash,
                centralInviteToken: provision.ok ? provision.invitationToken ?? null : null,
                expiresAt,
                status: "Pending",
                invitedBy: userId,
              },
            });
          } catch (rowErr) {
            console.error("[bulk-invite] row failed:", c.email, rowErr);
            // Dual-write compensation — undo a brand-new central provision so a
            // retried upload re-provisions cleanly.
            if (provision.isNewUser && provision.userId) {
              const rollback = await deprovisionMemberRemote({
                orgId: orgId,
                userId: provision.userId,
                appSlug: QUIKHRMS_APP_SLUG,
              });
              if (!rollback.ok) {
                console.error("[bulk-invite] central rollback failed — manual cleanup may be needed:", c.email, rollback.error);
              }
            }
            return { email: c.email, ok: false, reason: "Could not create invitation" };
          }
        }

        // Send the invite email DIRECTLY via SMTP (no queue) — new + re-send.
        let emailSent = false;
        try {
          const mail = await dispatchInvitationEmail({
            orgId,
            to: c.email,
            inviteeName: `${c.firstName} ${c.lastName}`.trim(),
            loginUrl,
            setupUrl,
            expiresAt,
            inviterName,
            company,
            tempPassword,
          });
          emailSent = mail.sent;
        } catch (mailErr) {
          console.error("[bulk-invite] email send failed:", c.email, mailErr);
        }
        return { email: c.email, ok: true, emailSent };
      },
    );

    let created = 0;
    let sent = 0;
    for (const o of outcomes) {
      if (o.ok) {
        created++;
        if (o.emailSent) sent++;
      } else {
        skipped.push({ email: o.email, reason: o.reason });
      }
    }
    const emailFailed = created - sent;

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "Invitation", entityId: "bulk",
      metadata: { fileName, total: rows.length, created, skipped: skipped.length, sent, emailFailed, method: invitationMethod },
    });

    return successResponse(
      { total: rows.length, created, sent, emailFailed, skipped },
    );
  } catch (error) {
    console.error("POST /invitations/bulk error:", error);
    return internalError();
  }
}, {
  requiredPermissions: ["hrms.user.invite"],
  rateLimit: { max: 3, windowSec: 60, by: "tenant", scope: "invitations.bulk" },
});
