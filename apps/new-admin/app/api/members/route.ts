import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";
import { sendInvitationEmail } from "@/lib/email";
import { assignNamedRolesForAccess } from "@/lib/roles-helpers";

const inviteSchema = z.object({
  name: z.string().min(2, "Full name is required").max(100),
  email: z.string().email("Invalid email address"),
  appAccess: z
    .array(z.object({ appSlug: z.string(), role: z.string() }))
    .optional()
    .default([]),
});

export const GET = withAdminAuth(async ({ orgId }) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const memberships = await db.orgMember.findMany({
    where: { orgId },
    select: {
      id: true,
      role: true,
      status: true,
      user: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          avatar: true,
          appAccess: {
            where: { orgId },
            select: { appId: true, role: true, app: { select: { slug: true } } },
          },
          // appRoles (UserAppRole) pending schema migration — see MIGRATION_NOTES.md.
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const data = memberships.map((m) => ({
    id: m.id,
    name: `${m.user.firstName} ${m.user.lastName}`.replace(/ -$/, "").trim(),
    email: m.user.email,
    avatar: m.user.avatar ?? null,
    apps: m.user.appAccess.map((a) => ({ slug: a.app.slug, role: a.role })),
    role: m.role,
    status: m.status === "invited" ? "pending" : m.status,
  }));

  return NextResponse.json({ success: true, data });
});

export const POST = withAdminAuth(async ({ orgId, userId }, req) => {
  const blocked = await gateModuleApi("admin", "members", orgId);
  if (blocked) return blocked as NextResponse;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
  }

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0].message },
      { status: 400 },
    );
  }

  const { name, email: rawEmail, appAccess } = parsed.data;
  const email = rawEmail.toLowerCase();
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(" ") || "-";
  const appSlugs = appAccess.map((a) => a.appSlug);

  const [org, existingUser] = await Promise.all([
    db.org.findUnique({ where: { id: orgId }, select: { name: true } }),
    db.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const user = existingUser ?? (await db.user.create({ data: { email, firstName, lastName } }));

  const [existing, apps] = await Promise.all([
    db.orgMember.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } }),
    appSlugs.length > 0
      ? db.app.findMany({
          where: { slug: { in: appSlugs } },
          select: { id: true, slug: true, name: true },
        })
      : Promise.resolve([] as { id: string; slug: string; name: string }[]),
  ]);

  if (existing && existing.status !== "inactive") {
    return NextResponse.json(
      { success: false, error: "This user is already a member of your organisation" },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString("hex");

  const membership = await db.$transaction(async (tx) => {
    const m = existing
      ? await tx.orgMember.update({
          where: { id: existing.id },
          data: {
            role: "employee",
            status: "invited",
            invitationToken: token,
            invitedAt: new Date(),
            acceptedAt: null,
            createdBy: userId,
          },
        })
      : await tx.orgMember.create({
          data: {
            orgId,
            userId: user.id,
            role: "employee",
            status: "invited",
            invitationToken: token,
            invitedAt: new Date(),
            createdBy: userId,
          },
        });

    if (apps.length > 0) {
      await tx.userAppAccess.createMany({
        data: apps.map((app) => ({
          userId: user.id,
          orgId,
          appId: app.id,
          role: appAccess.find((a) => a.appSlug === app.slug)?.role ?? "member",
          grantedBy: userId,
        })),
        skipDuplicates: true,
      });
    }

    return m;
  });

  if (apps.length > 0) {
    await assignNamedRolesForAccess(
      orgId,
      apps.map((app) => ({
        userId: user.id,
        appId: app.id,
        roleName: appAccess.find((a) => a.appSlug === app.slug)?.role ?? "",
      })),
    ).catch(() => {});
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3007";

  try {
    await sendInvitationEmail({
      to: email,
      firstName,
      orgName: org?.name ?? "your organisation",
      role: appAccess[0]?.role ?? "member",
      inviteUrl: `${appUrl}/invitations/accept?token=${token}`,
      appNames: apps.map((a) => a.name),
    });
  } catch (err) {
    console.error("[invite email] FAILED:", err);
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        id: membership.id,
        name: `${user.firstName} ${user.lastName}`.replace(/ -$/, "").trim(),
        email: user.email,
        avatar: null,
        apps: appAccess.map((a) => ({ slug: a.appSlug, role: a.role })),
        role: membership.role,
        status: "pending",
      },
    },
    { status: 201 },
  );
});
