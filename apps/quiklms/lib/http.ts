/**
 * HTTP helpers — standardized success/error envelopes matching the legacy
 * NestJS AllExceptionsFilter shape exactly:
 *   { statusCode, timestamp, path, method, requestId, message, error, validationErrors }
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
  validationErrors?: unknown;

  constructor(statusCode: number, message: string, errorLabel?: string, validationErrors?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.errorLabel = errorLabel;
    this.validationErrors = validationErrors;
  }
}

// Nest-style named constructors
export const BadRequest = (m = 'Bad Request') => new ApiError(400, m, 'Bad Request');
export const Unauthorized = (m = 'Unauthorized') => new ApiError(401, m, 'Unauthorized');
export const Forbidden = (m = 'Forbidden') => new ApiError(403, m, 'Forbidden');
export const NotFound = (m = 'Not Found') => new ApiError(404, m, 'Not Found');
export const Conflict = (m = 'Conflict') => new ApiError(409, m, 'Conflict');
export const Internal = (m = 'Internal server error') => new ApiError(500, m, 'Internal Server Error');

/** JSON success response. */
export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

const STATUS_LABEL: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
};

function buildEnvelope(
  req: NextRequest,
  requestId: string,
  statusCode: number,
  message: string,
  errorLabel?: string,
  validationErrors?: unknown,
) {
  const body: Record<string, unknown> = {
    statusCode,
    timestamp: new Date().toISOString(),
    path: new URL(req.url).pathname,
    method: req.method,
    requestId,
    message,
    error: errorLabel ?? STATUS_LABEL[statusCode],
  };
  if (validationErrors) body.validationErrors = validationErrors;
  return body;
}

export function toErrorResponse(err: unknown, req: NextRequest, requestId: string): NextResponse {
  // zod validation → 400 with validationErrors
  if (err instanceof ZodError) {
    const validationErrors = err.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    }));
    const res = NextResponse.json(
      buildEnvelope(req, requestId, 400, 'Validation failed', 'Bad Request', validationErrors),
      { status: 400 },
    );
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const res = NextResponse.json(
        buildEnvelope(req, requestId, 409, 'A record with these unique fields already exists', 'Conflict'),
        { status: 409 },
      );
      res.headers.set('X-Request-Id', requestId);
      return res;
    }
    if (err.code === 'P2025') {
      const res = NextResponse.json(
        buildEnvelope(req, requestId, 404, 'Record not found', 'Not Found'),
        { status: 404 },
      );
      res.headers.set('X-Request-Id', requestId);
      return res;
    }
  }

  if (err instanceof ApiError) {
    const res = NextResponse.json(
      buildEnvelope(req, requestId, err.statusCode, err.message, err.errorLabel, err.validationErrors),
      { status: err.statusCode },
    );
    res.headers.set('X-Request-Id', requestId);
    return res;
  }

  // Unknown → 500
  // eslint-disable-next-line no-console
  console.error(`[${requestId}] Unhandled error:`, err);
  const res = NextResponse.json(
    buildEnvelope(req, requestId, 500, 'Internal server error', 'Internal Server Error'),
    { status: 500 },
  );
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
