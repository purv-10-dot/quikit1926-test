import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateCompanySchema } from "@/lib/schemas/settingsSchema";
import { withTenantAuth } from "@/lib/api/withTenantAuth";

export const GET = withTenantAuth(
  async ({ userId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { accentColor: true, themeMode: true },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  },
  { fallbackErrorMessage: "Failed to fetch theme settings" },
);

export const PATCH = withTenantAuth(
  async ({ userId }, request) => {
    const body = await request.json();
    const parsed = updateCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: parsed.data,
      select: { accentColor: true, themeMode: true },
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { fallbackErrorMessage: "Failed to update theme settings" },
);
