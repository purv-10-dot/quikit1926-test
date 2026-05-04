import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

export const GET = withTenantAuth(
  async ({ orgId }, request) => {
    const teamId = request.nextUrl.searchParams.get("teamId");
    const { page, limit, skip, take } = parsePagination(request);

    const where = {
      orgId,
      status: "active",
      ...(teamId ? { teamId } : {}),
    };

    const [members, total] = await Promise.all([
      db.orgMember.findMany({
        where,
        select: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "asc" },
        skip,
        take,
      }),
      db.orgMember.count({ where }),
    ]);

    const users = members.map((m) => m.user).filter(Boolean);
    return NextResponse.json(paginatedResponse(users, total, page, limit));
  },
  { fallbackErrorMessage: "Failed to fetch users" },
);
