/**
 * HTTP Idempotency-Key layer.
 *
 * Client supplies `Idempotency-Key: <uuid>` header on mutating POSTs.
 * The server:
 *   1. Hashes the request body.
 *   2. If (key) exists with same body hash → returns the cached response.
 *   3. If (key) exists with different body → returns 409 CONFLICT (client bug).
 *   4. Otherwise runs the handler, caches (key, statusCode, responseJson).
 *
 * Contract for the handler:
 *   const guard = await idempotencyGuard(req, ctx, "grn.approve");
 *   if (guard.cached) return guard.cachedResponse;
 *   if (guard.conflict) return guard.conflictResponse;
 *
 *   // ... run real logic, obtain responseBody + statusCode
 *
 *   await guard.commit(statusCode, responseBody);
 *   return NextResponse.json(responseBody, { status: statusCode });
 *
 * TTL: 24 hours by default. A background job should periodically prune
 * expired rows (not implemented in Phase 2 — see TODOs).
 */

import { createHash, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/auth/context";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface IdempotencyGuard {
  /** True if a cached response exists for this key — handler should return it. */
  cached: boolean;
  cachedResponse?: NextResponse;

  /** True if the key was reused with a different body — handler should return 409. */
  conflict: boolean;
  conflictResponse?: NextResponse;

  /** Persist the final response so subsequent retries can replay it. No-op if no key was sent. */
  commit: (statusCode: number, body: unknown) => Promise<void>;

  /** The resolved key (may be auto-generated if client didn't send one). */
  key: string;
}

function hashBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Install an idempotency guard for the current request. Reads the raw body
 * off the request (consuming it — callers must use `guard.parsedBody` rather
 * than calling req.json() themselves).
 */
export async function idempotencyGuard(
  req: NextRequest,
  ctx: TenantContext,
  routeKey: string
): Promise<IdempotencyGuard & { parsedBody: any }> {
  const headerKey = req.headers.get("idempotency-key");
  const rawBody = await req.text();
  let parsedBody: any = undefined;
  if (rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }

  // If no client key, we still enforce single-session idempotency by using
  // a synthetic key scoped to (tenant, user, route, URL, body-hash). The
  // URL pathname is essential — routes like POST /dpr/:id/submit carry the
  // entity id in the path, not the body. Without the URL in the key, two
  // different DPR submit calls (empty body) would collide on the same key
  // and the second call would replay the first call's cached response.
  const clientProvided = !!headerKey;
  const urlPath = (() => {
    try {
      return new URL(req.url).pathname;
    } catch {
      return req.url ?? "";
    }
  })();
  const bodyHash = hashBody(`${urlPath}\n${rawBody ?? ""}`);
  const key = headerKey ?? `auto:${ctx.orgId}:${ctx.userId}:${routeKey}:${bodyHash}`;

  const existing = await (db as any).cnIdempotencyKey.findUnique({
    where: { key },
  });

  if (existing) {
    // Org isolation check (defense in depth)
    if (existing.orgId !== ctx.orgId) {
      return {
        key,
        cached: false,
        conflict: true,
        conflictResponse: NextResponse.json(
          { error: "Idempotency key belongs to a different org", code: "IDEMPOTENCY_CONFLICT" },
          { status: 409 }
        ),
        commit: async () => {},
        parsedBody,
      };
    }

    // Same body → replay cached response
    if (existing.bodyHash === bodyHash) {
      return {
        key,
        cached: true,
        cachedResponse: NextResponse.json(existing.responseJson, {
          status: existing.statusCode,
          headers: { "Idempotent-Replay": "true" },
        }),
        conflict: false,
        commit: async () => {},
        parsedBody,
      };
    }

    // Same key + different body is a client bug
    return {
      key,
      cached: false,
      conflict: true,
      conflictResponse: NextResponse.json(
        {
          error:
            "Idempotency key reused with a different request body. Generate a new key for a different payload.",
          code: "IDEMPOTENCY_BODY_MISMATCH",
        },
        { status: 409 }
      ),
      commit: async () => {},
      parsedBody,
    };
  }

  // No prior record — handler runs normally, commit afterward.
  return {
    key,
    cached: false,
    conflict: false,
    commit: async (statusCode: number, body: unknown) => {
      // Only persist successful or deterministic-failure responses. Transient
      // errors (5xx) should NOT be cached — a retry should re-run the logic.
      if (statusCode >= 500) return;

      const ttl = clientProvided ? DEFAULT_TTL_MS : 10 * 60 * 1000; // auto-keys TTL 10m
      await (db as any).cnIdempotencyKey.create({
        data: {
          key,
          orgId: ctx.orgId,
          userId: ctx.userId,
          route: routeKey,
          bodyHash,
          statusCode,
          responseJson: body as any,
          expiresAt: new Date(Date.now() + ttl),
        },
      });
    },
    parsedBody,
  };
}

/** Generate a random idempotency key (useful for tests and internal callers). */
export function newIdempotencyKey(): string {
  return randomUUID();
}
