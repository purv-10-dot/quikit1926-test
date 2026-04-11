import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { toErrorMessage } from "@/lib/api/errors";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createTeamSchema } from "@/lib/schemas/teamSchema";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const { page, limit, skip, take } = parsePagination(request);
    const where = { tenantId: membership.tenantId, deletedAt: null };

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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to fetch teams") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const parsed = createTeamSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const name = parsed.data.name.trim();

    const existing = await db.team.findFirst({
      where: { tenantId: membership.tenantId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) return NextResponse.json({ success: false, error: `A team named "${existing.name}" already exists` }, { status: 409 });

    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const slug = `${baseSlug}-${Date.now().toString(36)}`;

    const team = await db.team.create({
      data: { name, slug, tenantId: membership.tenantId },
      select: { id: true, name: true },
    });

    return NextResponse.json({ success: true, data: team });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to create team") }, { status: 500 });
  }
}
