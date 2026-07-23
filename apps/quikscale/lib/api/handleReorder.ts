import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { reorderRowSchema } from "@/lib/schemas/reorderSchema";
import { validationError } from "@/lib/api/validationError";
import { reorderRow, ReorderNotFoundError, type OrderableDelegate } from "@/lib/api/reorderRow";

/**
 * Shared body-parse → reorder → response for every per-module reorder route.
 * Keeps the 7 route files a one-liner each; org scoping/permission is enforced
 * by the caller's `withOrgAuth*` wrapper before this runs.
 */
export async function handleReorder(
  delegate: OrderableDelegate,
  orgId: string,
  request: NextRequest,
): Promise<NextResponse> {
  const body = await request.json();
  const parsed = reorderRowSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);

  try {
    const position = await reorderRow(delegate, { orgId, ...parsed.data });
    return NextResponse.json({ success: true, data: { id: parsed.data.id, position } });
  } catch (e) {
    if (e instanceof ReorderNotFoundError) {
      return NextResponse.json({ success: false, error: "Row not found" }, { status: 404 });
    }
    throw e; // unexpected → withOrgAuth's outer catch → 500
  }
}
