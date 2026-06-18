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
export async function uploadProjectImage(projectId: string, file: File): Promise<string> {
  if (!projectId) {
    throw new Error("Select a space before adding images.");
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("projectId", projectId);
  const res = await fetch(`/api/docs/upload`, { method: "POST", body: fd });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.success) {
    throw new Error(j?.error || `Upload failed (${res.status})`);
  }
  return j.data.url as string;
}
