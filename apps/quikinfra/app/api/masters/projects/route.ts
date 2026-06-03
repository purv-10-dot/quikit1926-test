import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction, getTenantContext } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listProjects,
  countProjects,
  createProject,
} from "@/lib/masters/projects-repository";
import {
  validateProjectCode,
  normalizeProjectCode,
  validateRequired,
} from "@/lib/validators";
import { cachedJson } from "@/lib/http/cache";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * Projects master — Postgres-backed.
 * - Auto-resolves companyName / clientName via include on list.
 * - `companyId` is a required FK; the UI picks it from the Companies master.
 */

export async function GET(req: NextRequest) {
  // Projects are reference data every role needs to pick a project across
  // BOQ / DPR / PR / GRN — not just the Masters admin screen. So the LIST is
  // readable by ANY authenticated user in the org. This is safe because the
  // query below is always scoped to the caller's orgId + their granted
  // projectIds: a user with no project grants gets an empty list, a user
  // with grants gets only their projects, and an admin gets all. Project
  // VIEW is therefore available to every role by default; create/edit/delete
  // (POST/PATCH/DELETE) still require the full Masters permission.
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = {
    orgId: ctx.orgId,
    search,
    projectIds: ctx.projectIds,
  };
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listProjects({ ...baseOpts, ...paging }),
    () => countProjects(baseOpts),
  );
  return cachedJson(result, "medium");
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.project", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.project`, 403);
  }
  const body = await req.json();

  const codeCheck = validateProjectCode(body.code);
  if (!codeCheck.valid) return NextResponse.json({ error: codeCheck.error }, { status: 400 });
  const nameCheck = validateRequired(body.name, "Project Name");
  if (!nameCheck.valid) return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  // Company is no longer required — the Add Project form doesn't collect it.
  // Existing projects keep their companyId; new projects can leave it null.
  if (!body.clientId || !String(body.clientId).trim()) {
    return NextResponse.json({ error: "Client is required" }, { status: 400 });
  }

  try {
    const record = await createProject({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: normalizeProjectCode(body.code),
      name: body.name,
      description: body.description,
      projectType: body.projectType,
      clientId: body.clientId,
      departmentId: body.departmentId,
      address: body.address,
      city: body.city,
      state: body.state,
      pincode: body.pincode,
      siteGstin: body.siteGstin,
      startDate: body.startDate,
      expectedEndDate: body.expectedEndDate,
      actualEndDate: body.actualEndDate,
      projectValue: body.projectValue,
      budget: body.budget,
      purchaseLimit: body.purchaseLimit,
      projectManagerId: body.projectManagerId,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: `Project code "${body.code}" is already in use. Choose a different code.` },
        { status: 409 },
      );
    }
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "Referenced company or customer does not exist" },
        { status: 400 },
      );
    }
    console.error("[projects.create] failed:", err);
    return NextResponse.json({ error: err?.message ?? "Failed to create project" }, { status: 500 });
  }
}
