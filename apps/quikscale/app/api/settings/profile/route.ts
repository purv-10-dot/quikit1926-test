import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateProfileSchema } from "@/lib/schemas/settingsSchema";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

export const GET = withTenantAuth(
  async ({ tenantId, userId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        country: true,
        timezone: true,
        bio: true,
        themeMode: true,
        accentColor: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    const membership = await db.membership.findFirst({
      where: { userId, tenantId, status: "active" },
      select: { role: true },
    });

    return NextResponse.json({
      success: true,
      data: { ...user, role: membership?.role || "employee" },
    });
  },
  { fallbackErrorMessage: "Failed to fetch profile" },
);

export const PATCH = withTenantAuth(
  async ({ userId }, request) => {
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        country: true,
        timezone: true,
        bio: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { fallbackErrorMessage: "Failed to update profile" },
);
