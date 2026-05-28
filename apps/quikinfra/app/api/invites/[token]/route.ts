import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { isTokenValid } from "@/lib/invites/tokens";

/**
 * GET /api/invites/:token — validate and return the pending invite.
 *
 * The accept-invite UI hits this first to show the user what they're
 * accepting (name, role, email) and to display an "invite expired"
 * state if the link is stale. Returns ONLY the fields safe to show
 * an unauthenticated visitor — no modules, no site list, no audit.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  // Token is the auth — look up tenant-agnostically by the indexed
  // inviteToken column.
  const user = await (db as any).cnUser.findFirst({
    where: { inviteToken: params.token },
  });

  if (!user) {
    return NextResponse.json(
      { error: "Invite link not found. It may have been revoked or already used." },
      { status: 404 }
    );
  }

  // Map Prisma DateTime back to the shape `isTokenValid` expects.
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
      {
        error: "This invite link has expired. Ask your administrator to send a new one.",
        expiredAt: tokenInfo.inviteTokenExpires,
      },
      { status: 410 }
    );
  }

  if (user.acceptedAt) {
    return NextResponse.json(
      { error: "This invite has already been accepted. Please log in instead." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    userType: user.userType,
    department: user.department,
    invitedByName: user.invitedByName,
    expiresAt: tokenInfo.inviteTokenExpires,
  });
}
