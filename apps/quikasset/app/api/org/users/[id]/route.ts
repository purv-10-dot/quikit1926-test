import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";

const patchSchema = z.object({
  firstName: z.string().trim().min(1).max(64).optional(),
  lastName: z.string().trim().min(1).max(64).optional(),
  /** New password — if provided, replaces the bcrypt hash. ≥ 8 chars. */
  password: z.string().min(8).max(128).optional(),
  /** Membership status flip. */
  status: z.enum(["active", "inactive"]).optional(),
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
    const { firstName, lastName, password, status } = parsed.data;

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
