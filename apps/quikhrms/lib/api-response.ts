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
