import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

export const GET = withTenantAuth(
  async ({ tenantId }, request) => {
    const teamId = request.nextUrl.searchParams.get("teamId");
    const { page, limit, skip, take } = parsePagination(request);

    const where = {
      tenantId,
      status: "active",
      ...(teamId ? { teamId } : {}),
    };

    const [members, total] = await Promise.all([
      db.membership.findMany({
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
      db.membership.count({ where }),
    ]);

    const users = members.map((m) => m.user).filter(Boolean);
    return NextResponse.json(paginatedResponse(users, total, page, limit));
  },
  { fallbackErrorMessage: "Failed to fetch users" },
);
