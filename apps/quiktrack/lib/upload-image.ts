/**
 * Upload an image to project-scoped storage and return a stable proxy URL
 * (`/api/docs/asset?key=…`, which never expires — it signs a fresh GET per
 * request). This is the same pipeline the docs editor uses.
 *
 * Why this exists: the rich-text editor inlines images as base64 data URIs
 * when no uploader is wired. A single screenshot easily exceeds the issue
 * description's 50,000-character limit, so the PATCH/POST fails with
 * "string must contain at most 50000 character(s)". Routing images through
 * here keeps the stored HTML to a small `<img src="/api/docs/asset?…">`.
 */
// Client-side caps — kept in sync with the server's limits in lib/storage.ts
// (MAX_IMAGE_BYTES / MAX_FILE_BYTES). Validating here means an oversized file
// never leaves the browser, so the user gets a clear message instead of a raw
// 413 after a slow upload. `lib/storage.ts` is server-only (GCS), so we mirror
// the numbers rather than import them into client code.
const MAX_IMAGE_MB = 8;
const MAX_FILE_MB = 25;
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

function sizeMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/**
 * Turn an upload Response into a friendly Error message. A 413 (payload too
 * large) becomes a clear size message; other failures fall back to the server's
 * error text.
 */
async function uploadError(res: Response, limitMb: number, kind: "image" | "file"): Promise<Error> {
  if (res.status === 413) {
    return new Error(
      `${kind === "image" ? "Image" : "File"} upload failed — it exceeds the maximum allowed size of ${limitMb} MB. Please choose a smaller ${kind}.`,
    );
  }
  const j = await res.json().catch(() => null);
  return new Error(j?.error || `Upload failed (${res.status})`);
}

export async function uploadProjectImage(projectId: string, file: File): Promise<string> {
  if (!projectId) {
    throw new Error("Select a space before adding images.");
  }
  // Validate size before uploading — friendlier and faster than a 413 round-trip.
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image upload failed — the selected image is ${sizeMb(file.size)} MB, which exceeds the maximum allowed size of ${MAX_IMAGE_MB} MB. Please upload an image smaller than ${MAX_IMAGE_MB} MB.`,
    );
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectId", projectId);
  const res = await fetch(`/api/docs/upload`, { method: "POST", body: fd });
  if (!res.ok) throw await uploadError(res, MAX_IMAGE_MB, "image");
  const j = await res.json().catch(() => null);
  if (!j?.success) {
    throw new Error(j?.error || `Upload failed (${res.status})`);
  }
  return j.data.url as string;
}

/** Metadata for an uploaded (non-image) file attachment. */
export interface UploadedFile {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * Upload an arbitrary allowed file (PDF/CSV/Office/ZIP/image) to project-scoped
 * storage and return its download URL + metadata for the editor's attachment
 * chip. Throws with the server's message (unsupported type / too large) so the
 * caller can surface it to the user.
 */
export async function uploadProjectFile(projectId: string, file: File): Promise<UploadedFile> {
  if (!projectId) {
    throw new Error("Select a space before attaching files.");
  }
  // Images attached as files still count as images on the server (8 MB cap);
  // everything else uses the 25 MB file cap. Match that so the pre-check message
  // is accurate.
  const isImage = file.type.startsWith("image/");
  const limitBytes = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  const limitMb = isImage ? MAX_IMAGE_MB : MAX_FILE_MB;
  if (file.size > limitBytes) {
    throw new Error(
      `Upload failed — "${file.name}" is ${sizeMb(file.size)} MB, which exceeds the maximum allowed size of ${limitMb} MB. Please choose a file smaller than ${limitMb} MB.`,
    );
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectId", projectId);
  const res = await fetch(`/api/docs/upload`, { method: "POST", body: fd });
  if (!res.ok) throw await uploadError(res, limitMb, isImage ? "image" : "file");
  const j = await res.json().catch(() => null);
  if (!j?.success) {
    throw new Error(j?.error || `Upload failed (${res.status})`);
  }
  return {
    url: j.data.url as string,
    fileName: (j.data.fileName as string) || file.name || "file",
    mimeType: (j.data.mimeType as string) || file.type,
    size: typeof j.data.size === "number" ? j.data.size : file.size,
  };
}
