import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyCandidateDocToken } from "@/lib/services/candidate-doc-token";
import { putObject } from "@/lib/storage";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const ok = <T>(data: T, status = 200) => NextResponse.json({ success: true, data }, { status });
const err = (code: string, message: string, status: number) =>
  NextResponse.json({ success: false, error: { code, message } }, { status });

/**
 * POST /api/v1/hrms/recruit/candidate-documents/[token]/upload
 * Public — candidate uploads file. Multipart form:
 *   - file: File (required)
 *   - documentTypeId: string | null (null when uploading "Other")
 *   - customLabel: string (required when documentTypeId is null)
 *   - uploadId: string (optional — re-upload to replace a Rejected slot)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyCandidateDocToken(token);
  if (!payload) return err("INVALID_TOKEN", "Invalid or expired link", 400);

  const request = await prisma.candidateDocumentRequest.findFirst({
    where: { id: payload.requestId, orgId: payload.orgId, token, deletedAt: null },
  });
  if (!request) return err("NOT_FOUND", "Request not found", 404);
  if (request.tokenExpiresAt.getTime() < Date.now()) return err("EXPIRED", "Link expired", 400);
  if (request.status === "Cancelled") return err("CANCELLED", "Request was cancelled by HR", 400);
  // Once the candidate has clicked "Submit for Review", further uploads are
  // locked until HR clears submittedAt (re-opens the packet for changes).
  if (request.submittedAt) return err("LOCKED", "You've already submitted this packet for review. Contact HR if you need to re-upload.", 400);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || !(file instanceof File)) return err("VALIDATION", "File required", 422);
  if (file.size === 0) return err("VALIDATION", "Empty file", 422);
  if (file.size > MAX_BYTES) return err("VALIDATION", `File exceeds ${MAX_BYTES / (1024 * 1024)}MB`, 422);
  if (!ALLOWED.has(file.type)) return err("VALIDATION", `Unsupported type: ${file.type}`, 422);

  const documentTypeIdRaw = form.get("documentTypeId");
  const customLabelRaw = form.get("customLabel");
  const reuploadIdRaw = form.get("uploadId");
  const documentTypeId = typeof documentTypeIdRaw === "string" && documentTypeIdRaw.length > 0 ? documentTypeIdRaw : null;
  const customLabel = typeof customLabelRaw === "string" && customLabelRaw.trim() ? customLabelRaw.trim() : null;
  const reuploadId = typeof reuploadIdRaw === "string" && reuploadIdRaw.length > 0 ? reuploadIdRaw : null;

  if (!documentTypeId && !customLabel) return err("VALIDATION", "Provide a document type or custom label", 422);

  if (documentTypeId) {
    const dt = await prisma.candidateDocumentType.findFirst({
      where: { id: documentTypeId, orgId: payload.orgId, bundle: payload.bundle, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!dt) return err("VALIDATION", "Invalid document type for this bundle", 422);
  }

  // Upload to Google Cloud Storage
  const ext = path.extname(file.name) || "";
  const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 8);
  const key = `candidate-docs/${payload.orgId}/${request.id}/${randomUUID()}${safeExt}`;
  const buf = Buffer.from(await file.arrayBuffer());
  await putObject(key, buf, file.type);
  const proxyUrl = `/api/v1/hrms/uploads/proxy?key=${encodeURIComponent(key)}`;

  // Create or replace
  let upload;
  if (reuploadId) {
    const prev = await prisma.candidateDocumentUpload.findFirst({
      where: { id: reuploadId, requestId: request.id, orgId: payload.orgId, deletedAt: null },
    });
    if (!prev) return err("NOT_FOUND", "Prior upload not found", 404);
    upload = await prisma.candidateDocumentUpload.update({
      where: { id: prev.id },
      data: {
        fileUrl: proxyUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        status: "Pending",
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
        uploadedAt: new Date(),
      },
    });
  } else {
    upload = await prisma.candidateDocumentUpload.create({
      data: {
        orgId: payload.orgId,
        requestId: request.id,
        documentTypeId,
        customLabel,
        fileUrl: proxyUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        status: "Pending",
      },
    });
  }

  return ok({ upload }, 201);
}
