/**
 * /api/workspace-role/[id]
 *
 * PATCH  — change a BrandMembership row's role (admin↔member). Caller
 *          must be admin of the brand the row belongs to.
 *
 * DELETE — remove a BrandMembership row (revoke workspace access).
 *          Same RBAC + extra guards:
 *            - cannot remove yourself
 *            - cannot remove the brand creator (App Admin / crown). Their
 *              admin status comes from Brand.createdBy via the rbac
 *              fallback, not from this row.
 *
 * Ported to QuikIT (Phase 3, Batch 4).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isAdminInBrand } from "@/lib/auth/rbac";

const patchRoleSchema = z.object({ role: z.enum(["admin", "member"]) });

export const PATCH = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, req: NextRequest, { params }) => {
    const json = await req.json().catch(() => null);
    const parsed = patchRoleSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "role must be 'admin' or 'member'" },
        { status: 400 },
      );
    }
    const { role } = parsed.data;

    const target = await db.brandMembership.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, brandId: true, userId: true, role: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Role record not found" },
        { status: 404 },
      );
    }

    const callerIsAdmin = await isAdminInBrand(orgId, userId, target.brandId);
    if (!callerIsAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Only brand admins can change roles",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }

    const updated = await db.brandMembership.update({
      where: { id: params.id },
      data: { role, updatedBy: userId },
    });

    return NextResponse.json({
      success: true,
      data: { role: { ...updated, _id: updated.id } },
    });
  },
);

export const DELETE = withOrgAuth<{ id: string }>(
  async ({ orgId, userId }, _req, { params }) => {
    const target = await db.brandMembership.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, brandId: true, userId: true },
    });
    if (!target) {
      return NextResponse.json(
        { success: false, error: "Role record not found" },
        { status: 404 },
      );
    }

    const callerIsAdmin = await isAdminInBrand(orgId, userId, target.brandId);
    if (!callerIsAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Only brand admins can remove members",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }

    if (target.userId === userId) {
      return NextResponse.json(
        {
          success: false,
          error: "You cannot remove yourself from a workspace",
          code: "CANNOT_REMOVE_SELF",
        },
        { status: 422 },
      );
    }

    // Brand creator's admin access comes from Brand.createdBy via the rbac
    // fallback, not from this row. Don't pretend we revoked them.
    const brand = await db.brand.findFirst({
      where: { id: target.brandId, orgId },
      select: { createdBy: true },
    });
    if (brand?.createdBy && brand.createdBy === target.userId) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot remove the workspace creator (App Admin)",
          code: "CANNOT_REMOVE_APP_ADMIN",
        },
        { status: 422 },
      );
    }

    await db.brandMembership.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, data: null });
  },
);
