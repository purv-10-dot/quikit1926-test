import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listEstimations } from "@/lib/projects/estimation-repository";

/**
 * Flat estimation listing used by the Material Estimation page so it
 * can show every estimation without forcing the user to pick a project
 * first.
 *
 * Optional query params:
 *   ?projectId=…  — filter to one project
 *   ?search=…     — case-insensitive match on boqNo/description/phase
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") ?? "";
    const search = searchParams.get("search")?.toLowerCase() ?? "";

    const ctx = await getTenantContext();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    // Per-user project scoping applied at the repository layer so a user
    // can never use the query string to see a project they aren't
    // assigned to.
    const data = await listEstimations(ctx.tenantId, {
      projectId: projectId || null,
      search: search || null,
      allowedProjectIds: ctx.projectIds ?? null,
    });

    return NextResponse.json({ data, total: data.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[estimations.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
