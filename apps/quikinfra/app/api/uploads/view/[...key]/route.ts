import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { getStorageDriver } from "@/lib/storage";

/**
 * Attachment viewer.
 *
 * Records persist a stable `/api/uploads/view/<objectKey>` URL (written
 * by app/api/uploads/route.ts). S3 objects aren't public and presigned
 * URLs expire, so this route resolves the key to a fresh presigned GET
 * URL on every request and redirects the browser to it. No filename
 * disposition is set, so images / PDFs open inline in a new tab rather
 * than force-downloading.
 *
 * Tenant isolation: the key layout is `uploads/<tenant>/<yyyy-mm>/<file>`
 * — a caller may only view objects under their own tenant segment.
 */

function sanitizeSegment(s: string): string {
  return String(s).replace(/[^A-Za-z0-9_-]+/g, "_") || "tenant";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { key: string[] } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const segments = params.key ?? [];
  // Expected: uploads/<tenant>/<yyyy-mm>/<file>
  if (segments.length < 4 || segments[0] !== "uploads") {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  if (segments[1] !== sanitizeSegment(ctx.orgId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const key = segments.join("/");
  const driver = getStorageDriver();

  const head = await driver.headObject(key);
  if (!head.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { url } = await driver.getPresignedDownloadUrl({ key });
  return NextResponse.redirect(url);
}
