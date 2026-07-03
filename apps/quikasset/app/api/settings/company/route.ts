import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * GET /api/settings/company — theme settings consumed by <ThemeApplier />.
 * Returns the signed-in user's accent color (falls back to the QuikAsset
 * brand blue when unset).
 */
export const GET = withOrgAuth(
  async ({ userId }) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { accentColor: true, themeMode: true },
    });
    return NextResponse.json({
      success: true,
      data: {
        accentColor: user?.accentColor || "#1f4fd8",
        themeMode: user?.themeMode ?? null,
      },
    });
  },
  { fallbackErrorMessage: "Failed to fetch theme settings" },
);
