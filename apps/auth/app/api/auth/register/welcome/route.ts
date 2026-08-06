import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@quikit/auth/jwt";
import { db } from "@/lib/db";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * POST /api/auth/register/welcome — sends the welcome / trial-started email at
 * the end of self-serve registration.
 *
 * The client calls this from the final onboarding screen ("A few quick
 * details") on its two completion exits — Continue and Skip for now — because
 * at that point the user has verified their email, set a password, had their
 * Org + membership + trial subscription provisioned, and holds a live session.
 * Nothing earlier in the flow qualifies: /api/auth/register creates a
 * password-less row that abandoned sign-ups leave behind.
 *
 * This endpoint and POST /api/super/orgs are the ONLY two places the welcome
 * email is sent. It changes no registration state — it only mails — so it is
 * completely outside the signup / auth / onboarding logic.
 *
 * Auth: the session established by the register flow's
 * `signIn(credentials, { redirect: false })`, read from the NextAuth JWT —
 * same guard as /api/auth/register/profile.
 */
export async function POST(req: NextRequest) {
  try {
    const token = await verifyJWT(req);
    const userId = token ? ((token.sub ?? token.id) as string | undefined) : undefined;
    if (!token || !userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, password: true, emailVerified: true },
    });
    // Registration must actually be complete — a password AND a verified email
    // are both set by /api/auth/register/complete.
    if (!user || !user.password || !user.emailVerified) {
      return NextResponse.json(
        { success: false, error: "Registration is not complete." },
        { status: 400 },
      );
    }

    try {
      await sendWelcomeEmail({ to: user.email, firstName: user.firstName });
    } catch (err: unknown) {
      // Non-fatal: the user is already inside the product, and the welcome
      // email must never block entry. Matches how /api/auth/register treats a
      // failed OTP send.
      console.error("[register/welcome] welcome email send failed:", err);
      return NextResponse.json({ success: true, sent: false });
    }

    return NextResponse.json({ success: true, sent: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
