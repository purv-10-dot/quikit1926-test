import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  buildDocImageKey,
  buildDocFileKey,
  isAllowedImageType,
  isAllowedFileType,
  MAX_IMAGE_BYTES,
  MAX_FILE_BYTES,
  ALLOWED_FILE_LABEL,
  putObject,
} from "@/lib/storage";

// Force the Node.js runtime (default for app-router but explicit here so
// streaming the upload to Cloud Storage doesn't accidentally land on Edge).
export const runtime = "nodejs";

/**
 * POST /api/docs/upload — multipart form upload that pushes an image to
 * Cloud Storage under a tenant-scoped key and returns a stable proxy URL the editor can
 * embed directly. The proxy URL never expires; /api/docs/asset signs a
 * fresh GET on every request.
 *
 * Form fields:
 *   - file       (required) the image
 *   - projectId  (required) used purely as a path component for organization
 */

/** Duck-typed Blob check — global File doesn't exist in Node 18, and the
 *  shape of what `formData.get()` returns for a file is a Blob with extra
 *  `name` + `lastModified` fields. We trust any Blob-like with arrayBuffer. */
function isBlobLike(x: unknown): x is Blob & { name?: string } {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as { arrayBuffer?: unknown }).arrayBuffer === "function" &&
    typeof (x as { size?: unknown }).size === "number" &&
    typeof (x as { type?: unknown }).type === "string"
  );
}

export const POST = withOrgAuth(async (ctx, req) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid form data";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  const file = form.get("file");
  const projectId = String(form.get("projectId") ?? "").trim();

  if (!projectId) {
    return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  }
  if (!isBlobLike(file)) {
    return NextResponse.json({ success: false, error: "file required" }, { status: 400 });
  }

  // Two accepted shapes: an inline image (existing behaviour, 8 MB cap) or a
  // downloadable attachment (PDF/CSV/Office/ZIP, 25 MB cap). Anything else 415s.
  const type = file.type;
  const fileName = (file.name && String(file.name).trim()) || "file";
  const isImage = isAllowedImageType(type);
  const isFile = isAllowedFileType(type);
  if (!isImage && !isFile) {
    return NextResponse.json(
      {
        success: false,
        error: `Unsupported file type${type ? `: ${type}` : ""}. Allowed: ${ALLOWED_FILE_LABEL}.`,
      },
      { status: 415 },
    );
  }
  const cap = isImage ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (file.size > cap) {
    return NextResponse.json(
      { success: false, error: `File too large (max ${cap / 1024 / 1024} MB).` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const key = isImage
    ? buildDocImageKey(ctx.orgId, projectId, type)
    : buildDocFileKey(ctx.orgId, projectId, fileName);
  try {
    await putObject(key, buf, type);
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : "Upload failed";
    // The GCS client surfaces cryptic auth/network errors (e.g. "Premature
    // close" when the OAuth token fetch to googleapis.com is dropped — usually
    // a proxy/firewall or a wrong system clock breaking TLS cert validation).
    // Map those to something actionable; keep the raw message for genuine
    // storage errors.
    const networky = /premature close|oauth2\/v4\/token|ENOTFOUND|ECONNRESET|ETIMEDOUT|getaddrinfo|certificate|self.signed|socket hang up/i.test(
      raw,
    );
    const friendly = /GCS not configured/i.test(raw)
      ? raw
      : networky
        ? "Couldn't reach file storage. Check the connection to Google Cloud Storage (proxy/firewall) and that the system clock is set to the correct date."
        : raw;
    return NextResponse.json({ success: false, error: friendly }, { status: 502 });
  }

  const url = `/api/docs/asset?key=${encodeURIComponent(key)}`;
  return NextResponse.json(
    { success: true, data: { key, url, fileName, mimeType: type, size: file.size } },
    { status: 201 },
  );
});
