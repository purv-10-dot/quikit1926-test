import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { createWWWSchema } from "@/lib/schemas/wwwSchema";

// GET /api/www — list all WWWItems for tenant
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const status = searchParams.get("status") || undefined;

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { what:  { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    const items = await db.wWWItem.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    // Build user map for who_user
    const whoIds = [...new Set(items.map(i => i.who).filter(Boolean))];
    const users = whoIds.length
      ? await db.user.findMany({
          where: { id: { in: whoIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    const result = items.map(item => ({
      ...item,
      when: item.when.toISOString(),
      originalDueDate: item.originalDueDate?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      who_user: userMap[item.who] ?? null,
    }));

    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch WWW items";
    console.error("GET /api/www error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/www — create a WWWItem
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createWWWSchema.safeParse(body);
    if (!parsed.success) {
      const error = parsed.error.errors[0]?.message ?? "Invalid input";
      return NextResponse.json({ success: false, error }, { status: 400 });
    }
    const { who, what, when, status, notes, category, originalDueDate } = parsed.data;

    const item = await db.wWWItem.create({
      data: {
        tenantId,
        who,
        what,
        when: new Date(when),
        status: status ?? "not-yet-started",
        notes: notes ?? null,
        category: category ?? null,
        originalDueDate: originalDueDate ? new Date(originalDueDate) : null,
        revisedDates: [],
        createdBy: session.user.id,
      },
    });

    // Attach who_user
    const whoUser = await db.user.findUnique({
      where: { id: item.who },
      select: { id: true, firstName: true, lastName: true },
    });

    const result = {
      ...item,
      when: item.when.toISOString(),
      originalDueDate: item.originalDueDate?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      who_user: whoUser ?? null,
    };

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create WWW item";
    console.error("POST /api/www error:", error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
