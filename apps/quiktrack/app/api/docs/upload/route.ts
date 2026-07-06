import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  buildDocImageKey,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
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
  if (!isAllowedImageType(file.type)) {
    return NextResponse.json(
      { success: false, error: `Unsupported image type: ${file.type}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { success: false, error: `File too large (max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const key = buildDocImageKey(ctx.orgId, projectId, file.type);
  try {
    await putObject(key, buf, file.type);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  const url = `/api/docs/asset?key=${encodeURIComponent(key)}`;
  return NextResponse.json({ success: true, data: { key, url } }, { status: 201 });
});
