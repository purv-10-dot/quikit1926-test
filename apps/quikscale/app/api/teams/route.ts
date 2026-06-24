import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createTeamSchema } from "@/lib/schemas/teamSchema";
import { validationError } from "@/lib/api/validationError";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
const auth = withOrgAuthForResource("orgSetup.teams", "Team");

export const GET = auth.view(
  async ({ orgId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const where = { orgId };

    const [teams, total] = await Promise.all([
      db.qsTeam.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        skip,
        take,
      }),
      db.qsTeam.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(teams, total, page, limit));
  },
  { fallbackErrorMessage: "Failed to fetch teams" },
);

export const POST = auth.create(
  async ({ orgId }, request) => {
    const parsed = createTeamSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const name = parsed.data.name.trim();

    const existing = await db.qsTeam.findFirst({
      where: { orgId, name: { equals: name, mode: "insensitive" } },
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

    const team = await db.qsTeam.create({
      data: { name, slug, orgId },
      select: { id: true, name: true },
    });

    return NextResponse.json({ success: true, data: team });
  },
  { fallbackErrorMessage: "Failed to create team" },
);
