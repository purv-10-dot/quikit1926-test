import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";
import { toErrorMessage } from "@/lib/api/errors";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
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
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
    const { page, limit, skip, take } = parsePagination(request);

    const where: Record<string, unknown> = { tenantId, deletedAt: null };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { what:  { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
      ];
    }

    // Allowed sort fields
    const sortMap: Record<string, Record<string, "asc" | "desc">> = {
      who: { who: sortOrder },
      when: { when: sortOrder },
      what: { what: sortOrder },
      revisedDate: { when: sortOrder }, // revisedDates is JSON array; fall back to when
      status: { status: sortOrder },
      notes: { notes: sortOrder },
      createdAt: { createdAt: sortOrder },
    };
    const orderBy = sortMap[sortBy] || { createdAt: sortOrder };

    const [items, total] = await Promise.all([
      db.wWWItem.findMany({
        where,
        orderBy: orderBy as any,
        skip,
        take,
      }),
      db.wWWItem.count({ where }),
    ]);

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

    return NextResponse.json(paginatedResponse(result, total, page, limit));
  } catch (error: unknown) {
    console.error("GET /api/www error:", error);
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to fetch WWW items") }, { status: 500 });
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
    console.error("POST /api/www error:", error);
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to create WWW item") }, { status: 500 });
  }
}
