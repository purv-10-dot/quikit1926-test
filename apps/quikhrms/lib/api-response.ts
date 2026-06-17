import { NextResponse } from "next/server";
import { ErrorCode } from "@/lib/types/api";
import type { ApiSuccess, ApiError } from "@/lib/types/api";

export function successResponse<T>(
  data: T,
  meta?: ApiSuccess<T>["meta"],
  status = 200
): NextResponse<ApiSuccess<T>> {
  const body: ApiSuccess<T> = { success: true, data };
  if (meta) body.meta = meta;
  return NextResponse.json(body, { status });
}

export function errorResponse(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(details !== undefined && { details }) },
    },
    { status }
  );
}

export function notFound(message = "Resource not found") {
  return errorResponse(ErrorCode.NOT_FOUND, message, 404);
}

export function forbidden(message = "Insufficient permissions") {
  return errorResponse(ErrorCode.FORBIDDEN, message, 403);
}

export function unauthorized(message = "Unauthorized") {
  return errorResponse(ErrorCode.UNAUTHORIZED, message, 401);
}

export function validationError(message: string, details?: unknown) {
  return errorResponse(ErrorCode.VALIDATION_ERROR, message, 400, details);
}

export function conflict(message: string) {
  return errorResponse(ErrorCode.CONFLICT, message, 409);
}

export function internalError(message = "Internal server error") {
  return errorResponse(ErrorCode.INTERNAL_ERROR, message, 500);
}

export function serviceUnavailable(
  message = "Service temporarily unavailable. Please try again in a moment.",
) {
  return errorResponse(ErrorCode.SERVICE_UNAVAILABLE, message, 503);
}

/**
 * Heuristic: was this error a failure to reach a backing service (database /
 * Redis) rather than a genuine bug? Used to return a clear 503 instead of an
 * opaque 500 — e.g. when DATABASE_URL points somewhere unreachable.
 */
export function isConnectivityError(error: unknown): boolean {
  const e = error as { name?: string; code?: string; message?: string } | null;
  if (!e) return false;
  // Prisma init / connectivity error codes: P1001 can't reach DB, P1002 timeout,
  // P1008 operation timed out, P1017 server closed the connection.
  if (typeof e.name === "string" && e.name.includes("PrismaClientInitializationError")) return true;
  if (typeof e.code === "string" && ["P1001", "P1002", "P1008", "P1017"].includes(e.code)) return true;
  const msg = `${e.message ?? ""}`;
  return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|Can't reach database|Connection terminated|connection timeout|too many connections/i.test(
    msg,
  );
}
