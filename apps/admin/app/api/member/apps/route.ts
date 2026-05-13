import { NextResponse } from "next/server";
import { withMemberAuth } from "@/lib/api/withMemberAuth";
import { db } from "@/lib/db";

export const GET = withMemberAuth(async ({ orgId, userId, role }) => {
  const [membership, appAccess, org] = await Promise.all([
    db.orgMember.findFirst({
      where: { userId, orgId },
      include: { user: { select: { firstName: true, lastName: true } } },
    }),
    db.userAppAccess.findMany({
      where: { userId, orgId },
      include: {
        app: { select: { id: true, name: true, slug: true, baseUrl: true, iconUrl: true } },
      },
    }),
    db.org.findUnique({
      where: { id: orgId },
      select: { name: true, logoUrl: true, brandColor: true },
    }),
  ]);

  const name = membership
    ? `${membership.user.firstName} ${membership.user.lastName}`.trim()
    : "";

  return NextResponse.json({
    success: true,
    data: {
      orgName: org?.name ?? "",
      orgLogoUrl: org?.logoUrl ?? null,
      member: { name, role },
      apps: appAccess.map((a) => ({
        id: a.app.id,
        name: a.app.name,
        slug: a.app.slug,
        baseUrl: a.app.baseUrl ?? "#",
        iconUrl: a.app.iconUrl ?? null,
        role: a.role,
      })),
    },
  });
});
