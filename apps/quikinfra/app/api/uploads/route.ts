import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getTenantContext } from "@/lib/auth/context";
import {
  ALLOWED_MIME_TYPES,
  PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES,
} from "@/lib/storage/validation";

/**
 * Generic file-upload endpoint.
 *
 * Accepts a `multipart/form-data` POST with one or more `files` parts
 * (the field MUST be named `files`). Persists each blob under
 * `public/uploads/<tenant>/<yyyy-mm>/<random>.<ext>` and returns the
 * public URL for each one. The URL is what callers store on their
 * record (e.g. `cn_material_issue.photoAttachment` is a `String?`
 * column today, so we serialise as a comma-separated list).
 *
 * Type / size limits are kept conservative — this endpoint is shared
 * by Material Issue, Good Return, and Gate Pass photo uploads, and
 * none of those need anything bigger than a phone snapshot or a PDF.
 */

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/svg+xml",
  "application/pdf",
]);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — photos / GRN attachments
const PUBLIC_ROOT = path.join(process.cwd(), "public");
const UPLOAD_SUBDIR = "uploads";

const PROJECT_DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".dwg",
  ".dxf",
  ".zip",
  ".csv",
  ".txt",
]);

type UploadContext = "default" | "project_document";

function resolveUploadContext(form: FormData): UploadContext {
  const raw = String(form.get("context") ?? "").trim();
  return raw === "project_document" ? "project_document" : "default";
}

function mimeExt(mime: string | null | undefined): string {
  switch (mime) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/svg+xml":
      return ".svg";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

function sanitizeSegment(s: string): string {
  // Strip anything that isn't a portable filename character so an
  // orgId with a slash / weird unicode can't escape the upload dir.
  return String(s).replace(/[^A-Za-z0-9_-]+/g, "_") || "tenant";
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data body" },
      { status: 400 },
    );
  }

  const files = form.getAll("files");
  if (files.length === 0) {
    return NextResponse.json(
      { error: 'Missing "files" field' },
      { status: 400 },
    );
  }

  const uploadContext = resolveUploadContext(form);
  const maxBytes =
    uploadContext === "project_document"
      ? PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES
      : DEFAULT_MAX_BYTES;
  const maxMb = Math.round(maxBytes / (1024 * 1024));

  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, "0")}`;
  const tenantSeg = sanitizeSegment(ctx.orgId);
  const targetDir = path.join(PUBLIC_ROOT, UPLOAD_SUBDIR, tenantSeg, yearMonth);
  await mkdir(targetDir, { recursive: true });

  const uploaded: Array<{
    url: string;
    name: string;
    size: number;
    type: string;
  }> = [];

  for (const entry of files) {
    if (!(entry instanceof File)) continue;
    if (entry.size === 0) continue;
    if (entry.size > maxBytes) {
      return NextResponse.json(
        {
          error: `${entry.name} is ${(entry.size / 1024 / 1024).toFixed(
            1,
          )} MB — limit is ${maxMb} MB.`,
        },
        { status: 413 },
      );
    }
    const declaredType = (entry.type || "").toLowerCase();
    const fileExt = path.extname(entry.name).toLowerCase();

    if (uploadContext === "project_document") {
      const mimeOk =
        !declaredType || ALLOWED_MIME_TYPES.has(declaredType);
      const extOk = fileExt && PROJECT_DOCUMENT_EXTENSIONS.has(fileExt);
      if (!mimeOk && !extOk) {
        return NextResponse.json(
          {
            error: `${entry.name}: unsupported file type. Allowed: PDF, Office, images, CAD, zip.`,
          },
          { status: 415 },
        );
      }
    } else if (declaredType && !ALLOWED_TYPES.has(declaredType)) {
      return NextResponse.json(
        {
          error: `${entry.name}: unsupported type "${declaredType}". Allowed: images and PDF.`,
        },
        { status: 415 },
      );
    }

    const storedExt = path.extname(entry.name) || mimeExt(declaredType);
    const fileName = `${crypto.randomBytes(12).toString("hex")}${storedExt}`;
    const buf = Buffer.from(await entry.arrayBuffer());
    await writeFile(path.join(targetDir, fileName), buf);

    uploaded.push({
      url: `/${UPLOAD_SUBDIR}/${tenantSeg}/${yearMonth}/${fileName}`,
      name: entry.name,
      size: entry.size,
      type: declaredType,
    });
  }

  if (uploaded.length === 0) {
    return NextResponse.json(
      { error: "No valid files in the request." },
      { status: 400 },
    );
  }

  return NextResponse.json({ files: uploaded }, { status: 201 });
}
