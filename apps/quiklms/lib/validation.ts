/**
 * Request validation — zod with whitelist/strip semantics (replaces NestJS
 * ValidationPipe { whitelist:true, forbidNonWhitelisted:true, transform:true }).
 *
 * Use `.strict()` schemas to reject unknown props (forbidNonWhitelisted), or the
 * default object behavior to strip them. We default to STRIP for resilience and
 * call out endpoints that must be strict.
 *
 * Also ports the global email-lowercasing middleware: any key ending in /email/i
 * is trimmed + lowercased before validation, recursively.
 */
import { z, ZodSchema } from 'zod';

function isEmailKey(key: string): boolean {
  return /email$/i.test(key);
}

/** Recursively lowercase+trim every email-like field (matches legacy middleware). */
export function normalizeEmails<T>(input: T, seen = new WeakSet<object>()): T {
  if (!input || typeof input !== 'object') return input;
  if (seen.has(input as object)) return input;
  seen.add(input as object);

  if (Array.isArray(input)) {
    for (const item of input) if (item && typeof item === 'object') normalizeEmails(item, seen);
    return input;
  }

  const obj = input as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (isEmailKey(key)) {
      if (typeof value === 'string') obj[key] = value.trim().toLowerCase();
      else if (Array.isArray(value))
        obj[key] = value.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v));
    } else if (value && typeof value === 'object') {
      normalizeEmails(value, seen);
    }
  }
  return input;
}

/** Parse + validate a JSON request body. Throws ZodError (→ 400 envelope). */
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  normalizeEmails(raw);
  return schema.parse(raw);
}

/** Parse + validate query params. */
export function parseQuery<T>(req: Request, schema: ZodSchema<T>): T {
  const url = new URL(req.url);
  const obj: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    obj[k] = v;
  });
  normalizeEmails(obj);
  return schema.parse(obj);
}

// Reusable field schemas
export const emailField = z.string().email().transform((s) => s.trim().toLowerCase());
export const passwordField = z.string().min(6);

/**
 * A date the caller MUST supply and that MUST parse.
 *
 * `z.string()` on a date field is a trap this app has already been bitten by
 * twice. `<input type="date">` submits `''` when untouched, and `''` passes
 * `z.string()`, so the handler reaches `new Date('')` → `Invalid Date` and hands
 * that to Prisma. The failure surfaces as an opaque "Invalid or incomplete
 * request body" (or a 500) with no field named, which is indistinguishable from
 * a bug in the app — it took down homework creation entirely, because the Due
 * Date input carried no required marker either.
 *
 * The batches route guards the same class of input with a datetime-or-`YYYY-MM-DD`
 * regex (see its `startDate` note about "next tuesday"). A regex is the weaker
 * check: `/^\d{4}-\d{2}-\d{2}/` happily admits `2026-13-45`, which is still an
 * Invalid Date. Asserting the value actually PARSES is the property that matters,
 * and it holds for every format `new Date()` accepts, so `YYYY-MM-DD` from a date
 * input and a full ISO string from a datetime picker both pass.
 *
 * Use `dateField` for required dates and `dateField.optional()` for optional
 * ones — an absent key is fine, a present-but-unparseable one never is.
 */
export const dateField = z
  .string()
  .min(1, 'a date is required')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'must be a valid date');
