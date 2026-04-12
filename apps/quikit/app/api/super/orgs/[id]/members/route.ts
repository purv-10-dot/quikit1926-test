import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/requireSuperAdmin";
import { logAudit } from "@/lib/auditLog";
import { sendMemberAddedEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/**
 * POST /api/super/orgs/[id]/members — add a member to an organization (super admin only)
 *
 * Creates the user if they don't exist, then creates or reactivates a membership.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireSuperAdmin();
    if ("error" in auth) return auth.error;

    const tenantId = params.id;
    const body = await request.json();
    const { email, firstName, lastName, role, password } = body;

    // Validate required fields
    if (!email || !firstName || !lastName || !role) {
      return NextResponse.json(
        { success: false, error: "Email, first name, last name, and role are required" },
        { status: 400 },
      );
    }

    if (!["owner", "admin", "member", "viewer"].includes(role)) {
      return NextResponse.json(
        { success: false, error: "Role must be owner, admin, member, or viewer" },
        { status: 400 },
      );
    }

    // Verify the org exists
    const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    // Find or create user
    let user = await db.user.findUnique({ where: { email } });

    if (!user) {
      // Create new user — use provided password or generate a random one
      const rawPassword = password || crypto.randomBytes(16).toString("base64url");
      const hashedPassword = await bcrypt.hash(rawPassword, 12);

      user = await db.user.create({
        data: {
          email,
          firstName,
          lastName,
          password: hashedPassword,
        },
      });
    }

    // Check if membership already exists
    const existing = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });

    if (existing && existing.status === "active") {
      return NextResponse.json(
        { success: false, error: "This user is already an active member of this organization" },
        { status: 409 },
      );
    }

    // Create or reactivate membership
    const membership = await db.membership.upsert({
      where: { tenantId_userId: { tenantId, userId: user.id } },
      create: {
        tenantId,
        userId: user.id,
        role,
        status: "active",
        createdBy: auth.userId,
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
      actorId: auth.userId,
      tenantId,
      newValues: JSON.stringify({ email, role, userId: user.id }),
    });

    // Fire-and-forget email notification
    sendMemberAddedEmail({ to: user.email, orgName: tenant.name, role }).catch(() => {});

    return NextResponse.json({ success: true, data: membership }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
