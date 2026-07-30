import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

/**
 * GET / PATCH /api/settings/company
 *
 * Per-user theme settings (accent colour + light/dark mode), stored on the
 * shared central `User` model. Consumed by `<ThemeApplier />`, which reads
 * `data.accentColor` on mount and derives the `--accent-*` CSS variables.
 *
 * Response shape is `{ success, data }` (NOT the construction envelope) so it
 * stays wire-compatible with the shared ThemeApplier across every app.
 */

const updateThemeSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, "accentColor must be a #RRGGBB hex string")
    .optional(),
  themeMode: z.enum(["light", "dark"]).optional(),
});

export const GET = withOrgAuth(
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

    // QuikInfra has no accent-colour picker yet, so an untouched value equal to
    // the shared platform default ("#0066cc") means the user never chose a
    // colour here. Return null for that case so `<ThemeApplier defaultColor>`
    // (the QuikInfra brand orange) takes over — the app looks orange by default
    // while still honouring any colour the user genuinely set in another app.
    const accentColor =
      user.accentColor && user.accentColor !== "#0066cc" ? user.accentColor : null;

    return NextResponse.json({
      success: true,
      data: { accentColor, themeMode: user.themeMode },
    });
  },
  { fallbackErrorMessage: "Failed to fetch theme settings" },
);

export const PATCH = withOrgAuth(
  async ({ userId }, req) => {
    const body = await req.json();
    const parsed = updateThemeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
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