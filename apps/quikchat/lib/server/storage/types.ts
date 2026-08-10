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
  "audio/mp4", // Safari's MediaRecorder output for voice notes
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  // docs
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
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
 * Known-safe code/text file extensions admitted when the browser reports an
 * empty or generic-binary MIME (the common case for source files — a `.py` or
 * `.ts` often arrives as `""` or `application/octet-stream`). Active-content
 * types that execute if a browser is ever coaxed into rendering them inline
 * (`.html`, `.svg`) are deliberately EXCLUDED — those must arrive under an
 * allowlisted MIME or not at all.
 */
export const ALLOWED_CODE_EXTENSIONS: readonly string[] = [
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".cs",
  ".php",
  ".sh",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".sql",
  ".css",
];

/** Lowercased file extension including the dot (e.g. `.py`), or `""` if none. */
export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLowerCase();
}

/**
 * MIME values that carry no useful type signal — the browser couldn't classify
 * the file. Only for these do we fall back to an extension check.
 */
function isGenericMime(contentType: string): boolean {
  return contentType === "" || contentType === "application/octet-stream";
}

/**
 * The full upload gate: an allowlisted MIME, OR — when the MIME is empty/generic
 * — a known-safe code extension. BOTH the client (`validateFile`) and the server
 * (`POST /api/uploads/sign`) route through this, so a crafted request that skips
 * the client guard is still rejected server-side.
 */
export function isAllowedUpload(contentType: string, filename: string): boolean {
  if (isAllowedUploadType(contentType)) return true;
  if (isGenericMime(contentType)) {
    return ALLOWED_CODE_EXTENSIONS.includes(fileExtension(filename));
  }
  return false;
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
  /**
   * Voice notes only: the recorder's measured length in whole seconds. Set from
   * `useVoiceRecorder` (never sniffed from the container) and persisted on the
   * message `data` so the duration survives a reload — a plain audio *attachment*
   * leaves it undefined. Session 2's custom player reads this.
   */
  durationSec?: number;
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
