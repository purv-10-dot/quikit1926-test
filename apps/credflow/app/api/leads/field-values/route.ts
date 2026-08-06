import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { resolveFieldValues } from "@/lib/services/leads/field-values";

export const runtime = "nodejs";

/**
 * GET /api/leads/field-values?field=<key>
 *
 * Returns the pickable values for a lead-filter field so the advanced-filter
 * value box can render a searchable checkbox list instead of a free-text input.
 * Resolution lives in resolveFieldValues (pipeline config → configured options →
 * capped DB-distinct → none). High-cardinality / free-text fields return
 * { source: "none" }, and the client keeps its existing text input.
 *
 * Gated on leads:view (same bar as the owners picker — anyone who can see leads
 * can pick a value to filter by) and tenant-scoped inside the resolver.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "leads", "view");

    const field = new URL(req.url).searchParams.get("field")?.trim();
    if (!field) {
      return NextResponse.json({ error: "Missing ?field parameter" }, { status: 400 });
    }

    const result = await resolveFieldValues(user.tenantId, field);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
