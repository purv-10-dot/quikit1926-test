import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * Projects master — Postgres-backed.
 * - Auto-resolves companyName / clientName via include on list.
 * - `companyId` is a required FK; the UI picks it from the Companies master.
 */

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const baseOpts = {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      search,
      // Scope to the user's assigned projects when context is restricted.
      // `ctx.projectIds` is set only for non-super users with a non-empty
      // `projectsAssigned` list — super/tenant admins and users without
      // assignments see every project in the tenant.
      projectIds: ctx.projectIds,
    };
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listProjects({ ...baseOpts, ...paging }),
      () => countProjects(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/projects.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = await req.json();

  const codeCheck = validateProjectCode(body.code);
  if (!codeCheck.valid) return NextResponse.json({ error: codeCheck.error }, { status: 400 });
  const nameCheck = validateRequired(body.name, "Project Name");
  if (!nameCheck.valid) return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  if (!body.companyId || !String(body.companyId).trim()) {
    return NextResponse.json({ error: "Company is required" }, { status: 400 });
  }

  try {
    const record = await createProject({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: normalizeProjectCode(body.code),
      name: body.name,
      description: body.description,
      projectType: body.projectType,
      companyId: body.companyId,
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
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: `Project code "${body.code}" is already in use. Choose a different code.` },
        { status: 409 },
      );
    }
    if (e?.code === "P2003") {
      return NextResponse.json(
        { error: "Referenced company or customer does not exist" },
        { status: 400 },
      );
    }
    console.error("[projects.create] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to create project" }, { status: 500 });
  }
}
