import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import { sendMemberAddedEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/super/orgs/[id]/members — add a member to an organization (super admin only)
 *
 * Creates the user if they don't exist, then creates or reactivates a membership.
 */
export const POST = withSuperAdminAuth<{ id: string }>(async ({ userId: adminUserId }, request: NextRequest, { params }) => {
  try {
    const orgId = params.id;
    const body = await request.json();
    const { email, role, password } = body;

    // Validate required fields. firstName/lastName are intentionally NOT
    // collected here — the user fills them in on first login via the
    // /complete-profile flow on apps/auth.
    if (!email || !role) {
      return NextResponse.json(
        { success: false, error: "Email and role are required" },
        { status: 400 },
      );
    }

    if (!["owner", "admin", "member", "viewer"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Role must be owner, admin, member, or viewer" },
        { status: 400 },
      );
    }

    // Verify org and look up user in parallel
    const [org, existingUser] = await Promise.all([
      db.org.findUnique({ where: { id: orgId }, select: { id: true, name: true } }),
      db.user.findUnique({ where: { email } }),
    ]);

    if (!org) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    let user = existingUser;
    let rawPassword: string | undefined;

    if (!user) {
      const newPassword: string = password || crypto.randomBytes(16).toString("base64url");
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Persist empty firstName/lastName — the User schema requires them as
      // non-null Strings, so we store "" and treat empty as "not yet set".
      // The /complete-profile flow on first login captures real values.
      user = await db.user.create({
        data: {
          email,
          firstName: "",
          lastName: "",
          password: hashedPassword,
        },
      });
      rawPassword = newPassword;
    }

    // Check if membership already exists
    const existing = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } },
    });

    if (existing && existing.status === "active") {
      return NextResponse.json(
        { success: false, error: "This user is already an active member of this organization" },
        { status: 409 },
      );
    }

    // Create or reactivate membership
    const membership = await db.orgMember.upsert({
      where: { orgId_userId: { orgId, userId: user.id } },
      create: {
        orgId,
        userId: user.id,
        role,
        status: "active",
        createdBy: adminUserId,
      },
      update: {
        role,
        status: "active",
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logAudit({
      action: "add_member",
      entityType: "membership",
      entityId: membership.id,
      actorId: adminUserId,
      orgId,
      newValues: JSON.stringify({ email, role, userId: user.id }),
    });

    // Fire-and-forget email notification. Temp password is only included for
    // newly created users; existing users keep their own password.
    sendMemberAddedEmail({
      to: user.email,
      orgName: org.name,
      role,
      tempPassword: rawPassword,
    }).catch((err) =>
      console.error("[email] Failed to send member added email:", user.email, err)
    );

    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
