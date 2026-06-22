import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { signRealtimeToken } from "@quikit/realtime/server";

/**
 * Mint a short-lived handshake token for the Socket.io connection.
 *
 * The browser cannot read the NextAuth session cookie (httpOnly) and the socket
 * server is on a different origin, so the client calls this same-origin endpoint
 * (cookie travels here normally) to get a token it can pass in the handshake.
 * The token carries only { userId, orgId, teamId } and is verified by the relay
 * with the shared secret.
 */
export const GET = withOrgAuth(async ({ userId, orgId }) => {
  const member = await db.orgMember.findFirst({
    where: { userId, orgId },
    select: { teamId: true },
  });

  const token = signRealtimeToken({
    userId,
    orgId,
    teamId: member?.teamId ?? null,
  });

  return NextResponse.json({
    success: true,
    data: {
      token,
      url: process.env.NEXT_PUBLIC_REALTIME_URL ?? null,
    },
  });
});
