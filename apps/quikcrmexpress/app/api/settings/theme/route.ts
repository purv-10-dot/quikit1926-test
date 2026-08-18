import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/settings/theme — the caller's accent colour, for <ThemeApplier />.
 *
 * Mirrors what quikscale serves from its own /api/settings/company: the
 * per-user theme preference stored on the platform `User` row
 * (`accentColor`, `themeMode`).
 *
 * A separate path is used deliberately. This app's /api/settings/company
 * already returns a QceCompanyProfile — different data behind the same name —
 * and it is gated on the `settings.view` permission, which most users do not
 * hold. Theming must work for every signed-in user, so it gets its own
 * unprivileged endpoint scoped to the caller's own row.
 */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const row = await db.user.findUnique({
      where: { id: user.userId },
      select: { accentColor: true, themeMode: true },
    });

    // No row shouldn't happen behind requireApiUser, but fall back to defaults
    // rather than 500 — ThemeApplier would only paint the default anyway.
    return NextResponse.json({
      success: true,
      data: {
        accentColor: row?.accentColor ?? null,
        themeMode: row?.themeMode ?? null,
      },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
