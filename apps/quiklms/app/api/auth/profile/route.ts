import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';

/**
 * Current user's profile. Static routes under app/api/auth/* take precedence
 * over the NextAuth catch-all, so these no longer fall through to NextAuth's
 * plain-text "action not supported" error.
 *
 * Phase-3 note: a centralized SSO user has no LMS `User` row yet (their id is
 * the platform user id, not an LMS row), so GET falls back to session values
 * and PATCH is a no-op-with-echo when no LMS row exists.
 */

// GET /api/auth/profile
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const row = await prisma.lmsUser.findUnique({
    where: { id: actor.id },
    select: {
      id: true, email: true, firstName: true, lastName: true, role: true,
      phone: true, profilePicture: true, timezone: true,
    },
  });

  const data = {
    id: actor.id,
    email: row?.email ?? actor.email,
    firstName: row?.firstName ?? actor.firstName,
    lastName: row?.lastName ?? actor.lastName,
    role: row?.role ?? actor.role,
    phone: row?.phone ?? null,
    profilePicture: row?.profilePicture ?? null,
    profilePictureUrl: row?.profilePicture ?? null,
    timezone: row?.timezone ?? null,
  };
  return json({ success: true, data });
});

const PROFILE_FIELDS = ['firstName', 'lastName', 'profilePicture', 'timezone', 'phone'] as const;

// PATCH /api/auth/profile — update only the caller's own profile fields.
export const PATCH = route(async (req) => {
  const actor = await requireAuth(req);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const data: Record<string, unknown> = {};
  for (const k of PROFILE_FIELDS) if (body[k] !== undefined) data[k] = body[k];
  if (Object.keys(data).length === 0) throw BadRequest('No updatable profile fields provided');

  const existing = await prisma.lmsUser.findUnique({ where: { id: actor.id }, select: { id: true } });
  if (!existing) {
    // No LMS row for this central user yet (Phase-3 gap) — echo back so the UI
    // updates its local copy without persisting server-side.
    return json({ success: true, data: { id: actor.id, ...data } });
  }

  const updated = await prisma.lmsUser.update({
    where: { id: actor.id },
    data,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      profilePicture: true, timezone: true, phone: true,
    },
  });
  return json({ success: true, data: updated });
});
