import type { Prisma } from "@prisma/client";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { parsePagination, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";
import { db } from "@/lib/db";
import { hasMatrixAction, tenantCreate } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";

function formatDateOnly(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}


function serialize(
  row: Prisma.CnHindranceGetPayload<{ include: { project: { select: { name: true } } } }>,
) {
  return {
    id: row.id,
    hindranceNo: row.hindranceNo,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    category: row.category,
    dateFrom: row.dateFrom?.toISOString().slice(0, 10) ?? null,
    dateTo: row.dateTo?.toISOString().slice(0, 10) ?? null,
    daysLost: row.daysLost,
    status: row.status,
    description: row.description,
    impactOnCriticalPath: row.impactOnCriticalPath ?? "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}


export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.hindrance", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = searchParams.get("status") ?? "";

  const where: Prisma.CnHindranceWhereInput = { orgId: ctx.orgId };
  if (ctx.projectIds !== undefined) {
    where.projectId = { in: ctx.projectIds };
  }
  if (status && status !== "all") where.status = status;
  if (search) {
    where.OR = [
      { hindranceNo: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const p = parsePagination(req);
  const sort = parseSort(
    searchParams,
    ["hindranceNo", "dateFrom", "dateTo", "daysLost", "category", "status", "createdAt"],
    { field: "dateFrom", order: "desc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const [rows, total] = await Promise.all([
    db.cnHindrance.findMany({
      where,
      include: { project: { select: { name: true } } },
      orderBy: sort.orderBy,
      ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
    }),
    db.cnHindrance.count({ where }),
  ]);

  const data = rows.map(serialize);
  if (p.paginated) {
    return NextResponse.json({
      data,
      total,
      page: p.page,
      pageSize: p.pageSize,
      hasMore: p.skip + data.length < total,
    });
  }
  return NextResponse.json({ data, total });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.hindrance", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.hindrance", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.hindrance`, 403);
  }

  const body = await req.json();
  if (!body.projectId || !body.category || !body.dateFrom || !body.description) {
    return NextResponse.json(
      { error: "projectId, category, dateFrom, description are required" },
      { status: 400 },
    );
  }

  const project = await db.cnProject.findFirst({
    where: { id: body.projectId, orgId: ctx.orgId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const year = new Date(body.dateFrom).getFullYear() || new Date().getFullYear();
  const seq = await db.cnHindrance.count({
    where: { orgId: ctx.orgId },
  });
  const hindranceNo = `HIND-${year}-${String(seq + 1).padStart(3, "0")}`;

  const created = await db.cnHindrance.create({
    data: {
      orgId: ctx.orgId,
      hindranceNo,
      projectId: project.id,
      category: String(body.category),
      dateFrom: new Date(body.dateFrom),
      dateTo: body.dateTo ? new Date(body.dateTo) : null,
      daysLost: Number(body.daysLost ?? 0),
      status: body.status === "Resolved" ? "Resolved" : "Active",
      description: String(body.description),
      impactOnCriticalPath: body.impactOnCriticalPath
        ? String(body.impactOnCriticalPath)
        : null,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    },
    include: { project: { select: { name: true } } },
  });

  return NextResponse.json(serialize(created), { status: 201 });
}
