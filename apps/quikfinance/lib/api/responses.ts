import { NextResponse } from "next/server";

export type ApiError = {
  code: string;
  message: string;
  details?: unknown;
};

export function ok<T>(data: T, meta?: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json({ data, meta }, init);
}

export function fail(status: number, error: ApiError) {
  return NextResponse.json({ error }, { status });
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected server error";
}
