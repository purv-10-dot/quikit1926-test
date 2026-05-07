import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { DEFAULT_INVITE_PASSWORD } from "@quikit/shared";

/**
 * FRD FR-SA-009 / FR-SA-010 / BR-008 — Set Password API.
 *
 * Used by the /set-password screen, which is shown ONCE after first login
 * for users created via the native invite flow. Two payload shapes:
 *
 *   { skip: true }
 *     User clicked "Skip for now". Keep the system default password but
 *     clear `mustChangePassword` so they're not bounced back here on the
 *     next login (BR-008: "shown only once").
 *
 *   { currentPassword, newPassword, confirmPassword }
 *     User filled the form. Validate the current password against the
 *     stored hash (BRV-008 wants Quikit2026 specifically, but we use the
 *     hash so a previously-changed password is also accepted), enforce
 *     password policy, hash, save, clear flag.
 */
export async function POST(req: NextRequest) {
  const token = await verifyJWT(req);
  const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
  if (!token || !userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { skip?: boolean; currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Body must be JSON" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });
  if (!user) {
    return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
  }

  // ── Skip path (FR-SA-009) ───────────────────────────────────────────────
  if (body.skip) {
    await db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false },
    });
    return NextResponse.json({ success: true, skipped: true });
  }

  // ── Set-new-password path ───────────────────────────────────────────────
  const { currentPassword, newPassword, confirmPassword } = body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { success: false, error: "All password fields are required." },
      { status: 400 }
    );
  }

  if (newPassword !== confirmPassword) {
    // FRD §7 — exact wording.
    return NextResponse.json(
      { success: false, error: "Passwords do not match. Please re-enter." },
      { status: 400 }
    );
  }

  // BRV-008 — current password must match the user's actual stored password.
  // We use bcrypt rather than a literal Quikit2026 string compare so users
  // who previously changed it via the in-app flow can still re-enter this
  // route without re-issuing a password.
  if (!user.password) {
    return NextResponse.json(
      { success: false, error: "Account has no password set. Use Forgot Password." },
      { status: 400 }
    );
  }
  const okCurrent = await bcrypt.compare(currentPassword, user.password);
  if (!okCurrent) {
    return NextResponse.json(
      { success: false, error: "Incorrect password. Please enter your default password to proceed." },
      { status: 400 }
    );
  }

  // BRV-006 — password policy: ≥8 chars, 1 uppercase, 1 number, 1 special.
  const policyError = checkPasswordPolicy(newPassword);
  if (policyError) {
    return NextResponse.json({ success: false, error: policyError }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await db.user.update({
    where: { id: user.id },
    data: { password: hashed, mustChangePassword: false },
  });

  return NextResponse.json({ success: true });
}

function checkPasswordPolicy(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character.";
  if (pw === DEFAULT_INVITE_PASSWORD) {
    return "New password cannot be the same as the default password.";
  }
  return null;
}
