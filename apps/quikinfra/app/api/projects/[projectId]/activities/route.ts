import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listActivities,
  listActivityFolders,
  listLeafActivities,
  createActivity,
  createActivities,
  type CreateActivityInput,
} from "@/lib/scope/activity-repository";
import { scopeErrorResponse, outOfProjectScope } from "@/lib/scope/http";
import { parsePagination } from "@/lib/http/pagination";

/**
 * GET  /api/projects/[projectId]/activities                  → activity tree
 * GET  /api/projects/[projectId]/activities?page=&pageSize=   → one DFS page
 * GET  /api/projects/[projectId]/activities?search=           → flat matches
 * GET  /api/projects/[projectId]/activities?leaves=true       → leaf lines (picker)
 *
 * Omitting page/pageSize returns the whole tree, so the scope pickers keep
 * their existing full-array contract.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.activity_scope", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfProjectScope(ctx.projectIds, params.projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const leavesOnly = searchParams.get("leaves") === "true";
  const foldersOnly = searchParams.get("folders") === "true";
  try {
    if (leavesOnly) {
      const data = await listLeafActivities(ctx, params.projectId);
      return NextResponse.json({ data, total: data.length });
    }
    if (foldersOnly) {
      const data = await listActivityFolders(ctx, params.projectId);
      return NextResponse.json({ data, total: data.length });
    }

    const p = parsePagination(req);
    const { data, total, isLocked } = await listActivities(ctx, params.projectId, {
      search: searchParams.get("search"),
      take: p.paginated ? p.take : undefined,
      skip: p.paginated ? p.skip : undefined,
    });
    if (!p.paginated) {
      return NextResponse.json({ data, total, isLocked });
    }
    return NextResponse.json({
      data,
      total,
      isLocked,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + data.length < total,
    });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.activities.list");
  }
}

/**
 * POST /api/projects/[projectId]/activities
 * Body is a single CreateActivityInput or an array for bulk create.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.activity_scope", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (outOfProjectScope(ctx.projectIds, params.projectId)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!hasMatrixAction(ctx, "pm.activity_scope", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.activity_scope`, 403);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (Array.isArray(body)) {
      const data = await createActivities(
        ctx,
        params.projectId,
        body as CreateActivityInput[]
      );
      return NextResponse.json({ data }, { status: 201 });
    }
    if (!body.description) {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }
    const data = await createActivity(
      ctx,
      params.projectId,
      body as CreateActivityInput
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.activities.create");
  }
}
