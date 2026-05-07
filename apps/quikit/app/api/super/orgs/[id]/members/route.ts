import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { logAudit } from "@/lib/auditLog";
import { sendMemberAddedEmail } from "@/lib/email";
import { directAddMemberSchema } from "@/lib/schemas/superAdminSchemas";
import {
  DEFAULT_INVITE_PASSWORD,
  MEMBERSHIP_ROLES,
  MEMBERSHIP_ROLE_LABELS,
} from "@quikit/shared";
import bcrypt from "bcryptjs";

/**
 * FRD FR-SA-011 — direct-add member from the Superadmin panel.
 *
 * Skips the invitation email flow entirely: creates the User (if new) with
 * the system default password, activates the membership immediately, and
 * grants UserAppAccess for any selected appIds. The user receives a
 * "you've been added" email with their credentials, and on first login is
 * routed through the Set-Password screen (BR-008) before reaching the
 * dashboard.
 *
 * Request:
 *   {
 *     orgId, email, firstName, lastName,
 *     role: "org_admin" | "app_admin" | "member",
 *     appIds?: string[]   // required for app_admin (matches FR-OA-002 logic)
 *   }
 *
 * The orgId in the URL takes precedence over any orgId in the body — we
 * accept either for ergonomic CLI calls.
 */
export const POST = withSuperAdminAuth<{ id: string }>(
  async ({ userId: adminUserId }, request: NextRequest, { params }) => {
    try {
      const orgId = params.id;
      const body = await request.json();

      const parsed = directAddMemberSchema.safeParse({ ...body, orgId });
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
          { status: 400 }
        );
      }
      const { email, firstName, lastName, role, appIds } = parsed.data;

      // FR-OA-002 — App Admin must be assigned to at least one app.
      if (role === MEMBERSHIP_ROLES.APP_ADMIN && appIds.length === 0) {
        return NextResponse.json(
          { success: false, error: "Select at least one application for the App Admin." },
          { status: 400 }
        );
      }

      const org = await db.org.findUnique({
        where: { id: orgId },
        select: { id: true, name: true },
      });
      if (!org) {
        return NextResponse.json(
          { success: false, error: "Organisation not found" },
          { status: 404 }
        );
      }

      // BRV-005 — selected apps must be provisioned for this org.
      if (appIds.length > 0) {
        const provisioned = await db.orgAppAccess.findMany({
          where: { orgId, appId: { in: appIds }, enabled: true },
          select: { appId: true },
        });
        const provisionedIds = new Set(provisioned.map((p) => p.appId));
        const missing = appIds.filter((id) => !provisionedIds.has(id));
        if (missing.length > 0) {
          return NextResponse.json(
            { success: false, error: "One or more selected applications are not available to this organisation." },
            { status: 422 }
          );
        }
      }

      // Look up user; create with default password if new.
      let user = await db.user.findUnique({ where: { email } });
      let isNewUser = false;
      if (!user) {
        user = await db.user.create({
          data: {
            email,
            firstName,
            lastName,
            password: await bcrypt.hash(DEFAULT_INVITE_PASSWORD, 10),
            mustChangePassword: true,
          },
        });
        isNewUser = true;
      }

      // BRV-010 — block duplicate active membership.
      const existing = await db.orgMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.id } },
      });
      if (existing && existing.status === "active") {
        return NextResponse.json(
          { success: false, error: "This email is already associated with a member of this organisation." },
          { status: 409 }
        );
      }

      const membership = await db.orgMember.upsert({
        where: { orgId_userId: { orgId, userId: user.id } },
        create: {
          orgId,
          userId: user.id,
          role,
          status: "active",
          inviteAppIds: appIds,
          createdBy: adminUserId,
        },
        update: {
          role,
          status: "active",
          inviteAppIds: appIds,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      // Grant UserAppAccess scoped to the selected apps. App Admin gets
      // "admin" role on each app; everyone else gets "member" (FR-OA-002).
      if (appIds.length > 0) {
        const userAppRole = role === MEMBERSHIP_ROLES.APP_ADMIN ? "admin" : "member";
        await db.userAppAccess.createMany({
          data: appIds.map((appId) => ({
            userId: user.id,
            orgId,
            appId,
            role: userAppRole,
            grantedBy: adminUserId,
          })),
          skipDuplicates: true,
        });
      }

      logAudit({
        action: "add_member_direct",
        entityType: "membership",
        entityId: membership.id,
        actorId: adminUserId,
        orgId,
        newValues: JSON.stringify({ email, role, userId: user.id, appIds }),
      });

      // Fire-and-forget welcome email. Temp password is only included for
      // newly created users; existing users keep their own password.
      const roleLabel =
        MEMBERSHIP_ROLE_LABELS[role as keyof typeof MEMBERSHIP_ROLE_LABELS] ?? role;
      sendMemberAddedEmail({
        to: user.email,
        orgName: org.name,
        role: roleLabel,
        tempPassword: isNewUser ? DEFAULT_INVITE_PASSWORD : undefined,
      }).catch((err) =>
        console.error("[email] Failed to send member added email:", user.email, err)
      );

      return NextResponse.json({ success: true, data: membership }, { status: 201 });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Operation failed";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }
);
