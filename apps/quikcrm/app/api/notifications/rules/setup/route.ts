/**
 * POST /api/notifications/rules/setup
 *
 * Creates the crm_notification_rule table in app_quikcrm schema if it doesn't
 * exist. Safe to call repeatedly (idempotent — uses CREATE TABLE IF NOT EXISTS).
 *
 * The UI calls this on the rules page first-load so admins never see a
 * "table not found" error. Admin-only.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { ensureTableExists } from "@/lib/notifications/rules/db";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    if (user.role !== "Administrator") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await ensureTableExists();
    return NextResponse.json({ ok: true, message: "Notification rules table is ready." });
  } catch (e) {
    return errorResponse(e);
  }
}
