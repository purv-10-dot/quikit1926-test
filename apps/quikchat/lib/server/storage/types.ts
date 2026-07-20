/**
 * Storage driver seam. The client upload flow (sign → PUT → send-message) is
 * identical across drivers; only the server side differs. This interface maps to
 * the QuikIT platform storage util at merge — keep it swappable.
 */

export interface UploadTargetInput {
  orgId: string;
  channelId: string;
  userId: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface UploadTarget {
  /** Where the browser PUTs the bytes (a signed GCS URL, or the local proxy). */
  uploadUrl: string;
  method: "PUT";
  /** Headers the browser MUST send on the PUT (e.g. Content-Type). */
  headers: Record<string, string>;
  /** Org-scoped, unguessable storage key — stored on the Media message. */
  objectPath: string;
  maxBytes: number;
  expiresAt: string;
}

export interface StorageDriver {
  /** Mint a short-lived, tightly-scoped upload target for one object. */
  createUploadTarget(input: UploadTargetInput): Promise<UploadTarget>;
  /** Mint a short-lived download URL for a stored object (authorized reader only). */
  createDownloadUrl(
    objectPath: string,
    opts?: { downloadName?: string; contentType?: string },
  ): Promise<string>;
  /** Optional best-effort delete. */
  delete?(objectPath: string): Promise<void>;
}

/** Media types we accept for upload — images, video, audio, common docs. */
export const ALLOWED_UPLOAD_TYPES: readonly string[] = [
  // images
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // video
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // audio
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  // docs
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
];

export function isAllowedUploadType(contentType: string): boolean {
  return ALLOWED_UPLOAD_TYPES.includes(contentType);
}

/**
 * Media that should render inline (previewed in-app) vs download as a file.
 * PDFs are inline so the lightbox iframe renders them instead of the browser
 * force-downloading via `Content-Disposition: attachment` (S-chat-fixes-2).
 */
export function isInlineType(contentType: string | undefined): boolean {
  return (
    !!contentType &&
    (contentType.startsWith("image/") ||
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/") ||
      contentType === "application/pdf")
  );
}

/** Max upload size (bytes). Mirror this client-side for instant feedback. */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

/** The `data` payload a client stores on a `Media` message. */
export interface MediaMeta {
  objectPath: string;
  mediaType: string;
  originalName: string;
  size: number;
}

/** Build the org-scoped object key. `uuid` keeps it unguessable. */
export function buildObjectPath(
  orgId: string,
  channelId: string,
  uuid: string,
  filename: string,
): string {
  return `quikchat/${orgId}/${channelId}/${uuid}-${safeFilename(filename)}`;
}

/** Strip path separators / control chars; cap length. Never trusts client names. */
export function safeFilename(name: string): string {
  const base = (name || "file")
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "")
    .slice(0, 80);
  return base || "file";
}
