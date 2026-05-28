/**
 * Standard API Response Envelope
 *
 * Every route handler should return either `ok(data)` or let a `DomainError`
 * bubble and `toHttpResponse(err)` catch it. This guarantees one canonical
 * shape that clients and audit tooling can rely on:
 *
 *   success:
 *     {
 *       ok: true,
 *       data: <payload>,
 *       requestId: "req_abc123"
 *     }
 *
 *   error:
 *     {
 *       ok: false,
 *       error: { code: "EXCEEDS_TENDER", message: "Cumulative done qty …", details?: {...} },
 *       requestId: "req_abc123"
 *     }
 *
 * Backwards-compat: the top-level `error` / `code` fields from the
 * pre-envelope contract are preserved in error responses so existing clients
 * don't break. New clients should prefer `ok` + `error.code`.
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";

// ─── Success envelope ───────────────────────────────────────────────

export interface OkEnvelope<T> {
  ok: true;
  data: T;
  requestId?: string;
}

export interface ErrorEnvelope {
  ok: false;
  /** Top-level compatibility field (new clients should read error.message) */
  error: string;
  /** Top-level compatibility field (new clients should read error.code) */
  code: string;
  /** Structured error payload — new canonical location */
  details?: Record<string, unknown>;
  requestId?: string;
}

export type Envelope<T> = OkEnvelope<T> | ErrorEnvelope;

function currentRequestId(): string | undefined {
  try {
    return headers().get("x-request-id") ?? undefined;
  } catch {
    return undefined;
  }
}

/** 200 OK with a canonical success envelope. */
export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }): NextResponse {
  const body: OkEnvelope<T> = { ok: true, data, requestId: currentRequestId() };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

/** 201 Created — convenience wrapper over `ok`. */
export function created<T>(data: T): NextResponse {
  return ok(data, { status: 201 });
}

/** 204 No Content — no body, just status. */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Build an error envelope. Usually you should throw a `DomainError` subclass
 * and let the route's catch block call `toHttpResponse(err)` — this function
 * is for direct error returns where throwing would obscure control flow.
 */
export function err(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse {
  const body: ErrorEnvelope = {
    ok: false,
    error: message,
    code,
    details,
    requestId: currentRequestId(),
  };
  return NextResponse.json(body, { status });
}
