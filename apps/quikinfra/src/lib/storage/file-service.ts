/**
 * File Service — wraps the storage driver with business rules.
 *
 * Responsibilities:
 *   1. Validate MIME + size (via validation.ts).
 *   2. Build the canonical object key: tenants/<T>/<companies/<C>/projects/<P>/<entity>/<id>/YYYY/MM/<uuid>-<fileName>.
 *   3. Issue presigned upload URLs and persist a `pending_upload` metadata row.
 *   4. Flip the row to `active` on upload-confirm (after HEAD check).
 *   5. Soft-delete metadata; optionally hard-delete the object.
 *   6. Return signed download URLs.
 *   7. List attachments by (entityType, entityId).
 *
 * Tenancy: every call takes a TenantContext and scopes all DB reads/writes.
 * The caller can never look up someone else's file.
 *
 * Use from route handlers:
 *
 *   const ctx = await requireAuth();
 *   const result = await fileService.initUpload(ctx, {
 *     entityType: "grn",
 *     entityId: grn.id,
 *     projectId: grn.projectId,
 *     fileName: "challan.pdf",
 *     mimeType: "application/pdf",
 *     sizeBytes: 524288,
 *   });
 *   // → { fileId, uploadUrl: {method, url, headers, expiresIn}, objectKey }
 */

import crypto from "crypto";
import { db } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/auth/context";
import { recordAudit } from "@/lib/workflow/audit";
import { getStorageDriver } from "./index";
import { validateUpload } from "./validation";
import type { PresignedUploadUrl, PresignedDownloadUrl } from "./driver";

// ─── Entity types this service accepts ──────────────────────────────

export const ATTACHMENT_ENTITY_TYPES = [
  "boq_import",
  "po",
  "grn",
  "work_order",
  "dpr",
  "rab",
  "safety_incident",
  "quality_inspection",
  "project_document",
] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export class FileError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.name = "FileError";
  }
}

export interface UploadInitParams {
  entityType: AttachmentEntityType;
  entityId: string;
  /** Required unless entityType is tenant-level. Enables project-scoped key layout. */
  projectId?: string | null;
  companyId?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface UploadInitResult {
  fileId: string;
  objectKey: string;
  bucket: string;
  storageKind: string;
  upload: PresignedUploadUrl;
}

export interface FileMetadata {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageKey: string;
  storageKind: string;
  status: string;
  uploadedBy: string;
  uploadedAt: string;
}

// ─── Service ────────────────────────────────────────────────────────

class FileService {
  /**
   * Canonical key layout:
   *   tenants/<tenant>/companies/<company?>/projects/<project?>/<entity>/<id>/YYYY/MM/<rand>-<safeFileName>
   *
   * Rationale:
   *   - Tenant prefix → easy per-tenant lifecycle rules / export / delete.
   *   - Optional company/project segments → grouped listings, future IAM.
   *   - Entity + id → point-in-time lookup by parent record.
   *   - YYYY/MM → retention / archival partitioning.
   *   - Random prefix → avoids collisions when the same filename is uploaded twice.
   */
  buildObjectKey(ctx: TenantContext, p: UploadInitParams): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const rand = crypto.randomBytes(6).toString("hex");
    const safeName = p.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);

