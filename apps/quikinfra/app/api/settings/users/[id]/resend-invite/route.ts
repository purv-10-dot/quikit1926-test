import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { generateInviteToken, formatExpiryHint } from "@/lib/invites/tokens";
import { sendMail, getAppUrl } from "@/lib/email/mailer";
import { buildUserInviteEmail } from "@/lib/email/templates/user-invite";
import { requireSuperAdmin } from "@/lib/auth/context";

/**
 * POST /api/settings/users/:id/resend-invite
 *
 * Rotates the invite token (old token is dead the moment this is
 * called), resets the expiry, and resends the invitation email. Used
 * when the original email was lost or the token expired.
 *
 * The user's status is flipped back to "invited" if it wasn't already,
 * but ONLY if they haven't accepted yet — accepted users cannot have
 * their account reset via this endpoint.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctxOrResponse = await requireSuperAdmin();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;

  const user = await (db as any).cnUser.findUnique({
    where: { id: params.id },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.acceptedAt) {
    return NextResponse.json(
      {
        error:
          "This user has already accepted their invite. Use password reset instead.",
      },
      { status: 409 }
    );
  }

  const invite = generateInviteToken();
  await (db as any).cnUser.update({
    where: { id: params.id },
    data: {
      inviteToken: invite.token,
      inviteTokenExpires: new Date(invite.expiresAt),
      invitedAt: new Date(),
      status: "invited",
    },
  });

  const inviteUrl = `${getAppUrl()}/invite/${invite.token}`;

  let mailResult: { sent: boolean; outboxPath?: string; error?: string };
  try {
    if (user.email) {
      const { subject, html } = buildUserInviteEmail({
        fullName: user.fullName,
        inviteUrl,
        invitedByName: user.invitedByName ?? "QuikInfra Admin",
        userType: user.userType,
        department: user.department,
        expiresInText: formatExpiryHint(invite.expiresAt),
      });
      const res = await sendMail({ to: user.email, subject, html });
      mailResult = {
        sent: res.success,
        outboxPath: res.outboxPath,
        error: res.error,
      };
    } else {
      mailResult = { sent: false, error: "No email address on record" };
    }
  } catch (e: any) {
    mailResult = { sent: false, error: e?.message ?? "Mailer threw" };
  }

  return NextResponse.json({
    success: true,
    invite: {
      url: inviteUrl,
      expiresAt: invite.expiresAt,
      mail: mailResult,
    },
  });
}
