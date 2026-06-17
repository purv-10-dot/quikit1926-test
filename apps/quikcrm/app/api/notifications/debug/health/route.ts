/**
 * GET /api/notifications/debug/health
 *
 * Live health check of every component the notification system depends on.
 * Returns latency measurements and error details for each subsystem.
 * Admin-only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { isRedisEnabled, getRedis } from "@/lib/db/redis";

export const runtime = "nodejs";

interface SubsystemResult {
  ok: boolean;
  latencyMs?: number;
  detail: string;
}

async function checkDatabase(): Promise<SubsystemResult> {
  const t0 = Date.now();
  try {
    await prisma.crmNotification.count({ where: { orgId: "__health_check__" } });
    return { ok: true, latencyMs: Date.now() - t0, detail: "Prisma query succeeded." };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      detail: `Query failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function checkRedis(): Promise<SubsystemResult> {
  if (!isRedisEnabled()) {
    return { ok: false, detail: "REDIS_URL is not set — realtime notifications disabled." };
  }
  const t0 = Date.now();
  try {
    const redis = getRedis();
    const reply = await redis.ping();
    if (reply !== "PONG") throw new Error(`Unexpected PING reply: ${reply}`);
    return { ok: true, latencyMs: Date.now() - t0, detail: "Redis PING → PONG." };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      detail: `Redis error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function checkSse(redisOk: boolean): SubsystemResult {
  if (!isRedisEnabled()) {
    return {
      ok: false,
      detail: "SSE unavailable — Redis is not configured (REDIS_URL unset). Bell badge falls back to 60s polling.",
    };
  }
  if (!redisOk) {
    return {
      ok: false,
      detail: "SSE degraded — Redis responded with an error. Check Redis health above.",
    };
  }
  return {
    ok: true,
    detail: "SSE endpoint is operational. Clients subscribe on /api/notifications/stream.",
  };
}

function checkEmail(): SubsystemResult {
  const provider = (process.env.EMAIL_PROVIDER ?? "console").toLowerCase();
  const from = process.env.EMAIL_FROM ?? "";
  const resendKey = process.env.RESEND_API_KEY ?? "";

  if (provider === "resend") {
    if (!resendKey) {
      return {
        ok: false,
        detail: 'Provider=resend but RESEND_API_KEY is missing. Emails will fail. Fix: set RESEND_API_KEY in .env.local.',
      };
    }
    if (!from) {
      return {
        ok: true,
        detail: `Provider=resend, key present. EMAIL_FROM not set — will fall back to default "noreply@example.test".`,
      };
    }
    return {
      ok: true,
      detail: `Provider=resend, key present, from="${from}". Production ready.`,
    };
  }

  // console driver
  return {
    ok: true,
    detail: 'Provider=console (default). Emails are logged to stdout only — not delivered. Set EMAIL_PROVIDER=resend + RESEND_API_KEY for production.',
  };
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
    const sse = checkSse(redis.ok);
    const email = checkEmail();

    const allOk = database.ok && redis.ok && sse.ok && email.ok;

    return NextResponse.json({ allOk, database, redis, sse, email });
  } catch (e) {
    return errorResponse(e);
  }
}
