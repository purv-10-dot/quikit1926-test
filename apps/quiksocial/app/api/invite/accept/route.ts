/**
 * /api/invite/accept
 *
 * GET  — verify the token (no session required). Returns the invite's
 *        email + assignments so the accept page can render
 *        "You've been invited to <workspaces> as <roles>" before login.
 *
 * POST — accept the invite. Requires a logged-in session whose email
 *        matches the invite. Upserts BrandMembership rows in a Prisma
 *        transaction along with the invite's status flip, then sets
 *        UserPreference.activeBrandId if the user has none.
 *
 * Ported to QuikIT (Phase 3, Batch 4):
 *   - GET: no withOrgAuth — token is the auth. orgId = DEFAULT_ORG_ID.
 *   - POST: withOrgAuth (session). orgId from session for the
 *     UserPreference / BrandMembership writes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { verifyInviteToken } from "@/lib/auth/invite-token";

const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.DEFAULT_TENANT_ID ||
  "org_quiksocial_default";

interface InviteAssignment {
  id: string;
  brandId: string;
  workspace: string;
  role: "admin" | "member";
}

interface InviteDoc {
  id: string;
  orgId: string;
  email: string;
  invitedBy: string;
  assignments: InviteAssignment[];
  status: "pending" | "accepted" | "revoked";
}

async function loadInvite(
  token: string,
  orgId: string,
): Promise<
  | { ok: true; invite: InviteDoc; email: string }
  | { ok: false; status: number; error: string; code: string }
> {
  const decoded = verifyInviteToken(token);
  if (!decoded) {
    return {
      ok: false,
      status: 400,
      error: "This invitation link is invalid or has expired.",
      code: "INVALID_TOKEN",
    };
  }

  const invite = await db.brandInvite.findFirst({
    where: { id: decoded.inviteId, orgId },
    include: { assignments: true },
  });
  if (!invite) {
    return {
      ok: false,
      status: 404,
      error: "Invitation not found.",
      code: "INVITE_NOT_FOUND",
    };
  }

  if (invite.email.toLowerCase().trim() !== decoded.email) {
    return {
      ok: false,
      status: 400,
      error: "Invitation email mismatch.",
      code: "EMAIL_MISMATCH",
    };
  }

  if (invite.status !== "pending") {
    return {
      ok: false,
      status: 410,
      error:
        invite.status === "accepted"
          ? "This invitation has already been accepted."
          : "This invitation has been revoked.",
      code: invite.status === "accepted" ? "ALREADY_ACCEPTED" : "REVOKED",
    };
  }

  return {
    ok: true,
    invite: {
      id: invite.id,
      orgId: invite.orgId,
      email: invite.email,
      invitedBy: invite.invitedBy,
      status: invite.status as InviteDoc["status"],
      assignments: invite.assignments.map((a) => ({
        id: a.id,
        brandId: a.brandId,
        workspace: a.workspace,
        role: a.role as "admin" | "member",
      })),
    },
    email: decoded.email,
  };
}

// ---------------------------------------------------------------------------
// GET — verify token, return invite preview (NO SESSION)
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") || "";

  // No session — invite preview is intentionally public so the accept
  // page can render before login. The token itself binds the invite to
  // a specific id, so isolation comes from there.
  const orgId = DEFAULT_ORG_ID;
  const result = await loadInvite(token, orgId);

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        error: result.error,
        code: result.code,
        data: { valid: false },
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      valid: true,
      email: result.invite.email,
      assignments: result.invite.assignments.map((a) => ({
        workspace: a.workspace,
        role: a.role,
      })),
    },
  });
}

// ---------------------------------------------------------------------------
// POST — accept invite (requires logged-in session matching invite email)
// ---------------------------------------------------------------------------
const acceptBodySchema = z.object({ token: z.string().min(1) });

export const POST = withOrgAuth(async ({ orgId, userId, session }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = acceptBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Token is required", code: "INVALID_BODY" },
      { status: 400 },
    );
  }
  const { token } = parsed.data;

  const result = await loadInvite(token, orgId);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error, code: result.code },
      { status: result.status },
    );
  }
  const { invite } = result;

  const sessionEmail = (session.user?.email || "").toLowerCase().trim();
  if (sessionEmail !== invite.email.toLowerCase().trim()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "This invitation is for a different email address. Sign in with the invited account.",
        code: "EMAIL_MISMATCH",
      },
      { status: 403 },
    );
  }

  // Apply assignments + flip the invite atomically.
  await db.$transaction(async (tx) => {
    for (const assignment of invite.assignments) {
      if (!assignment.brandId || !assignment.role) continue;

      await tx.brandMembership.upsert({
        where: {
          orgId_userId_brandId: {
            orgId: invite.orgId,
            userId,
            brandId: assignment.brandId,
          },
        },
        update: {
          email: invite.email,
          workspace: assignment.workspace,
          role: assignment.role,
          invitedBy: invite.invitedBy,
        },
        create: {
          orgId: invite.orgId,
          userId,
          brandId: assignment.brandId,
          email: invite.email,
          workspace: assignment.workspace,
          role: assignment.role,
          invitedBy: invite.invitedBy,
        },
      });
    }

    await tx.brandInvite.update({
      where: { id: invite.id },
      data: {
        status: "accepted",
        acceptedByUserId: userId,
        acceptedAt: new Date(),
      },
    });
  });

  // Set activeBrandId on UserPreference only if not already set.
  const firstBrandId = invite.assignments[0]?.brandId ?? null;
  if (firstBrandId) {
    const existing = await db.userPreference.findUnique({
      where: { orgId_userId: { orgId: invite.orgId, userId } },
    });
    if (!existing) {
      await db.userPreference.create({
        data: {
          orgId: invite.orgId,
          userId,
          activeBrandId: firstBrandId,
        },
      });
    } else if (!existing.activeBrandId) {
      await db.userPreference.update({
        where: { orgId_userId: { orgId: invite.orgId, userId } },
        data: { activeBrandId: firstBrandId },
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: { redirectTo: "/dashboard" },
  });
});
