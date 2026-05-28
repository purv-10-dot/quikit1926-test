/**
 * MIME type allowlist + size caps for file uploads.
 *
 * Per-entity caps override the default cap. Update entity-specific entries
 * when the domain requires it (e.g. BOQ Excel can be 50 MB, safety photos
 * cap at 10 MB).
 */

export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILE_SIZE_BYTES = DEFAULT_MAX_FILE_SIZE_BYTES;

/** Project document register uploads (drawings, contracts, NOCs). */
export const PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

/** Global MIME allowlist. Every upload must match at least one entry. */
export const ALLOWED_MIME_TYPES: Set<string> = new Set([
  // Office documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/csv",
  "text/plain",
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // CAD / drawings — only the common ones; add more as needed
  "application/acad",
  "application/dxf",
  // Archives (useful for BOQ workbooks bundled with backing files)
  "application/zip",
]);

/** Per-entity overrides — takes precedence over DEFAULT_MAX_FILE_SIZE_BYTES. */
export const ENTITY_SIZE_CAPS: Record<string, number> = {
  boq_import: 50 * 1024 * 1024, // 50 MB — large workbooks
  project_document: PROJECT_DOCUMENT_MAX_FILE_SIZE_BYTES,
  quality_inspection: 15 * 1024 * 1024,
  safety_incident: 15 * 1024 * 1024,
};

export interface ValidationResult {
  ok: boolean;
  error?: string;
  code?: string;
}

export function validateUpload(params: {
  entityType: string;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}): ValidationResult {
  const { entityType, mimeType, sizeBytes, fileName } = params;

  if (!fileName || fileName.length > 512) {
    return { ok: false, error: "Invalid fileName", code: "INVALID_FILENAME" };
  }

  // Strip path separators defensively — someone somewhere will send a full path
  if (/[\\/]/.test(fileName)) {
    return {
      ok: false,
      error: "fileName cannot contain path separators",
      code: "INVALID_FILENAME",
    };
  }

  if (!mimeType) {
    return { ok: false, error: "mimeType is required", code: "MISSING_MIME" };
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      error: `MIME type ${mimeType} is not allowed`,
      code: "MIME_NOT_ALLOWED",
    };
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "sizeBytes must be a positive integer", code: "INVALID_SIZE" };
  }

  const cap = ENTITY_SIZE_CAPS[entityType] ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  if (sizeBytes > cap) {
    return {
      ok: false,
      error: `File exceeds ${Math.round(cap / (1024 * 1024))} MB limit for ${entityType}`,
      code: "FILE_TOO_LARGE",
    };
  }

  return { ok: true };
}
