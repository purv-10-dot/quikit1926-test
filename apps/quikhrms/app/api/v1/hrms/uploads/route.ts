import { NextRequest } from "next/server";
import path from "path";
import { randomUUID } from "crypto";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { uploadToS3 } from "@/lib/s3";

const MB = 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * MB;
const MAX_VIDEO_BYTES = 100 * MB;
const MAX_DOC_BYTES = 10 * MB;

const ALLOWED_IMAGE = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
  "image/heic", "image/heif",
]);
const ALLOWED_VIDEO = new Set([
  "video/mp4", "video/webm", "video/quicktime",
  "video/x-matroska", "video/x-msvideo", "video/ogg",
]);
const ALLOWED_DOC = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);

function categorize(mime: string): "image" | "video" | "doc" | null {
  if (ALLOWED_IMAGE.has(mime)) return "image";
  if (ALLOWED_VIDEO.has(mime)) return "video";
  if (ALLOWED_DOC.has(mime)) return "doc";
  return null;
}

const CATEGORY_LIMIT: Record<"image" | "video" | "doc", number> = {
  image: MAX_IMAGE_BYTES,
  video: MAX_VIDEO_BYTES,
  doc: MAX_DOC_BYTES,
};

export const POST = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) return validationError("File required");
    if (file.size === 0) return validationError("Empty file");

    const category = categorize(file.type);
    if (!category) return validationError(`Unsupported file type: ${file.type}`);

    const limit = CATEGORY_LIMIT[category];
    if (file.size > limit) {
      const label = category === "image" ? "Image" : category === "video" ? "Video" : "File";
      return validationError(`${label} exceeds ${Math.round(limit / MB)}MB`);
    }

    const ext = path.extname(file.name) || "";
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
    const id = randomUUID();
    const key = `uploads/${orgId}/${id}${safeExt}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const result = await uploadToS3({ key, body: buf, contentType: file.type });
    const proxyUrl = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(result.key)}`;

    return successResponse({
      url: proxyUrl,
      directUrl: result.url,
      key: result.key,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }, undefined, 201);
  } catch (error) {
    console.error("POST /hrms/uploads error:", error);
    return internalError();
  }
}, { rateLimit: { max: 20, windowSec: 60, by: "user", scope: "uploads" } });
