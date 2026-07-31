import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { presignFromUrlOrKey } from '@/lib/s3';
import { requireAuth } from '@/lib/auth/context';
import { db } from '@/lib/db';

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
  const row = await db.lmsUser.findUnique({
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
    // PRESIGNED. The stored value is an unsigned S3 url, which 403s against the
    // private bucket, so avatars simply never loaded. `presignFromUrlOrKey`
    // passes data:/non-S3 urls through untouched and never throws.
    profilePictureUrl: row?.profilePicture ? await presignFromUrlOrKey(row.profilePicture) : null,
    timezone: row?.timezone ?? null,
  };
  return json({ success: true, data });
});

/**
 * Typed profile schema.
 *
 * The allowlist alone did no type checking, so `{"firstName": 12345}` was
 * written straight to a String column — Prisma then either coerced it or threw
 * an opaque 500. Every other route in this app validates with zod; this one did
 * not.
 */
const profileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    profilePicture: z.string().max(2048),
    timezone: z.string().max(100),
    phone: z.string().max(32),
  })
  .partial()
  .strict();

// PATCH /api/auth/profile — update only the caller's own profile fields.
export const PATCH = route(async (req) => {
  const actor = await requireAuth(req);
  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const body = profileSchema.parse(raw);

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) data[k] = v;
  if (Object.keys(data).length === 0) throw BadRequest('No updatable profile fields provided');

  const existing = await db.lmsUser.findUnique({ where: { id: actor.id }, select: { id: true } });
  if (!existing) {
    // No LMS row for this central user yet (Phase-3 gap) — echo back so the UI
    // updates its local copy without persisting server-side.
    return json({ success: true, data: { id: actor.id, ...data } });
  }

  const updated = await db.lmsUser.update({
    where: { id: actor.id },
    data,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      profilePicture: true, timezone: true, phone: true,
    },
  });
  return json({ success: true, data: updated });
});
