/**
 * HTTP helpers — standardized success/error envelopes matching the platform
 * standard (root CLAUDE.md): success = `{ success: true, data, ... }`, error =
 * `{ success: false, error }`. Was previously the legacy NestJS
 * AllExceptionsFilter shape (`statusCode/timestamp/path/method/requestId/
 * message/error/validationErrors`); migrated for quikscale parity — the HTTP
 * status code alone now carries what `statusCode` used to duplicate in the
 * body, and `X-Request-Id` stays a response HEADER (unchanged) rather than a
 * body field.
 *
 * Every route handler is wrapped with `route()` which injects a requestId,
 * sets the X-Request-Id header, and converts thrown errors (ApiError, ZodError,
 * Prisma errors) into that envelope.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

export class ApiError extends Error {
  statusCode: number;
  errorLabel?: string;

  constructor(statusCode: number, message: string, errorLabel?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorLabel = errorLabel;
  }
}

// Nest-style named constructors
export const BadRequest = (m = 'Bad Request') => new ApiError(400, m, 'Bad Request');
export const Unauthorized = (m = 'Unauthorized') => new ApiError(401, m, 'Unauthorized');
export const Forbidden = (m = 'Forbidden') => new ApiError(403, m, 'Forbidden');
export const NotFound = (m = 'Not Found') => new ApiError(404, m, 'Not Found');
export const Conflict = (m = 'Conflict') => new ApiError(409, m, 'Conflict');
/**
 * 413 — what multer's LIMIT_FILE_SIZE became in the legacy app. Nest's
 * `transformException` mapped it to `PayloadTooLargeException('File too large')`
 * (@nestjs/platform-express/multer/multer.utils), so the default message is the
 * literal multer string, not a Nest label. Routes that ported a
 * `FileInterceptor(..., { limits: { fileSize } })` must use this, NOT a 400 —
 * only the endpoints doing a manual `file.size >` check returned 400.
 */
export const PayloadTooLarge = (m = 'File too large') => new ApiError(413, m, 'Payload Too Large');
export const Internal = (m = 'Internal server error') => new ApiError(500, m, 'Internal Server Error');

/**
 * Mongo-compat `_id` alias.
 *
 * The entire client was written against the Mongo backend, so it addresses every
 * record by `_id` — `api.post(`/certificates/${cert._id}/approve`)`,
 * `api.delete(`/master-courses/${courseToDelete._id}`)`, and ~40 more. Postgres
 * rows carry `id`. Any service that returned a bare Prisma row therefore handed
 * the UI `undefined`, and the request went to `/undefined` and 404'd.
 *
 * That shipped three separate times — the certificate approval queue, the
 * tenant→super-admin course workflow, and batches — because the fix kept being
 * applied per-service, one shaping helper at a time, while every new query
 * reintroduced it. Aliasing here instead makes it structural: `json()` is the
 * single response path every route uses.
 *
 * Purely additive: `_id` is only set when `id` exists and `_id` does not, so an
 * explicit `_id` from a shaping helper always wins. Plain objects and arrays
 * only — `Object.prototype` identity check skips Date, Decimal, Buffer and any
 * class instance whose `toJSON` must run untouched. A WeakSet guards cycles.
 */
function aliasMongoIds(node: unknown, seen: WeakSet<object>): void {
  if (node === null || typeof node !== 'object') return;
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const item of node) aliasMongoIds(item, seen);
    return;
  }

  // Plain objects only. Anything with a custom prototype is left alone.
  if (Object.getPrototypeOf(node) !== Object.prototype) return;

  const rec = node as Record<string, unknown>;
  if (typeof rec.id === 'string' && rec._id === undefined) rec._id = rec.id;
  for (const key of Object.keys(rec)) aliasMongoIds(rec[key], seen);
}

/** JSON success response. */
export function json(data: unknown, status = 200): NextResponse {
  aliasMongoIds(data, new WeakSet());
  return NextResponse.json(data, { status });
}

/** The `{ success: false, error }` body every error branch below emits. */
function errorBody(message: string): { success: false; error: string } {
  return { success: false, error: message };
}

export function toErrorResponse(err: unknown, req: NextRequest, requestId: string): NextResponse {
  // zod validation → 400, one joined string naming every offending field
  // (structured per-field errors were dropped for the platform-standard shape).
  if (err instanceof ZodError) {
    const message = err.issues
      .map((i) => `${i.path.length ? i.path.join('.') : '(value)'}: ${i.message}`)
      .join('; ');
    const res = NextResponse.json(errorBody(message), { status: 400 });
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const res = NextResponse.json(
        errorBody('A record with these unique fields already exists'),
        { status: 409 },
      );
      res.headers.set('X-Request-Id', requestId);
      return res;
    }
    if (err.code === 'P2025') {
      const res = NextResponse.json(errorBody('Record not found'), { status: 404 });
      res.headers.set('X-Request-Id', requestId);
      return res;
    }
    // P2003 — foreign key constraint. The caller referenced a row that does not
    // exist (an unknown batchId, courseId, …). That is a CLIENT fault, but it
    // was falling through to the 500 branch below and being logged as an
    // unhandled server error, which both misreports the fault and buries real
    // 500s in noise.
    if (err.code === 'P2003') {
      const res = NextResponse.json(errorBody('A referenced record does not exist'), { status: 400 });
      res.headers.set('X-Request-Id', requestId);
      return res;
    }
    // P2011 null constraint / P2012 missing required value — a required column
    // was absent from the payload.
    if (err.code === 'P2011' || err.code === 'P2012') {
      const res = NextResponse.json(errorBody('A required field is missing'), { status: 400 });
      res.headers.set('X-Request-Id', requestId);
      return res;
    }
  }

  // A malformed query — typically a required field missing from the request
  // body reaching Prisma as `undefined`. This is the single biggest source of
  // spurious 500s on routes whose zod schema does not constrain the body
  // (see F-003): the client sent nothing, and the app blamed itself.
  //
  // The raw message is NOT forwarded — it embeds the generated Prisma query and
  // model shape, which is schema disclosure on an unauthenticated-adjacent path.
  if (err instanceof Prisma.PrismaClientValidationError) {
    // eslint-disable-next-line no-console
    console.warn(`[${requestId}] Prisma validation (client fault):`, err.message.split('\n')[0]);
    const res = NextResponse.json(errorBody('Invalid or incomplete request body'), { status: 400 });
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  if (err instanceof ApiError) {
    const res = NextResponse.json(errorBody(err.message), { status: err.statusCode });
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Unknown → 500
  // eslint-disable-next-line no-console
  console.error(`[${requestId}] Unhandled error:`, err);
  const res = NextResponse.json(errorBody('Internal server error'), { status: 500 });
  res.headers.set('X-Request-Id', requestId);
  return res;
}

type Ctx = { params?: Record<string, string> };
type Handler = (req: NextRequest, ctx: Ctx, requestId: string) => Promise<NextResponse> | NextResponse;

/** Wrap a route handler with requestId + uniform error handling. */
export function route(handler: Handler) {
  return async (req: NextRequest, ctx: Ctx): Promise<NextResponse> => {
    const requestId = req.headers.get('x-request-id') || randomUUID();
    try {
      const res = await handler(req, ctx, requestId);
      if (!res.headers.get('X-Request-Id')) res.headers.set('X-Request-Id', requestId);
      return res;
    } catch (err) {
      return toErrorResponse(err, req, requestId);
    }
  };
}
