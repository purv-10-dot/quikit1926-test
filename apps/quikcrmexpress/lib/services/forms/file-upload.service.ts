/**
 * FR-RE Unit 3b (FR-RE-3) — file_upload field type.
 *
 * Disposition file uploads are DELIBERATELY stricter than the app's general
 * document storage (lib/storage/documents.ts: ~25MB, broad mime set):
 *   - Max 10MB.
 *   - PDF / PNG / JPG / JPEG / WEBP only (per decision D6).
 *
 * We REUSE the existing storage service (saveCrmUpload) for the S3 write and
 * the existing activity ACL (buildActivityAclWhere) for read/write gating —
 * the FR-RE limits are enforced here, before anything is stored, so an invalid
 * or out-of-scope upload never produces a partial save.
 *
 * Reads are ACL-gated: a file hangs off an activity, so a caller may only read
 * an attachment whose parent activity is within their account scope (AC-RE-17,
 * the file analog of the user_picker scope check). Full disposition-save wiring
 * of valueFileId is Unit 6; recordDispositionAttachment is the seam it calls.
 */
import { prisma } from "@/lib/db/prisma";
import type { QceFileAttachment, Prisma } from "@quikit/database";
import { saveCrmUpload, getCrmUploadDownloadUrl } from "@/lib/storage/documents";
import { buildActivityAclWhere } from "@/lib/services/activities/activity-acl";
import type { SessionUser } from "@/types/permission";

const MB = 1024 * 1024;

export const FR_RE_MAX_FILE_BYTES = 10 * MB;

/** PDF/PNG/JPG/JPEG/WEBP (.jpg and .jpeg both carry image/jpeg). */
export const FR_RE_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class FileUploadError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "FileUploadError";
    this.statusCode = statusCode;
  }
}

/**
 * Enforce the FR-RE size/type limits. Throws BEFORE any storage or DB write so
 * a rejected file can never leave a partial save behind (AC-RE-8).
 */
export function validateDispositionFile(file: { size: number; type: string }): void {
  if (file.size > FR_RE_MAX_FILE_BYTES) {
    throw new FileUploadError(
      `File too large (max ${FR_RE_MAX_FILE_BYTES / MB}MB).`,
      413,
    );
  }
  const type = file.type || "application/octet-stream";
  if (!FR_RE_ALLOWED_MIME.has(type)) {
    throw new FileUploadError(
      `File type not allowed: ${type}. Allowed: PDF, PNG, JPG, JPEG, WEBP.`,
      415,
    );
  }
}

/**
 * Record an already-stored upload: create the QceFileAttachment row and point
 * the field value (QceFieldValue.valueFileId) at it. DB-only — no S3.
 */
export async function recordDispositionAttachment(input: {
  orgId: string;
  activityId: string;
  formSetVersionId: string;
  fieldKey: string;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
}): Promise<QceFileAttachment> {
  const attachment = await prisma.qceFileAttachment.create({
    data: {
      orgId: input.orgId,
      activityId: input.activityId,
      storageKey: input.storageKey,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      uploadedBy: input.uploadedBy,
    },
  });

  await prisma.qceFieldValue.upsert({
    where: {
      activityId_fieldKey: { activityId: input.activityId, fieldKey: input.fieldKey },
    },
    create: {
      orgId: input.orgId,
      activityId: input.activityId,
      formSetVersionId: input.formSetVersionId,
      fieldKey: input.fieldKey,
      valueType: "file_upload",
      valueFileId: attachment.id,
    },
    update: { valueType: "file_upload", valueFileId: attachment.id },
  });

  return attachment;
}

/** A caller may only touch an activity within their account scope (Strict). */
async function assertActivityInScope(user: SessionUser, activityId: string): Promise<void> {
  const aclWhere = await buildActivityAclWhere(user);
  const where: Prisma.QceActivityWhereInput = { id: activityId, orgId: user.orgId };
  if (aclWhere) where.AND = [aclWhere];

  const activity = await prisma.qceActivity.findFirst({ where, select: { id: true } });
  if (!activity) {
    throw new FileUploadError("You do not have access to this activity.", 403);
  }
}

/**
 * Validate -> ACL -> store -> record. The ordering is a guarantee: an invalid
 * file (validation) or an out-of-scope activity (ACL) throws BEFORE saveCrmUpload
 * runs, so no object is ever stored and no DB row is ever written for it.
 */
export async function saveDispositionUpload(input: {
  user: SessionUser;
  activityId: string;
  formSetVersionId: string;
  fieldKey: string;
  file: File;
}): Promise<QceFileAttachment> {
  validateDispositionFile({ size: input.file.size, type: input.file.type });
  await assertActivityInScope(input.user, input.activityId);

  const stored = await saveCrmUpload(input.activityId, input.file);

  return recordDispositionAttachment({
    orgId: input.user.orgId,
    activityId: input.activityId,
    formSetVersionId: input.formSetVersionId,
    fieldKey: input.fieldKey,
    storageKey: stored.storageKey,
    filename: stored.safeName,
    contentType: stored.contentType,
    sizeBytes: stored.size,
    uploadedBy: input.user.userId,
  });
}

/** Load an attachment, gated by the caller's access to its parent activity. */
export async function assertAttachmentAccess(
  user: SessionUser,
  attachmentId: string,
): Promise<QceFileAttachment> {
  const attachment = await prisma.qceFileAttachment.findFirst({
    where: { id: attachmentId, orgId: user.orgId },
  });
  if (!attachment) throw new FileUploadError("Attachment not found.", 404);
  await assertActivityInScope(user, attachment.activityId);
  return attachment;
}

/** ACL-gated presigned download URL for an attachment. */
export async function getDispositionAttachmentUrl(
  user: SessionUser,
  attachmentId: string,
): Promise<string> {
  const attachment = await assertAttachmentAccess(user, attachmentId);
  return getCrmUploadDownloadUrl(attachment.storageKey);
}
