/**
 * /api/invite
 *
 * POST — workspace admin creates / merges a pending BrandInvite for the
 *        given email across one or more brands (each with its own role).
 *        Returns a copy-able invite link signed via HMAC.
 *
 * GET   — list members:
 *           ?brandId=X    → all BrandMembership rows for that brand
 *                           (caller must be admin of X)
 *           (no brandId)  → grouped per-user rows across every brand the
 *                           caller admins, used by the Invite User table.
 *
 * Ported to QuikIT (Phase 3, Batch 4).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { isAdminInBrand } from "@/lib/auth/rbac";
import { generateInviteToken } from "@/lib/auth/invite-token";
import { parseNameFromEmail } from "@/lib/utils/parse-name-from-email";

const workspaceRoleSchema = z.object({
  brandId: z.string().min(1),
  role: z.enum(["admin", "member"]),
});

const createInviteSchema = z.object({
  email: z
    .string()
    .min(1)
    .transform((s) => s.toLowerCase().trim())
    .refine((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), {
      message: "A valid email is required",
    }),
  workspaceRoles: z.array(workspaceRoleSchema).min(1),
});

// ---------------------------------------------------------------------------
// POST /api/invite
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const json = await req.json().catch(() => null);
  const parsed = createInviteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(", "),
      },
      { status: 400 },
    );
  }
  const { email, workspaceRoles } = parsed.data;

  // Caller must be admin of every brand they're trying to assign roles in.
  const brandIds = workspaceRoles.map((wr) => wr.brandId);
  const brands = await db.brand.findMany({
    where: { orgId, id: { in: brandIds } },
    select: { id: true, name: true, createdBy: true },
  });
  const brandsById = new Map(brands.map((b) => [b.id, b]));

  for (const wr of workspaceRoles) {
    const brand = brandsById.get(wr.brandId);
    if (!brand) {
      return NextResponse.json(
        { success: false, error: `Brand ${wr.brandId} not found` },
        { status: 404 },
      );
    }
    const callerIsAdmin = await isAdminInBrand(orgId, userId, wr.brandId);
    if (!callerIsAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: `You are not an admin of "${brand.name}"`,
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }
  }

  // Build assignment list with denormalised workspace name.
  const newAssignments = workspaceRoles.map((wr) => ({
    brandId: wr.brandId,
    workspace: brandsById.get(wr.brandId)?.name ?? wr.brandId,
    role: wr.role,
  }));

  // Merge with any existing pending invite for (email, inviter).
  const existing = await db.brandInvite.findFirst({
    where: {
      orgId,
      email,
      invitedBy: userId,
      status: "pending",
    },
    include: { assignments: true },
  });

  let inviteId: string;
  let inviteToken: string;

  if (existing) {
    inviteId = existing.id;

    const existingByBrand = new Map(
      existing.assignments.map((a) => [a.brandId, a]),
    );

    for (const a of newAssignments) {
      const prior = existingByBrand.get(a.brandId);
      if (prior) {
        if (prior.role !== a.role || prior.workspace !== a.workspace) {
          await db.brandInviteAssignment.update({
            where: { id: prior.id },
            data: { role: a.role, workspace: a.workspace },
          });
        }
      } else {
        await db.brandInviteAssignment.create({
          data: {
            orgId,
            inviteId,
            brandId: a.brandId,
            workspace: a.workspace,
            role: a.role,
          },
        });
      }
    }

    if (!existing.inviteToken) {
      inviteToken = generateInviteToken(email, inviteId);
      await db.brandInvite.update({
        where: { id: inviteId },
        data: { inviteToken },
      });
    } else {
      inviteToken = existing.inviteToken;
    }
  } else {
    // Two-step: create the invite first so we have its ID, then sign the
    // token with it. (Original used createId() up-front; we let Prisma
    // generate via @default(cuid) and pull the ID from the create result.)
    const created = await db.brandInvite.create({
      data: {
        orgId,
        email,
        invitedBy: userId,
        status: "pending",
        // inviteToken is set in the second step.
        assignments: {
          create: newAssignments.map((a) => ({
            orgId,
            brandId: a.brandId,
            workspace: a.workspace,
            role: a.role,
          })),
        },
      },
    });
    inviteId = created.id;
    inviteToken = generateInviteToken(email, inviteId);
    await db.brandInvite.update({
      where: { id: inviteId },
      data: { inviteToken },
    });
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ||
    `${req.nextUrl.protocol}//${req.nextUrl.host}`;
  const inviteLink = `${baseUrl}/invite/accept?token=${encodeURIComponent(
    inviteToken,
  )}`;

  return NextResponse.json({
    success: true,
    data: { inviteId, inviteLink },
  });
});

// ---------------------------------------------------------------------------
// GET /api/invite
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const brandIdParam = new URL(req.url).searchParams.get("brandId");

  if (brandIdParam) {
    const isAdmin = await isAdminInBrand(orgId, userId, brandIdParam);
    if (!isAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: "Only brand admins can list members",
          code: "INSUFFICIENT_ROLE",
        },
        { status: 403 },
      );
    }
    const members = await db.brandMembership.findMany({
      where: { orgId, brandId: brandIdParam },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      success: true,
      data: { members: members.map((m) => ({ ...m, _id: m.id })) },
    });
  }

  // No brandId — grouped view across every brand the caller admins.
  const ownedBrands = await db.brand.findMany({
    where: { orgId, createdBy: userId },
    select: { id: true, name: true, createdBy: true },
  });

  const adminRoleRows = await db.brandMembership.findMany({
    where: { orgId, userId, role: "admin" },
    select: { brandId: true },
  });
  const extraBrandIds = adminRoleRows.map((r) => r.brandId);

  const allBrands = extraBrandIds.length
    ? await db.brand.findMany({
        where: {
          orgId,
          OR: [{ createdBy: userId }, { id: { in: extraBrandIds } }],
        },
        select: { id: true, name: true, createdBy: true },
      })
    : ownedBrands;

  if (!allBrands.length) {
    return NextResponse.json({
      success: true,
      data: { users: [], brands: [] },
    });
  }

  const brandIds = allBrands.map((b) => b.id);
  const brandLookup = new Map(allBrands.map((b) => [b.id, b]));

  const rows = await db.brandMembership.findMany({
    where: { orgId, brandId: { in: brandIds } },
  });

  // Brand creators with no BrandMembership row are admins via the rbac
  // fallback. Synthesize a virtual admin row so they appear in the table.
  const synthRows = allBrands
    .filter((b) => b.createdBy)
    .map((b) => ({
      id: `virtual:${b.id}`,
      userId: b.createdBy as string,
      email: undefined as string | undefined,
      brandId: b.id,
      role: "admin" as const,
    }));

  const seen = new Set(rows.map((r) => `${r.userId}|${r.brandId}`));
  const merged = [
    ...rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      email: r.email ?? undefined,
      brandId: r.brandId,
      role: r.role,
    })),
    ...synthRows.filter((s) => !seen.has(`${s.userId}|${s.brandId}`)),
  ];

  const userIds = Array.from(new Set(merged.map((r) => r.userId)));
  const userDocs = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const userById = new Map(userDocs.map((u) => [u.id, u]));

  const brandCreatorIds = new Set(
    allBrands.map((b) => b.createdBy).filter(Boolean) as string[],
  );

  const grouped = userIds.map((uid) => {
    const userRows = merged.filter((r) => r.userId === uid);
    const userDoc = userById.get(uid);
    const email =
      userDoc?.email ?? userRows.find((r) => r.email)?.email ?? "";
    const fullName =
      [userDoc?.firstName, userDoc?.lastName].filter(Boolean).join(" ").trim();
    const name = fullName || (email ? parseNameFromEmail(email) : "User");
    return {
      userId: uid,
      name,
      email,
      isAppAdmin: brandCreatorIds.has(uid),
      assignments: userRows.map((r) => ({
        brandId: r.brandId,
        workspace: brandLookup.get(r.brandId)?.name ?? r.brandId,
        role: r.role,
        roleId: r.id,
        virtual: typeof r.id === "string" && r.id.startsWith("virtual:"),
      })),
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      users: grouped,
      brands: allBrands.map((b) => ({ _id: b.id, name: b.name })),
    },
  });
});
