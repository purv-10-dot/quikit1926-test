// ─── Re-export the driver-based file service ───────────────────────
//
// The driver-based file service in `src/lib/storage/` (presigned-PUT
// flow + metadata table) is used by /api/files/*, /api/uploads, and
// DPR. It lives behind the `@/lib/storage` import so route handlers
// don't need to know which path map entry they're hitting.
export {
  getStorageDriver,
  resetStorageDriver,
  GcsDriver,
  fileService,
  FileService,
  FileError,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from "../src/lib/storage";
export type {
  StorageDriver,
  PresignedUploadUrl,
  PresignedDownloadUrl,
  AttachmentEntityType,
  UploadInitResult,
} from "../src/lib/storage";
