import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

// Sort the OrgMember rows by the joined User's firstName/lastName so user
// dropdowns render alphabetically server-side. Whitelisted to prevent
// arbitrary column injection via the query string.
const SORTABLE = new Set(["firstName", "lastName", "createdAt"] as const);
type SortKey = "firstName" | "lastName" | "createdAt";

function parseSort(req: { nextUrl: { searchParams: URLSearchParams } }): Prisma.OrgMemberOrderByWithRelationInput[] {
  const raw = req.nextUrl.searchParams.get("sortBy");
  const order = req.nextUrl.searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
  const key: SortKey = raw && (SORTABLE as Set<string>).has(raw) ? (raw as SortKey) : "firstName";
  if (key === "createdAt") return [{ createdAt: order }];
  // Tie-break alphabetical sort with the secondary name for stable ordering.
  if (key === "firstName") return [{ user: { firstName: order } }, { user: { lastName: order } }];
  return [{ user: { lastName: order } }, { user: { firstName: order } }];
}

export const GET = withOrgAuth(
  async ({ orgId }, request) => {
    const teamId = request.nextUrl.searchParams.get("teamId");
    const { page, limit, skip, take } = parsePagination(request);

    const where = {
      orgId,
      status: "active",
      ...(teamId ? { teamId } : {}),
    };

    const orderBy = parseSort(request);

    const [members, total] = await Promise.all([
      db.orgMember.findMany({
        where,
        select: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy,
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
