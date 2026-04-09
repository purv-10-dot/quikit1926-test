import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


// GET /api/categories — list all categories for tenant
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const search = request.nextUrl.searchParams.get("search") || undefined;
    const dataType = request.nextUrl.searchParams.get("dataType") || undefined;

    const where: Record<string, unknown> = { tenantId };
    if (dataType) where.dataType = dataType;
    if (search) where.name = { contains: search, mode: "insensitive" };

    const items = await db.categoryMaster.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to fetch categories";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST /api/categories — create a new category
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const body = await request.json();
    const { name, dataType, currency, description } = body;

    if (!name?.trim()) return NextResponse.json({ success: false, error: "Category Name is required" }, { status: 400 });
    if (!dataType) return NextResponse.json({ success: false, error: "Data Type is required" }, { status: 400 });

    const item = await db.categoryMaster.create({
      data: {
        tenantId,
        name: name.trim(),
        dataType,
        currency: dataType === "Currency" ? (currency || null) : null,
        description: description?.trim() || null,
        createdBy: session.user.id,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to create category";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
