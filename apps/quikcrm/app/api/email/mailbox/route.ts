/**
 * GET /api/email/mailbox
 *
 * Returns the CURRENT user's mailbox connection status (scoped to their org +
 * userId — a user can only ever see their own mailbox). Also reports which
 * providers are configured so the UI can decide which Connect buttons to show.
 */

import { NextResponse } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { getConnection } from "@/lib/services/email/mailbox";
import { configuredProviders, providerConfigStatus } from "@/lib/services/email/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const conn = await getConnection(user.orgId, user.userId);
    const providers = configuredProviders();

    return NextResponse.json({
      success: true,
      data: {
        availableProviders: providers,
        // Diagnostic: lets the UI explain exactly what's missing rather than a
        // blanket "not configured".
        configStatus: providerConfigStatus(),
        connection:
          conn && conn.status !== "disconnected"
            ? {
                provider: conn.provider,
                emailAddress: conn.emailAddress,
                status: conn.status,
                syncState: conn.syncState, // "initial" | "backfilling" | "live"
                lastSyncedAt: conn.lastSyncedAt,
                lastError: conn.lastError,
              }
            : null,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
