import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { getObject } from "@/lib/storage";

// Stored object keys, all shaped `<prefix>/<orgId>/…/<file>.<ext>` so the
// tenant segment is always index [1] (see the various upload routes):
//   uploads/<orgId>/<uuid>.<ext>                              (generic uploads)
//   candidate-docs/<orgId>/<requestId>/<uuid>.<ext>           (candidate docs)
//   tenants/<orgId>/leave-policies/<policyId>/<file>.<ext>    (leave policies)
// Allow a known prefix, the org segment, any nested segments, then a filename.
const KEY_PATTERN = /^(uploads|candidate-docs|tenants)\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z0-9]{2,8}$/;

/**
 * GET /api/v1/hrms/uploads/proxy?key=...
 *
 * Streams a stored object back to the browser. Auth-guarded AND tenant-scoped:
 * the key's tenant segment must match the caller's tenant, so one tenant can
 * never fetch another tenant's files by guessing/leaking a key (was previously
 * an open, unauthenticated endpoint).
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ success: false, error: { code: "VALIDATION_FAILED", message: "key required" } }, { status: 400 });
  }
  if (!KEY_PATTERN.test(key)) {
    return NextResponse.json({ success: false, error: { code: "INVALID_KEY", message: "Invalid key format" } }, { status: 400 });
  }
  // Tenant isolation: `uploads/<orgId>/...` — only your own tenant's objects.
  if (key.split("/")[1] !== ctx.orgId) {
    return NextResponse.json({ success: false, error: { code: "FORBIDDEN", message: "Not allowed" } }, { status: 403 });
  }

  try {
    const obj = await getObject(key);
    const headers: Record<string, string> = {
      "Content-Type": obj.contentType,
      "Content-Length": String(obj.length),
      "Cache-Control": "private, max-age=3600",
    };
    // `?dl=1` forces a download instead of inline preview. Optional `?name=`
    // supplies a friendly filename; falls back to the stored object's basename.
    if (searchParams.get("dl")) {
      const fallback = key.split("/").pop() || "download";
      const filename = (searchParams.get("name") || fallback).replace(/["\\\r\n]/g, "");
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }
    return new NextResponse(new Uint8Array(obj.body), { status: 200, headers });
  } catch (err) {
    console.error("GET /uploads/proxy error:", err);
    return NextResponse.json({ success: false, error: { code: "NOT_FOUND", message: "Object not found" } }, { status: 404 });
  }
});
