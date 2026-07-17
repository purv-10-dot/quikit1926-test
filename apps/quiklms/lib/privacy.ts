/**
 * Teacher privacy — port of `TeacherPrivacyInterceptor` + `PrivacyAuditService`
 * (`src/privacy/teacher-privacy.interceptor.ts`, `src/privacy/privacy-audit.service.ts`).
 *
 * The legacy applied the interceptor at CLASS level on `users.controller`
 * (`users.controller.ts:29`), so it ran on every users endpoint. For a
 * `role === 'TEACHER'` actor it stripped a fixed set of sensitive fields from the
 * response and recorded the access in `PrivacyAuditLog`.
 *
 * None of it was migrated (GAP_REPORT §2.4). `LIST_SELECT` in `users-service.ts`
 * explicitly selects `email` and `phone`, and `POST /users/by-ids` permits
 * TEACHER — so **teachers received student email and phone that the original
 * stripped, with no audit trail**. The `LmsPrivacyAuditLog` table exists and was
 * back-filled by the ETL, but nothing read or wrote it at request time.
 *
 * Nest interceptors have no Next.js equivalent, so this is a helper each users
 * route calls on its payload. Applying it to the payload rather than the whole
 * envelope makes the legacy's `data.data` / `data` shape-sniffing unnecessary —
 * the outcome is identical.
 */
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { AuthUser } from '@/lib/auth/context';

/** Verbatim from `teacher-privacy.interceptor.ts:6-19`. Order preserved. */
const SENSITIVE_FIELDS = [
  'guardianContact',
  'guardianRelation',
  'parentIds',
  'dateOfBirth',
  'password',
  'passwordSetupToken',
  'passwordSetupTokenExpiry',
  'aiApiKey',
  'provider',
  'providerId',
  'phone',
  'email',
] as const;

type AnyRec = Record<string, unknown>;

/**
 * Recursively remove the sensitive fields, reporting which were actually present.
 * Port of `stripSensitiveFields` (`teacher-privacy.interceptor.ts:26-46`).
 *
 * Only a field that EXISTS and is not `undefined` counts as stripped — the legacy
 * `if (field in raw && raw[field] !== undefined)`. That matters: `fieldsStripped`
 * is the audit record of what was actually withheld.
 */
export function stripSensitiveFields<T>(obj: T): { cleaned: T; strippedFields: string[] } {
  if (!obj || typeof obj !== 'object') return { cleaned: obj, strippedFields: [] };

  if (Array.isArray(obj)) {
    const results = obj.map((item) => stripSensitiveFields(item));
    const allStripped = [...new Set(results.flatMap((r) => r.strippedFields))];
    return { cleaned: results.map((r) => r.cleaned) as unknown as T, strippedFields: allStripped };
  }

  const raw = { ...(obj as AnyRec) };
  const strippedFields: string[] = [];

  for (const field of SENSITIVE_FIELDS) {
    if (field in raw && raw[field] !== undefined) {
      delete raw[field];
      strippedFields.push(field);
    }
  }

  return { cleaned: raw as unknown as T, strippedFields };
}

/**
 * Record a privacy access. Port of `PrivacyAuditService.logAccess`.
 * Never throws — the legacy swallowed failures (`.catch(() => {})`), so a broken
 * audit table must not break the request.
 */
async function logAccess(data: {
  orgId: string;
  userId: string;
  userRole: string;
  endpoint: string;
  method: string;
  fieldsStripped: string[];
  recordsAffected: number;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.lmsPrivacyAuditLog.create({ data });
  } catch {
    // Swallowed, as in the original.
  }
}

/**
 * Strip sensitive fields from a users-endpoint payload for TEACHER actors and
 * record the access. Returns the payload unchanged for every other role.
 *
 * Gated on the PRIMARY role only (`request.user?.role !== 'TEACHER'`), NOT
 * `userHasRole` — so a user whose *secondary* role is TEACHER is not stripped.
 * That is the legacy behavior (`teacher-privacy.interceptor.ts:57-60`) and is
 * reproduced deliberately.
 */
export async function applyTeacherPrivacy<T>(actor: AuthUser, req: NextRequest, payload: T): Promise<T> {
  if (actor.role !== 'TEACHER') return payload;

  const { cleaned, strippedFields } = stripSensitiveFields(payload);
  if (strippedFields.length === 0) return cleaned;

  const url = new URL(req.url);
  await logAccess({
    orgId: actor.orgId ?? '',
    userId: actor.id,
    userRole: actor.role,
    // Express's `request.url` is path + query, not the absolute URL.
    endpoint: `${url.pathname}${url.search}`,
    method: req.method,
    fieldsStripped: strippedFields,
    recordsAffected: Array.isArray(payload) ? payload.length : 1,
    // Legacy read `request.ip` (Express, behind a trusted proxy). Next has no
    // equivalent, so this is the forwarded header — client-spoofable, and only
    // ever used as audit metadata, never for a decision.
    ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
    userAgent: req.headers.get('user-agent') ?? undefined,
  });

  return cleaned;
}
