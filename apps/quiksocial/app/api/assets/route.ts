/**
 * /api/assets — GET list (filterable, paginated), POST upload.
 *
 * Ported to QuikIT (Phase 3, Batch 1). Cloudinary upload preserved.
 * The Mongo case-insensitive type filter becomes Prisma's OR-of-equals
 * matching both lowercase and uppercase legacy rows. The counts-by-type
 * aggregation uses Prisma `groupBy`. _id alias preserved.
 */

import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

type AnyRow = Record<string, unknown>;

function withCompatId<T extends AnyRow>(row: T): T & { _id: unknown } {
  return { ...row, _id: row.id };
}

const VALID_TYPES = [
  "logo",
  "gallery_image",
  "image",
  "video",
  "pdf",
  "case_study",
  "blog_post",
  "testimonial",
  "portfolio_item",
];

function deriveType(mimeType: string, ext: string, hint?: string): string {
  if (hint && VALID_TYPES.includes(hint.toLowerCase())) {
    return hint.toLowerCase();
  }
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return "video";
  if (ext === "svg") return "logo";
  return "gallery_image";
}

interface CloudinaryUploadResult {
  url: string;
  public_id: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
}

async function uploadToCloudinary(
  buffer: Buffer,
  filename: string,
  resourceType: "image" | "video" | "raw" | "auto",
  orgId: string,
): Promise<CloudinaryUploadResult> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        // QuikIT integration: namespace assets per-org so different
        // tenants never collide and cleanup-by-org is one DELETE call.
        folder: `quiksocial/${orgId}/assets`,
        public_id: `${Date.now()}_${filename.replace(/\.[^/.]+$/, "")}`,
        resource_type: resourceType,
        use_filename: false,
        overwrite: false,
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed"));
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          duration: (result as Record<string, unknown>).duration as number | undefined,
        });
      },
    );
    stream.end(buffer);
  });
}

function normalizeType(raw: string | null | undefined): string {
  return (raw ?? "image").toLowerCase();
}

// ---------------------------------------------------------------------------
// GET /api/assets?brandId=X&types=logo,gallery_image&page=N
// ---------------------------------------------------------------------------
export const GET = withOrgAuth(async ({ orgId }, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const typesParam = searchParams.get("types") ?? searchParams.get("type");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const PAGE_SIZE = 24;

  if (!brandId) {
    return NextResponse.json({ success: false, error: "brandId is required" }, { status: 400 });
  }

  const typeFilter: string[] =
    typesParam && typesParam !== "all"
      ? typesParam.split(",").map((t) => t.trim().toLowerCase())
      : [];

  const baseWhere = { orgId, brandId, isActive: true } as const;
  const filteredWhere =
    typeFilter.length > 0
      ? {
          ...baseWhere,
          OR: typeFilter.flatMap((t) => [{ type: t }, { type: t.toUpperCase() }]),
        }
      : baseWhere;

  const [rawAssets, total, countsByType] = await Promise.all([
    db.assetLibrary.findMany({
      where: filteredWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.assetLibrary.count({ where: filteredWhere }),
    db.assetLibrary.groupBy({
      by: ["type"],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const assets = rawAssets.map((a) => ({
    ...withCompatId(a),
    type: normalizeType(a.type),
    userId: a.createdBy,
  }));

  const counts: Record<string, number> = { total: 0 };
  for (const row of countsByType) {
    const key = normalizeType(row.type as string | null);
    const n = row._count._all ?? 0;
    counts[key] = (counts[key] ?? 0) + n;
    counts.total = (counts.total ?? 0) + n;
  }

  return NextResponse.json({
    success: true,
    data: {
      assets,
      counts,
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total,
        hasMore: page * PAGE_SIZE < total,
      },
    },
  });
});

// ---------------------------------------------------------------------------
// POST /api/assets  (multipart/form-data)
// ---------------------------------------------------------------------------
export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  const brandId = formData.get("brandId") as string | null;
  const typeHint = formData.get("type") as string | null;
  const nameOverride = formData.get("name") as string | null;

  if (!file || !brandId) {
    return NextResponse.json(
      { success: false, error: "file and brandId are required" },
      { status: 400 },
    );
  }

  const originalName = file.name;
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = file.type;

  const ALLOWED_EXTS = ["jpg", "jpeg", "png", "svg", "webp", "gif", "mp4", "mov", "pdf"];
  if (!ALLOWED_EXTS.includes(ext)) {
    return NextResponse.json(
      {
        success: false,
        error: `File type .${ext} not allowed. Allowed: JPG, PNG, SVG, MP4, PDF`,
      },
      { status: 422 },
    );
  }

  const assetType = deriveType(mimeType, ext, typeHint ?? undefined);

  let cloudinaryResourceType: "image" | "video" | "raw" | "auto" = "image";
  if (assetType === "video") cloudinaryResourceType = "video";
  else if (assetType === "pdf") cloudinaryResourceType = "raw";

  const buffer = Buffer.from(await file.arrayBuffer());

  let uploadResult: CloudinaryUploadResult;
  try {
    uploadResult = await uploadToCloudinary(buffer, originalName, cloudinaryResourceType, orgId);
  } catch (err) {
    console.error("[assets POST] Cloudinary upload failed", err);
    return NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
  }

  const assetName =
    nameOverride?.trim() ||
    originalName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

  const created = await db.assetLibrary.create({
    data: {
      orgId,
      brandId,
      createdBy: userId,
      name: assetName,
      type: assetType,
      url: uploadResult.url,
      thumbnailUrl:
        assetType === "image" || assetType === "logo" ? uploadResult.url : null,
      fileSize: uploadResult.bytes ?? null,
      dimensions:
        uploadResult.width && uploadResult.height
          ? `${uploadResult.width}x${uploadResult.height}`
          : null,
      duration: uploadResult.duration ?? null,
      format: ext,
    },
  });

  return NextResponse.json(
    { success: true, data: { asset: { ...withCompatId(created), userId: created.createdBy } } },
    { status: 201 },
  );
});
