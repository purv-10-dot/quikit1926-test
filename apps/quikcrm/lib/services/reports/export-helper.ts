/**
 * Shared helpers for the `?format=csv` branch on list routes.
 *
 * - `assertExportPermissionResponse` — returns null when the caller has the
 *   `reports.export` permission, else a 403 NextResponse the route can
 *   return verbatim. Centralised so every CSV branch produces the same
 *   `{ success: false, error: "Export permission required" }` body.
 * - `todayIsoForTz` — `YYYY-MM-DD` in the user's IANA tz, used as the
 *   filename suffix.
 */
import { NextResponse } from "next/server";
import { assertModule } from "@/lib/auth/permissions";
import type { SessionUser } from "@/types/permission";

export async function assertExportPermissionResponse(
  user: SessionUser,
): Promise<NextResponse | null> {
  try {
    await assertModule(user, "reports", "export");
    return null;
  } catch {
    return NextResponse.json(
      { success: false, error: "Export permission required" },
      { status: 403 },
    );
  }
}

export function todayIsoForTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
