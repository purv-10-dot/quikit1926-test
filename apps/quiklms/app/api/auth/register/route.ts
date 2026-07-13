import { route, json, Conflict, BadRequest, Forbidden } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { canAssignRole, isUserRole } from '@/lib/auth/role-policy';
import { type RegisterUserInput } from '@/lib/services/auth-service';
import { provisionLmsUser } from '@/lib/services/identity-service';

/**
 * POST /api/auth/register — create a login-capable LMS person (student /
 * teacher / parent) from the admin roster screens.
 *
 * Two writes, one identity:
 *   1) createCentralIdentity → platform User + OrgMember + UserAppAccess in the
 *      ORG database (so the person can SSO-log-in). Returns the central userId.
 *   2) registerUser → the LMS row, created with that SAME id, so on login
 *      `session.user.id === LMS User.id` and the LMS role + data resolve.
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
    });

    return json(
      {
        success: true,
        data: {
          id: identity.userId,
          reused: identity.reused,
          // Plaintext temp password for the admin to relay (present only when a
          // fresh platform password was seeded). The user changes it on first
          // login via central sign-in (mustChangePassword).
          tempPassword: identity.tempPassword ?? undefined,
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
