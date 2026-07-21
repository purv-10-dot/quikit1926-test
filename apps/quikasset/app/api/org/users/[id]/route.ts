import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikAssetAppId, isAdminRole } from "@/lib/api/permissions";
import { ensureLinkedEmployee } from "@/lib/api/employeeLink";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  firstName: z.string().trim().min(1).max(64).optional(),
  lastName: z.string().trim().min(1).max(64).optional(),
  /** New password — if provided, replaces the bcrypt hash. ≥ 8 chars. */
  password: z.string().min(8).max(128).optional(),
  /** Membership status flip. */
  status: z.enum(["active", "inactive"]).optional(),
  // Linked-employee fields (identity bridge). Nullable so a value can be cleared.
  contact: z.string().trim().max(64).nullable().optional(),
  department: z.string().trim().max(128).nullable().optional(),
  designation: z.string().trim().max(128).nullable().optional(),
  joiningDate: z.string().trim().max(32).nullable().optional(),
  // Employee ID — editable, but must stay unique within the org (enforced below,
  // backed by the DB's @@unique([orgId, employeeId])). Not nullable: can't be blanked.
  employeeId: z.string().trim().min(1, "Employee ID cannot be empty").max(64).optional(),
});

// GET /api/org/users/[id] — admin fetches a single member's editable state:
// platform fields + status. Used to prefill the Edit User drawer.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string; userId: string };

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: {
        status: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            lastSignInAt: true,
          },
        },
      },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "User not in organisation" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...membership.user,
        status: membership.status,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/org/users/[id] — admin updates an existing org member. Updates
// platform User fields (firstName, lastName, password) plus OrgMember.status.
// Email is intentionally NOT editable — it's the login identifier and updating
// it would risk breaking existing sessions and audit trails.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string; userId: string };

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { firstName, lastName, password, status, contact, department, designation, joiningDate, employeeId } =
      parsed.data;

    // Tenant isolation: confirm the target is an org member here.
    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "User not in organisation" },
        { status: 404 },
      );
    }

    // ─── User fields (platform-wide) ───
    const userPatch: { firstName?: string; lastName?: string; password?: string } = {};
    if (firstName !== undefined) userPatch.firstName = firstName;
    if (lastName !== undefined) userPatch.lastName = lastName;
    if (password !== undefined) userPatch.password = await bcrypt.hash(password, 12);
    if (Object.keys(userPatch).length > 0) {
      await db.user.update({ where: { id: params.id }, data: userPatch });
    }

    // ─── OrgMember.status ───
    if (status !== undefined) {
      await db.orgMember.update({ where: { id: membership.id }, data: { status } });
    }

    // ─── Linked employee fields (identity bridge) ───
    const empPatch: Record<string, string | null> = {};
    if (contact !== undefined) empPatch.contact = contact;
    if (department !== undefined) empPatch.department = department;
    if (designation !== undefined) empPatch.designation = designation;
    if (joiningDate !== undefined) empPatch.joiningDate = joiningDate;
    if (Object.keys(empPatch).length > 0 || employeeId !== undefined) {
      const emp = await db.astEmployee.findFirst({
        where: { orgId, userId: params.id },
        select: { id: true, employeeId: true },
      });

      // Employee ID is editable but must stay unique within the org. Validate
      // before writing (excluding the user's OWN employee row), so a clash is a
      // clean 409 rather than a raw @@unique violation surfacing as a 500. Only
      // checks when the value actually changes.
      if (employeeId !== undefined && employeeId !== emp?.employeeId) {
        const clash = await db.astEmployee.findFirst({
          where: { orgId, employeeId, ...(emp ? { NOT: { id: emp.id } } : {}) },
          select: { id: true },
        });
        if (clash) {
          return NextResponse.json(
            { success: false, error: `Employee ID '${employeeId}' is already in use.` },
            { status: 409 },
          );
        }
      }
      if (employeeId !== undefined) empPatch.employeeId = employeeId;

      if (emp) {
        await db.astEmployee.update({ where: { id: emp.id }, data: empPatch });
      } else {
        // Legacy login with no employee yet → create + link one from the values.
        const u = await db.user.findUnique({
          where: { id: params.id },
          select: { email: true, firstName: true, lastName: true },
        });
        if (u) {
          await ensureLinkedEmployee({
            orgId,
            userId: params.id,
            email: u.email,
            name: `${u.firstName} ${u.lastName}`.trim(),
            employeeId: employeeId ?? undefined,
            contact: contact ?? undefined,
            department: department ?? undefined,
            designation: designation ?? undefined,
            joiningDate: joiningDate ?? undefined,
          });
        }
      }
    }

    const updated = await db.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        lastSignInAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/org/users/[id] — SOFT-remove a person from QuikAsset: record a
// removal marker (AstUserRemoval). They're hidden from the Users list and denied
// access at the auth layer, but no row is deleted — every User/OrgMember/
// UserAppAccess/AstUserAppRole/AstEmployee record is retained for audit/history.
// Admin-lockout guarded; tenant-scoped.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as { orgId: string; userId: string };

    const membership = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { user: { select: { firstName: true, lastName: true, email: true } } },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "User not in organisation" }, { status: 404 });
    }

    const appId = await getQuikAssetAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "QuikAsset app not registered" }, { status: 500 });
    }

    // Admin-lockout guard — never strip QuikAsset's last admin.
    const currentRoles = await db.astUserAppRole.findMany({
      where: { userId: params.id, orgId, role: { appId } },
      select: { role: { select: { id: true, isSystem: true, name: true } } },
    });
    if (currentRoles.some((ur) => isAdminRole(ur.role))) {
      const adminCount = await db.astUserAppRole.count({
        where: { orgId, role: { appId, isSystem: true, name: "admin" } },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: "Cannot remove the last admin from QuikAsset." },
          { status: 409 },
        );
      }
    }

    // Soft-remove: record a removal marker. Idempotent. NOTHING is hard-deleted
    // — User, OrgMember, UserAppAccess, AstUserAppRole and AstEmployee (incl. any
    // asset history) all stay for audit/history. Access is denied via the auth
    // layer and the user is hidden from the merged Users list.
    await db.astUserRemoval.upsert({
      where: { orgId_userId: { orgId, userId: params.id } },
      create: { orgId, userId: params.id, removedBy: actorId },
      update: { removedAt: new Date(), removedBy: actorId },
    });

    const name =
      `${membership.user.firstName} ${membership.user.lastName}`.trim() || membership.user.email;
    await audit({
      orgId,
      module: "Users",
      action: "Removed from QuikAsset",
      entityId: params.id,
      entityName: name,
      actorId,
    });

    return NextResponse.json({ success: true, data: { removed: true } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to remove user";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
