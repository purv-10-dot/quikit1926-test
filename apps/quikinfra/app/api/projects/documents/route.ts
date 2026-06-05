import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { err as envelopeErr } from "@/lib/http/envelope";
import { PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES } from "@/lib/storage/validation";

function toListItem(
  row: {
    id: string;
    documentName: string;
    category: string;
    version: string | null;
    remarks: string | null;
    fileUrl: string;
    fileName: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    uploadedBy: string;
    uploadedByUserId: string;
    status: string;
    createdAt: Date;
    project: { code: string; name: string };
  },
) {
  const projectName = `${row.project.code} — ${row.project.name}`.trim();
  return {
    id: row.id,
    documentName: row.documentName,
    category: row.category,
    version: row.version,
    remarks: row.remarks,
    fileUrl: row.fileUrl,
    fileName: row.fileName,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    uploadedBy: row.uploadedBy,
    uploadedByUserId: row.uploadedByUserId,
    status: row.status,
    projectName,
    uploadDate: row.createdAt.toISOString().split("T")[0],
  };
}

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.project", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  const where: {
    orgId: string;
    projectId?: { in: string[] };
    OR?: Array<Record<string, unknown>>;
  } = {
    orgId: ctx.orgId,
  };

  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    where.projectId = { in: ctx.projectIds };
  }

  if (search) {
    where.OR = [
      { documentName: { contains: search, mode: "insensitive" } },
      { fileName: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
    ];
  }

  const rows = await (db as any).cnProjectDocument.findMany({
    where,
    include: {
      project: { select: { code: true, name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const data = rows.map(toListItem);
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.project", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.documents", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.documents`, 403);
  }

  const body = await req.json();
  const documentName = String(body.documentName ?? "").trim();
  const category = String(body.category ?? "").trim();
  const projectId = String(body.projectId ?? "").trim();
  const fileUrl = String(body.file ?? body.fileUrl ?? "").trim();

  if (!documentName || !category || !projectId || !fileUrl) {
    return NextResponse.json(
      { error: "documentName, category, projectId, and file are required" },
      { status: 400 },
    );
  }

  if (
    Array.isArray(ctx.projectIds) &&
    ctx.projectIds.length > 0 &&
    !ctx.projectIds.includes(projectId)
  ) {
    return NextResponse.json({ error: "Project not accessible" }, { status: 403 });
  }

  const sizeBytes = Number(body.fileSizeBytes);
  if (Number.isFinite(sizeBytes) && sizeBytes > PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      {
        error: `File exceeds ${PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB limit`,
      },
      { status: 413 },
    );
  }

  const project = await db.cnProject.findFirst({
    where: { id: projectId, orgId: ctx.orgId },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const row = await (db as any).cnProjectDocument.create({
    data: {
      orgId: ctx.orgId,
      projectId,
      documentName,
      category,
      version: String(body.version ?? "").trim() || null,
      remarks: String(body.remarks ?? "").trim() || null,
      fileUrl: fileUrl.split(",")[0],
      fileName: String(body.fileName ?? "").trim() || documentName,
      mimeType: String(body.mimeType ?? "").trim() || null,
      fileSizeBytes: Number.isFinite(sizeBytes) ? Math.round(sizeBytes) : null,
      uploadedBy: ctx.userName,
      uploadedByUserId: ctx.userId,
      fileObjectId: String(body.fileObjectId ?? "").trim() || null,
      status: "active",
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    },
    include: {
      project: { select: { code: true, name: true } },
    },
  });

  return NextResponse.json(toListItem(row), { status: 201 });
}
