import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { createApiKeySchema } from "@/lib/validators/settings-api-keys";
import {
  listApiKeys,
  createApiKey,
  ApiKeyServiceError,
} from "@/lib/services/settings/api-keys.service";

export const runtime = "nodejs";

function conflict(e: unknown) {
  if (e instanceof ApiKeyServiceError)
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

/** GET /api/settings/api-keys — list this org's API keys (never returns hashes). */
export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "view");
    const items = await listApiKeys(user.orgId);
    return NextResponse.json({ items });
  } catch (e) {
    return conflict(e);
  }
}

/**
 * POST /api/settings/api-keys — generate a new key.
 * Returns the raw secret ONCE in `rawKey`; it is never retrievable again.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "create");

    const parsed = createApiKeySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { apiKey, rawKey } = await createApiKey({ actor: user, data: parsed.data });
    // 201 Created. `rawKey` is present ONLY on this response.
    return NextResponse.json({ apiKey, rawKey }, { status: 201 });
  } catch (e) {
    return conflict(e);
  }
}
