import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";
import { updateApiKeySchema } from "@/lib/validators/settings-api-keys";
import {
  setApiKeyActive,
  deleteApiKey,
  ApiKeyServiceError,
} from "@/lib/services/settings/api-keys.service";

export const runtime = "nodejs";

function conflict(e: unknown) {
  if (e instanceof ApiKeyServiceError)
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  return errorResponse(e);
}

/**
 * PATCH /api/settings/api-keys/[id] — revoke or reactivate a key.
 * Body: { action: "revoke" | "activate" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const parsed = updateApiKeySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const updated = await setApiKeyActive({
      actor: user,
      id,
      active: parsed.data.action === "activate",
    });
    return NextResponse.json({ apiKey: updated });
  } catch (e) {
    return conflict(e);
  }
}

/** DELETE /api/settings/api-keys/[id] — permanently delete a key. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "delete");
    await deleteApiKey({ actor: user, id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return conflict(e);
  }
}
