import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const teams = await db.team.findMany({
      where: { tenantId: membership.tenantId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: teams });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch teams";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
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

    const body = await request.json();
    const name = (body.name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, error: "Team name is required" }, { status: 400 });

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
    const msg = error instanceof Error ? error.message : "Failed to create team";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
