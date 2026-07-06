import { route, json, Conflict, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { registerUser, type RegisterUserInput } from '@/lib/services/auth-service';
import { createCentralIdentity } from '@/lib/services/identity-service';
import { prisma } from '@/lib/prisma';

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
  const lmsRole = String(body.role ?? 'LEARNER');
  if (!email || !firstName) throw BadRequest('First name and email are required.');

  // Force the org to the caller's session (super-admins may target another org).
  const orgId =
    actor.role === 'SUPER_ADMIN' ? body.tenantId ?? actor.tenantId ?? undefined : actor.tenantId ?? undefined;
  if (!orgId) throw BadRequest('No organization context to create the user in.');

  try {
    // 1) Platform identity (login-capable).
    const identity = await createCentralIdentity({ email, firstName, lastName, orgId, lmsRole });

    // 2) LMS row with the shared id (idempotent — skip if already linked).
    const existingLms = await prisma.user.findUnique({
      where: { id: identity.userId },
      select: { id: true },
    });
    if (!existingLms) {
      await registerUser({
        ...body,
        id: identity.userId,
        email,
        firstName,
        lastName,
        role: lmsRole,
        tenantId: orgId,
      });
    }

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
