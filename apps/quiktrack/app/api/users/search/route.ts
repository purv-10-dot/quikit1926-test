import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") ?? "10")));

  const memberships = await db.orgMember.findMany({
    where: {
      orgId,
      status: "active",
      ...(q
        ? {
            user: {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
              ],
            },
          }
        : {}),
    },
    take: limit,
    select: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, avatar: true },
      },
    },
  });
  return NextResponse.json({
    success: true,
    data: memberships.map((m) => m.user).filter(Boolean),
  });
});
