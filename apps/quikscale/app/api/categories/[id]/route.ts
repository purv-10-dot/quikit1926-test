import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { getTenantId } from "@/lib/api/getTenantId";


// PUT /api/categories/[id] — update a category
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.categoryMaster.findFirst({ where: { id: params.id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    const body = await request.json();
    const { name, dataType, currency, description } = body;

    if (!name?.trim()) return NextResponse.json({ success: false, error: "Category Name is required" }, { status: 400 });
    if (!dataType) return NextResponse.json({ success: false, error: "Data Type is required" }, { status: 400 });

    const item = await db.categoryMaster.update({
      where: { id: params.id },
      data: {
        name: name.trim(),
        dataType,
        currency: dataType === "Currency" ? (currency || null) : null,
        description: description?.trim() || null,
      },
    });

    return NextResponse.json({ success: true, data: item });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to update category";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// DELETE /api/categories/[id] — delete a category
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id)
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId)
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const existing = await db.categoryMaster.findFirst({ where: { id: params.id, tenantId } });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    await db.categoryMaster.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to delete category";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
