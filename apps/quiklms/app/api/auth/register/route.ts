import { route, json, Conflict, BadRequest, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { canAssignRole, isUserRole } from '@/lib/auth/role-policy';
import { type RegisterUserInput } from '@/lib/services/auth-service';
import { provisionLmsUser } from '@/lib/services/identity-service';
import { enrichRosterUser } from '@/lib/services/roster-profile';

/**
 * POST /api/auth/register — create a login-capable LMS person (student /
 * teacher / parent) from the admin roster screens.
 *
 * Three writes, one identity:
 *   1) createCentralIdentity → platform User + OrgMember + UserAppAccess in the
 *      ORG database (so the person can SSO-log-in). Returns the central userId.
 *   2) registerUser → the LMS row, created with that SAME id, so on login
 *      `session.user.id === LMS User.id` and the LMS role + data resolve.
 *   3) enrichRosterUser → the roster fields `registerUser` does not write: a
 *      teacher's subjects, rate, qualification and WEEKLY AVAILABILITY, plus the
 *      per-tenant roll number.
 *
 * Step 3 used to be missing here while bulk CSV import did it, so the same
 * person came out complete from a CSV and half-created from the form. The
 * availability gap was the expensive one: `batches-service.create` runs
 * `validateTeacherSchedule`, which refuses a teacher with zero slots, so a
 * teacher added through the Teachers page could be selected in the batch form
 * and then never saved into a batch. See lib/services/roster-profile.ts.
 *
 * Static route → takes precedence over app/api/auth/[...nextauth]. Tenant scope
 * is forced to the caller's session org (never trusted from the client body).
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);

  const body = (await req.json().catch(() => ({}))) as Partial<RegisterUserInput>;

  const email = String(body.email ?? '').trim().toLowerCase();
  const firstName = String(body.firstName ?? '').trim();
  const lastName = String(body.lastName ?? '').trim();
  const lmsRole = String(body.role ?? 'LEARNER').trim().toUpperCase();
  if (!email || !firstName) throw BadRequest('First name and email are required.');

  // Role must be a real enum value AND one the caller is allowed to grant. This
  // blocks privilege escalation — a TENANT_ADMIN/SUB_ADMIN cannot mint a role at
  // or above their own tier (and SUPER_ADMIN is never mintable here). See
  // lib/auth/role-policy.ts.
  if (!isUserRole(lmsRole)) throw BadRequest(`Invalid role: ${lmsRole}`);
  if (!canAssignRole(actor.role, lmsRole)) {
    throw Forbidden(`Your role (${actor.role}) cannot assign the role ${lmsRole}.`);
  }

  // Platform Org id — the scope key (orgId-native). Forced to the caller's
  // session; super-admins may target another org via body.orgId.
  const orgId =
    actor.role === 'SUPER_ADMIN'
      ? body.orgId ?? actor.orgId ?? undefined
      : actor.orgId ?? undefined;
  if (!orgId) throw BadRequest('No organization context to create the user in.');

  try {
    // Centralized provisioning: platform identity (User + OrgMember +
    // UserAppAccess) + LMS row, one shared id. See provisionLmsUser.
    const identity = await provisionLmsUser({
      ...(body as Partial<RegisterUserInput>),
      email,
      firstName,
      lastName,
      orgId,
      lmsRole,
      // Session-derived, never from the body — it is an audit field and the
      // `grantedBy` on the resulting app-access grant.
      createdByUserId: actor.id,
    });

    // The roster fields the identity path does not write. Best-effort — the
    // person exists and can log in either way, so this never fails the request.
    const { generatedId } = await enrichRosterUser(
      identity.userId,
      orgId,
      lmsRole,
      body as Record<string, unknown>,
    );

    return json(
      {
        success: true,
        data: {
          id: identity.userId,
          reused: identity.reused,
          /** Per-tenant roll number (SCH-T-0001 / SCH-S-0001 / SCH-P-0001). */
          generatedId,
          /**
           * The plaintext temp password is NOT returned.
           *
           * `createCentralIdentity` already mails it to the new user in the
           * invitation — that is the designed delivery channel. Echoing a live
           * credential in an API response body additionally lands it in server
           * logs, browser devtools/history, and any proxy or monitoring in
           * between, for no gain: nothing in this app reads it (the admin UI
           * generates and sends its own password, and the email template gets
           * the value directly from the identity service).
           *
           * `credentialsEmailed` tells the caller a fresh password was seeded,
           * so the UI can say "check your email" without holding the secret.
           */
          credentialsEmailed: identity.tempPassword != null,
        },
      },
      201,
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create user';
    if (/already exists/i.test(message)) throw Conflict(message);
    throw err;
  }
});
