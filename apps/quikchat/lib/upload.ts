/**
 * Client upload flow. Driver-agnostic by design: it ALWAYS does sign → PUT →
 * (caller sends the Media message). The PUT target + headers come from the sign
 * response, so local and GCS are identical here.
 */
import { signUploadApi } from "./api";
import { ALLOWED_UPLOAD_TYPES, UPLOAD_MAX_BYTES, type MediaMeta } from "@/lib/server/storage/types";

export { UPLOAD_MAX_BYTES };

export type MediaKind = "image" | "video" | "audio" | "file";

export function mediaKind(contentType: string | undefined): MediaKind {
  if (contentType?.startsWith("image/")) return "image";
  if (contentType?.startsWith("video/")) return "video";
  if (contentType?.startsWith("audio/")) return "audio";
  return "file";
}

/** Client-side guard mirroring the server allowlist/size for instant feedback. */
export function validateFile(file: { type: string; size: number; name: string }): string | null {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return "That file type isn't supported.";
  if (file.size > UPLOAD_MAX_BYTES) {
    return `File is too large (max ${Math.floor(UPLOAD_MAX_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}

/** PUT the bytes to the (signed) target with upload progress. */
export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    if (xhr.upload) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.send(file);
  });
}

/**
 * Full client upload: validate → sign → PUT. Returns the `MediaMeta` to store on
 * the `Media` message. Throws on validation/sign/PUT failure (caller toasts).
 */
export async function uploadFile(
  file: File,
  channelId: string,
  onProgress?: (fraction: number) => void,
): Promise<MediaMeta> {
  const err = validateFile(file);
  if (err) throw new Error(err);
  const target = await signUploadApi({
    channelId,
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  await putWithProgress(target.uploadUrl, target.headers, file, onProgress);
  return {
    objectPath: target.objectPath,
    mediaType: file.type,
    originalName: file.name,
    size: file.size,
  };
}
