import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { isTokenValid } from "@/lib/invites/tokens";

/**
 * POST /api/invites/accept
 * Body: { token: string, password: string }
 *
 * Finalises the invite flow: sets the chosen password, flips the user
 * to status=active, stamps acceptedAt, and clears the invite token so
 * it cannot be reused.
 *
 * Password is NOT persisted to users in plaintext. The demo login
 * flow still uses CnDemoUser scrypt hashes — this route only records
 * that the user completed the accept flow. Persisting scrypt(password)
 * onto users.passwordHash is a follow-up.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (!/[A-Z]/.test(password) || !/\d/.test(password)) {
      return NextResponse.json(
        { error: "Password must include at least one uppercase letter and one digit" },
        { status: 400 }
      );
    }

    const user = await (db as any).cnUser.findFirst({
      where: { inviteToken: token },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invite link not found. It may have been revoked or already used." },
        { status: 404 }
      );
    }
    const tokenInfo = {
      inviteToken: user.inviteToken,
      inviteTokenExpires: user.inviteTokenExpires
        ? user.inviteTokenExpires instanceof Date
          ? user.inviteTokenExpires.toISOString()
          : String(user.inviteTokenExpires)
        : null,
    };
    if (!isTokenValid(tokenInfo)) {
      return NextResponse.json(
        { error: "This invite link has expired. Ask your administrator to send a new one." },
        { status: 410 }
      );
    }
    if (user.acceptedAt) {
      return NextResponse.json(
        { error: "This invite has already been accepted. Please log in instead." },
        { status: 409 }
      );
    }

    await (db as any).cnUser.update({
      where: { id: user.id },
      data: {
        status: "active",
        acceptedAt: new Date(),
        inviteToken: null,
        inviteTokenExpires: null,
        // Note: the plaintext password is intentionally dropped on the floor.
        // When users migrate fully off CnDemoUser, persist scrypt(password) here.
      },
    });

    return NextResponse.json({
      success: true,
      username: user.username,
      loginUrl: "/login",
    });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[invites/accept.POST] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