    const parts: string[] = ["tenants", ctx.orgId];
    if (p.companyId) parts.push("companies", p.companyId);
    if (p.projectId) parts.push("projects", p.projectId);
    parts.push(p.entityType, p.entityId, String(yyyy), mm, `${rand}-${safeName}`);
    return parts.join("/");
  }

  /**
   * Stage 1 of upload — validate, reserve a metadata row, return a presigned
   * URL. The browser PUTs the body directly to object storage.
   */
  async initUpload(ctx: TenantContext, p: UploadInitParams): Promise<UploadInitResult> {
    // Validate first — no DB write if invalid
    const v = validateUpload({
      entityType: p.entityType,
      mimeType: p.mimeType,
      sizeBytes: p.sizeBytes,
      fileName: p.fileName,
    });
    if (!v.ok) throw new FileError(v.code ?? "VALIDATION_FAILED", v.error ?? "Invalid", 400);

    const driver = getStorageDriver();
    const objectKey = this.buildObjectKey(ctx, p);

    // Persist metadata as "pending_upload". If the browser never confirms,
    // a janitor can reap these rows (see §Remaining TODOs in the report).
    const row = await (db as any).cnFileObject.create({
      data: {
        orgId: ctx.orgId,
        companyId: p.companyId ?? null,
        projectId: p.projectId ?? null,
        entityType: p.entityType,
        entityId: p.entityId,
        fileName: p.fileName,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes,
        storageKey: objectKey,
        storageKind: driver.kind,
        storageBucket: driver.bucket,
        status: "pending_upload",
        uploadedBy: ctx.userId,
      },
    });

    const upload = await driver.getPresignedUploadUrl({
      key: objectKey,
      contentType: p.mimeType,
      contentLength: p.sizeBytes,
    });

    return {
      fileId: row.id,
      objectKey,
      bucket: driver.bucket,
      storageKind: driver.kind,
      upload,
    };
  }

  /**
   * Stage 2 — verify the object exists at the expected key with the
   * expected size, then flip the metadata row to "active". One audit row
   * is emitted inside the same transaction.
   */
  async confirmUpload(
    ctx: TenantContext,
    fileId: string,
    opts?: { checksum?: string }
  ): Promise<FileMetadata> {
    const row = await (db as any).cnFileObject.findFirst({
      where: { id: fileId, orgId: ctx.orgId },
    });
    if (!row) throw new FileError("FILE_NOT_FOUND", "File metadata not found", 404);
    if (row.status === "active") {
      // Idempotent replay — just return current state
      return toFileMetadata(row);
    }
    if (row.status === "deleted") {
      throw new FileError("FILE_DELETED", "File metadata is deleted", 410);
    }

    const driver = getStorageDriver();
    const head = await driver.headObject(row.storageKey);
    if (!head.exists) {
      throw new FileError(
        "UPLOAD_NOT_FOUND",
        "Object not found at the reserved key. Did the browser PUT succeed?",
        409
      );
    }
    if (
      row.sizeBytes &&
      head.contentLength !== undefined &&
      head.contentLength !== row.sizeBytes
    ) {
      // Size mismatch → drop the object + metadata row so nothing leaks
      await driver.deleteObject(row.storageKey).catch(() => {});
      await (db as any).cnFileObject.delete({ where: { id: fileId } });
      throw new FileError(
        "SIZE_MISMATCH",
        `Reported ${row.sizeBytes} bytes, actual ${head.contentLength}. Upload rejected.`,
        409
      );
    }

    const updated = await db.$transaction(async (tx) => {
      const r = await (tx as any).cnFileObject.update({
        where: { id: fileId },
        data: {
          status: "active",
          checksum: opts?.checksum ?? null,
        },
      });
      await recordAudit(tx, ctx, {
        entityType: "file_object",
        entityId: fileId,
        action: "upload_confirmed",
        changes: {
          entity: `${row.entityType}:${row.entityId}`,
          fileName: row.fileName,
          sizeBytes: row.sizeBytes,
          storageKey: row.storageKey,
        },
      });
      return r;
    });

    return toFileMetadata(updated);
  }

  /** Short-lived signed download URL. Returns 404 if file is deleted. */
  async getDownloadUrl(
    ctx: TenantContext,
    fileId: string
  ): Promise<{ url: string; expiresIn: number; fileName: string; mimeType: string | null }> {
    const row = await (db as any).cnFileObject.findFirst({
      where: { id: fileId, orgId: ctx.orgId, status: "active" },
    });
    if (!row) throw new FileError("FILE_NOT_FOUND", "File not found", 404);
    const driver = getStorageDriver();
    const signed: PresignedDownloadUrl = await driver.getPresignedDownloadUrl({
      key: row.storageKey,
      fileName: row.fileName,
    });
    return {
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: row.fileName,
      mimeType: row.mimeType,
    };
  }

  /**
   * Soft-delete: flip status → "deleted", record audit. The object itself
   * is NOT deleted by default (set `hardDelete: true` to purge the binary).
   * Soft-delete keeps the audit trail intact and lets you recover if it was
   * a mistake.
   */
  async deleteFile(
    ctx: TenantContext,
    fileId: string,
    opts?: { hardDelete?: boolean; reason?: string }
  ): Promise<void> {
    const row = await (db as any).cnFileObject.findFirst({
      where: { id: fileId, orgId: ctx.orgId },
    });
    if (!row) throw new FileError("FILE_NOT_FOUND", "File not found", 404);
    if (row.status === "deleted") return;

    await db.$transaction(async (tx) => {
      await (tx as any).cnFileObject.update({
        where: { id: fileId },
        data: {
          status: "deleted",
          deletedAt: new Date(),
          deletedBy: ctx.userId,
        },
      });
      await recordAudit(tx, ctx, {
        entityType: "file_object",
        entityId: fileId,
        action: opts?.hardDelete ? "hard_delete" : "soft_delete",
        changes: {
          entity: `${row.entityType}:${row.entityId}`,
          fileName: row.fileName,
          reason: opts?.reason,
        },
      });
    });

    if (opts?.hardDelete) {
      const driver = getStorageDriver();
      await driver.deleteObject(row.storageKey).catch((err) => {
        // Object deletion is best-effort — metadata is already marked deleted.
        console.error(`[storage] failed to delete object ${row.storageKey}:`, err);
      });
    }
  }

  /** List active attachments for a given (entity, id), most recent first. */
  async listByEntity(
    ctx: TenantContext,
    entityType: AttachmentEntityType,
    entityId: string
  ): Promise<FileMetadata[]> {
    const rows = await (db as any).cnFileObject.findMany({
      where: {
        orgId: ctx.orgId,
        entityType,
        entityId,
        status: "active",
      },
      orderBy: { uploadedAt: "desc" },
    });
    return rows.map(toFileMetadata);
  }
}

function toFileMetadata(row: any): FileMetadata {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    storageKey: row.storageKey,
    storageKind: row.storageKind,
    status: row.status,
    uploadedBy: row.uploadedBy,
    uploadedAt: row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : row.uploadedAt,
  };
}

export const fileService = new FileService();
export { FileService };
