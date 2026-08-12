import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

/**
 * GET /api/settings/company — theme settings for the current user, consumed by
 * `<ThemeApplier />` (accentColor drives the accent-* CSS variables).
 */
export const GET = withOrgAuth(
  async ({ userId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { accentColor: true, themeMode: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  },
  { fallbackErrorMessage: "Failed to fetch theme settings" },
);
