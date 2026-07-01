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

    const database = await checkDatabase();
    const email = checkEmail();

    const allOk = database.ok && email.ok;

    return NextResponse.json({ allOk, database, email });
  } catch (e) {
    return errorResponse(e);
  }
}
