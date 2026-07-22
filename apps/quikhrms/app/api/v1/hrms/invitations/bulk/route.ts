import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { bulkInvitationSchema } from "@/lib/validations/invitation";
import { createAuditLog } from "@/lib/utils/audit";
import { provisionCentralInvite } from "@/lib/services/invitation";

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


    const skipped: SkippedRow[] = [];
    const seen = new Set<string>();

    // ── Phase 1: cheap synchronous filtering → list of valid candidates ──
    const candidates: Candidate[] = [];
    for (const row of rows) {
      const email = row.email.trim().toLowerCase();

      if (seen.has(email)) { skipped.push({ email, reason: "Duplicate row in file" }); continue; }
      seen.add(email);
      if (takenEmployee.has(email)) { skipped.push({ email, reason: "Employee already exists" }); continue; }

      // Already has a Pending invite → skip; use the resend action to re-email
      // (central owns invite mail, so bulk only provisions brand-new members).
      if (pendingInvite.has(email)) {
        skipped.push({ email, reason: "Pending invite exists" });
        continue;
      }

      // Resolve roles: CSV names → ids, else fall back to the default roles.
      const namedIds = row.roles
        .split(",")
        .map((n) => roleIdByName.get(n.trim().toLowerCase()))
        .filter((id): id is string => !!id);
      const roleIds = namedIds.length > 0 ? namedIds : validDefaults;
      if (roleIds.length === 0) { skipped.push({ email, reason: "No valid roles" }); continue; }

      candidates.push({ email, firstName: row.firstName, lastName: row.lastName, roleIds });
    }

    // ── Phase 2: per-row central provisioning (bounded concurrency) ──
    // Each row is provisioned DIRECTLY against central (User + OrgMember +
    // UserAppAccess) and gets the invite email — same as the single-invite flow.
    // A row whose provisioning fails is skipped (never a local invite with no
    // backing central account).
    const outcomes = await mapWithConcurrency<Candidate, RowOutcome>(
      candidates,
      PROVISION_CONCURRENCY,
      async (c) => {
        const invite = await provisionCentralInvite({
          orgId,
          invitedBy: userId,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          roleIds: c.roleIds,
          invitationMethod,
        });
        if (!invite.ok) {
          return { email: c.email, ok: false, reason: invite.error ?? "Central provisioning failed" };
        }
        return { email: c.email, ok: true, emailSent: true };
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
