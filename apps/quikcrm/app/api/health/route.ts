import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRedis, isRedisEnabled } from "@/lib/db/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; status?: string; error?: string }> = {};
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    checks.postgres = { ok: true };
  } catch (e) {
    checks.postgres = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
  if (!isRedisEnabled()) {
    checks.redis = { ok: true, status: "disabled" };
  } else {
    try {
      const r = getRedis();
      const ping = await r.ping();
      checks.redis = { ok: ping === "PONG" };
    } catch (e) {
      checks.redis = { ok: false, error: e instanceof Error ? e.message : "unknown" };
    }
  }
  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
