import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api/requireSuperAdmin";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const app = await db.app.findUnique({
    where: { id: params.id },
  });

  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const accessCount = await db.userAppAccess.count({
    where: { appId: params.id },
  });

  return NextResponse.json({
    success: true,
    data: {
      id: app.id,
      name: app.name,
      slug: app.slug,
      description: app.description,
      baseUrl: app.baseUrl,
      iconUrl: app.iconUrl,
      status: app.status,
      accessCount,
      createdAt: app.createdAt.toISOString(),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const app = await db.app.findUnique({ where: { id: params.id } });
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  const body = await request.json();
  const { name, description, baseUrl, iconUrl, status } = body;

  const updateData: Record<string, any> = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
  if (iconUrl !== undefined) updateData.iconUrl = iconUrl;
  if (status !== undefined) updateData.status = status;

  const updated = await db.app.update({
    where: { id: params.id },
    data: updateData,
  });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireSuperAdmin();
  if ("error" in auth && auth.error) return auth.error;

  const app = await db.app.findUnique({ where: { id: params.id } });
  if (!app) {
    return NextResponse.json({ success: false, error: "App not found" }, { status: 404 });
  }

  await db.userAppAccess.deleteMany({ where: { appId: params.id } });
  await db.app.delete({ where: { id: params.id } });

  return NextResponse.json({ success: true, message: "App deleted" });
}
