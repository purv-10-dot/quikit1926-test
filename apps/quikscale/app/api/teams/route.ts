import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createTeamSchema } from "@/lib/schemas/teamSchema";
import { validationError } from "@/lib/api/validationError";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

export const GET = withTenantAuth(
  async ({ tenantId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const where = { tenantId };

    const [teams, total] = await Promise.all([
      db.team.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
      db.team.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(teams, total, page, limit));
  },
  { fallbackErrorMessage: "Failed to fetch teams" },
);

export const POST = withTenantAuth(
  async ({ tenantId }, request) => {
    const parsed = createTeamSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const name = parsed.data.name.trim();

    const existing = await db.team.findFirst({
      where: { tenantId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `A team named "${existing.name}" already exists` },
        { status: 409 },
      );
    }

    const baseSlug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const team = await db.team.create({
      data: { name, slug, tenantId },
      select: { id: true, name: true },
    });

    return NextResponse.json({ success: true, data: team });
  },
  { fallbackErrorMessage: "Failed to create team" },
);
