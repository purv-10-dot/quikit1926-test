import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeSecretEqual } from "@/lib/secret-compare";
import { MANIFEST_ENTITIES, MANIFEST_OPERATIONS } from "@/lib/api/aiManifest";
import manifest from "@/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANIFEST_VERSION = "1";

/**
 * GET /api/internal/manifest — service-to-service only, no user context.
 *
 * The dynamic source of truth for what the AI Runtime can do in QuikTrack —
 * NOT the same thing as this app's manifest.ts (that's the launcher's
 * build-time, display-only manifest; don't conflate the two, per this app's
 * CLAUDE.md AI-integration section).
 *
 * Auth: shared secret via `x-internal-secret`, same pattern as
 * /api/internal/provision-roles, but validated against the AI-Runtime-
 * specific INTERNAL_AI_RUNTIME_SECRET rather than INTERNAL_SECRET. See the
 * manifest/summary contract doc from Suyash (AI Runtime), §1.1 — the env var
 * name is the storage name only; the wire header is always `x-internal-secret`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.INTERNAL_AI_RUNTIME_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!safeSecretEqual(provided, secret)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: {
      appId: manifest.appId,
      name: manifest.name,
      routePrefix: manifest.routePrefix,
      manifestVersion: MANIFEST_VERSION,
      entities: MANIFEST_ENTITIES,
      operations: MANIFEST_OPERATIONS,
    },
  });
}
