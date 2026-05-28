import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { requireAuth } from "@/lib/auth/context";
import { logger } from "@/lib/observability/logger";

/**
 * POST /api/account/reset-password
 *
 * Used by the /reset-password page to rotate the password of the
 * currently-signed-in user. Drives both:
 *   - the forced first-login flow (mustChangePassword=true on cn_users)
 *   - any voluntary password change a user does later
 *
 * The caller is identified by the NextAuth session cookie — we don't ask
 * for the existing password again because the user just authenticated to
 * reach this route. The "must differ from current" rule is still enforced
 * server-side by hashing the new password against the stored hash.
 *
 * Policy:
 *   - At least 8 characters
 *   - At least 1 uppercase letter
 *   - At least 1 digit
 *   - Must differ from the stored password (no temp-password reuse)
 *
 * On success:
 *   - cn_users.passwordHash rewritten with a fresh scrypt hash
 *   - cn_users.mustChangePassword cleared
 *   - the client signs the user out — the next-auth cookie still carries
 *     `mustChangePassword: true` from authorize() time, and the simplest
 *     way to reflect the DB state is a fresh login.
 */

function validatePolicy(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one digit.";
  return null;
}

export async function POST(req: NextRequest) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const newPassword = String((body as any).newPassword ?? "");

  if (!newPassword) {
    return NextResponse.json(
      { error: "newPassword is required." },
      { status: 400 },
    );
  }

  const policyError = validatePolicy(newPassword);
  if (policyError) {
    return NextResponse.json({ error: policyError }, { status: 400 });
  }

  // Find the invited-user row. cnDemoUser logins (the seeded amit/priya
  // accounts) don't live in cn_users, so they hit a 404 here — that's
  // intentional, the demo accounts are not part of the invited-user
  // password-rotation flow.
  const row = await (db as any).cnUser.findFirst({
    where: { id: ctx.userId, orgId: ctx.orgId },
    select: { id: true, passwordHash: true },
  });
  if (!row) {
    logger.warn({ msg: "reset_password_no_cn_user", userId: ctx.userId });
    return NextResponse.json(
      { error: "Password reset is not available for this account." },
      { status: 404 },
    );
  }

  // Block reuse — the new password must not match what's currently
  // stored. We hash the new value against the stored hash instead of
  // asking the user to re-type the temp password (they just signed in
  // with it, so the JWT already proves they know it).
  if (verifyPassword(newPassword, row.passwordHash)) {
    return NextResponse.json(
      { error: "New password must be different from your current password." },
      { status: 400 },
    );
  }

  const passwordHash = hashPassword(newPassword);
  await (db as any).cnUser.update({
    where: { id: row.id },
    data: {
      passwordHash,
      mustChangePassword: false,
      updatedBy: ctx.userId,
    },
  });

  logger.info({ msg: "reset_password_ok", userId: ctx.userId });
  return NextResponse.json({ ok: true });
}
